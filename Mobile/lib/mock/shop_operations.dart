import 'dart:math';

import '../core/error/app_failure.dart';
import '../features/notifications/domain/entities/app_notification.dart';
import '../features/payments/domain/entities/payment.dart';
import '../features/refunds/domain/entities/refund.dart';
import '../features/shop/domain/entities/shop.dart';
import 'mock_database.dart';
import 'mock_tables.dart';

/// Mô phỏng nghiệp vụ cửa hàng của BE (`BE/src/modules/shop`) — Doc/SHOP_FLOW_DESIGN.md.
/// Cấu hình giống mặc định BE.
abstract final class MockShopConfig {
  static const holdMinutes = 15;
  static const maxPendingOrders = 2;
  static const pickupDays = 3;
  static const shippingFee = 30000;
  static const freeShippingThreshold = 500000;
  static const deliveryProvinces = ['Hồ Chí Minh'];
  static const expireLockThreshold = 3;
  static const expireLockHours = 24;
  static const autoCompleteDays = 3;
  static const pickupMaxAttempts = 5;
  static const pickupLockMinutes = 15;
}

const _transitions = <ShopOrderStatus, List<ShopOrderStatus>>{
  ShopOrderStatus.pendingPayment: [ShopOrderStatus.paid, ShopOrderStatus.expired, ShopOrderStatus.cancelled],
  ShopOrderStatus.paid: [ShopOrderStatus.readyForPickup, ShopOrderStatus.processing, ShopOrderStatus.refundRequested],
  ShopOrderStatus.processing: [ShopOrderStatus.shipping, ShopOrderStatus.refundRequested],
  ShopOrderStatus.readyForPickup: [
    ShopOrderStatus.completed,
    ShopOrderStatus.notPickedUp,
    ShopOrderStatus.refundRequested,
  ],
  ShopOrderStatus.shipping: [ShopOrderStatus.delivered],
  ShopOrderStatus.delivered: [ShopOrderStatus.completed],
  ShopOrderStatus.notPickedUp: [ShopOrderStatus.refunded],
  ShopOrderStatus.refundRequested: [
    ShopOrderStatus.refunded,
    ShopOrderStatus.paid,
    ShopOrderStatus.processing,
    ShopOrderStatus.readyForPickup,
  ],
};

/// Chuyển Manager được bấm trực tiếp (giống `MANAGER_TRANSITIONS` của BE).
const mockManagerTransitions = <FulfillmentType, Map<ShopOrderStatus, List<ShopOrderStatus>>>{
  FulfillmentType.pickup: {
    ShopOrderStatus.pendingPayment: [ShopOrderStatus.cancelled],
    ShopOrderStatus.paid: [ShopOrderStatus.readyForPickup, ShopOrderStatus.refundRequested],
    ShopOrderStatus.readyForPickup: [ShopOrderStatus.notPickedUp, ShopOrderStatus.refundRequested],
  },
  FulfillmentType.delivery: {
    ShopOrderStatus.pendingPayment: [ShopOrderStatus.cancelled],
    ShopOrderStatus.paid: [ShopOrderStatus.processing, ShopOrderStatus.refundRequested],
    ShopOrderStatus.processing: [ShopOrderStatus.shipping, ShopOrderStatus.refundRequested],
    ShopOrderStatus.shipping: [ShopOrderStatus.delivered],
    ShopOrderStatus.delivered: [ShopOrderStatus.completed],
  },
};

const _codeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
final _random = Random();

String _randomCode(int length) => List.generate(length, (_) => _codeAlphabet[_random.nextInt(32)]).join();

extension MockShopOperations on MockDatabase {
  String newShopOrderCode() {
    final d = now();
    String two(int v) => v.toString().padLeft(2, '0');
    return 'DH${two(d.year % 100)}${two(d.month)}${two(d.day)}-${_randomCode(6)}';
  }

  String newPickupCode() => _randomCode(8);

  ProductRow product(String id) => products.firstWhere((p) => p.id == id);

  /// Thay đổi tồn kho có điều kiện + ghi nhật ký (giống `applyInventory` của BE). `false` = không thỏa điều kiện.
  bool applyInventory(String productId, InventoryTxType type, int qty, {String? orderId, String? note}) {
    final p = product(productId);
    switch (type) {
      case InventoryTxType.inbound:
      case InventoryTxType.returned:
        p.stockQuantity += qty;
      case InventoryTxType.reserve:
        if (!p.isActive || p.available < qty) return false;
        p.reservedStock += qty;
      case InventoryTxType.release:
        p.reservedStock = max(0, p.reservedStock - qty);
      case InventoryTxType.sale:
        if (p.stockQuantity < qty) return false;
        p
          ..stockQuantity -= qty
          ..reservedStock = max(0, p.reservedStock - qty);
      case InventoryTxType.adjust:
        if (p.stockQuantity + qty < p.reservedStock) return false;
        p.stockQuantity += qty;
    }
    inventoryTxs.add(
      InventoryTxRow(
        id: nextId('itx'),
        productId: productId,
        type: type,
        quantity: qty,
        stockAfter: p.stockQuantity,
        reservedAfter: p.reservedStock,
        createdAt: now(),
        orderId: orderId,
        note: note,
      ),
    );
    return true;
  }

  /// Chuyển trạng thái hợp lệ + lịch sử + thông báo (giống `transitionOrderTx`).
  void transitionOrder(
    ShopOrderRow o,
    ShopOrderStatus to, {
    String? actorId,
    String? reason,
    String? notice,
    bool notifyBuyer = true,
  }) {
    if (!(_transitions[o.status] ?? const []).contains(to)) {
      throw const AppFailure.conflict('Không thể chuyển đơn sang trạng thái này.', code: 'ORDER_INVALID_TRANSITION');
    }
    o.history.add(OrderHistoryRow(from: o.status, to: to, at: now(), actorId: actorId, reason: reason));
    o.status = to;
    if (to == ShopOrderStatus.delivered) o.deliveredAt = now();
    if (to == ShopOrderStatus.expired) o.expiredAt = now();
    if (notifyBuyer) {
      notify(
        o.userId,
        NotificationType.orderUpdated,
        'Đơn hàng ${o.code}',
        notice ?? 'Đơn ${o.code} đã chuyển trạng thái.',
        metadata: {'orderId': o.id},
      );
    }
  }

  PaymentRow? paymentOfOrder(String orderId) => payments.where((p) => p.productOrderId == orderId).firstOrNull;

  /// Đóng đơn chờ thanh toán (hết hạn / hủy) + nhả hàng.
  void closePendingOrder(ShopOrderRow o, {required bool expired, String? actorId, String? note}) {
    final pay = paymentOfOrder(o.id);
    if (pay != null && pay.status == PaymentStatus.pending) pay.status = PaymentStatus.failed;
    o.cancelNote = expired ? null : note;
    transitionOrder(
      o,
      expired ? ShopOrderStatus.expired : ShopOrderStatus.cancelled,
      actorId: actorId,
      reason: expired ? 'Quá hạn chờ thanh toán' : (note ?? 'Hủy đơn'),
      notice: expired ? 'Đơn ${o.code} đã hết hạn thanh toán, hàng giữ đã được nhả.' : 'Đơn ${o.code} đã bị hủy.',
      notifyBuyer: actorId != o.userId,
    );
    for (final l in o.lines) {
      applyInventory(l.productId, InventoryTxType.release, l.quantity, orderId: o.id, note: 'Nhả hàng đơn ${o.code}');
    }
    if (expired) {
      final since = now().subtract(const Duration(hours: 24));
      final count = shopOrders
          .where((x) => x.userId == o.userId && x.status == ShopOrderStatus.expired && x.expiredAt!.isAfter(since))
          .length;
      if (count >= MockShopConfig.expireLockThreshold) {
        checkoutLocks[o.userId] = now().add(const Duration(hours: MockShopConfig.expireLockHours));
      }
    }
  }

  /// SePay đủ tiền ⇒ PAID + trừ hẳn tồn (SALE).
  void settleOrderPayment(PaymentRow p) {
    final o = shopOrders.firstWhere((x) => x.id == p.productOrderId);
    if (o.status != ShopOrderStatus.pendingPayment) return;
    transitionOrder(
      o,
      ShopOrderStatus.paid,
      reason: 'SePay xác nhận đã thu tiền',
      notice: 'Đơn ${o.code} đã được thanh toán.',
    );
    for (final l in o.lines) {
      applyInventory(l.productId, InventoryTxType.sale, l.quantity, orderId: o.id, note: 'Đơn ${o.code} đã thanh toán');
    }
  }

  RefundRow createOrderRefund(ShopOrderRow o, RefundReason reason, int amount, {String? note}) {
    final pay = paymentOfOrder(o.id)!;
    final row = RefundRow(
      id: nextId('rf'),
      paymentId: pay.id,
      memberProfileId: pay.memberProfileId,
      reason: reason,
      amount: amount,
      createdAt: now(),
      orderId: o.id,
      buyerUserId: o.userId,
      note: note,
    );
    refunds.add(row);
    notifyManagers('Yêu cầu hoàn tiền mới', 'Đơn ${o.code} cần hoàn tiền.', metadata: {'refundId': row.id});
    return row;
  }

  /// READY quá hạn ⇒ NOT_PICKED_UP + trả hàng + hoàn tiền 100%.
  void markNotPickedUp(ShopOrderRow o, {String? actorId}) {
    transitionOrder(
      o,
      ShopOrderStatus.notPickedUp,
      actorId: actorId,
      reason: 'Quá hạn nhận hàng tại quầy',
      notice: 'Đơn ${o.code} đã quá hạn nhận. Trung tâm sẽ hoàn tiền cho bạn.',
    );
    o.pickupCode = null;
    for (final l in o.lines) {
      applyInventory(
        l.productId,
        InventoryTxType.returned,
        l.quantity,
        orderId: o.id,
        note: 'Không đến lấy — trả lên kệ',
      );
    }
    createOrderRefund(o, RefundReason.orderNotPickedUp, o.total, note: 'Không đến lấy hàng — hoàn 100%');
  }

  void onOrderRefundApproved(RefundRow r) {
    final o = shopOrders.where((x) => x.id == r.orderId).firstOrNull;
    if (o == null) return;
    final wasRequested = o.status == ShopOrderStatus.refundRequested;
    if (o.status == ShopOrderStatus.refundRequested || o.status == ShopOrderStatus.notPickedUp) {
      transitionOrder(o, ShopOrderStatus.refunded, reason: 'Quản lý đã duyệt hoàn tiền', notifyBuyer: false);
      if (wasRequested) {
        for (final l in o.lines) {
          applyInventory(
            l.productId,
            InventoryTxType.returned,
            l.quantity,
            orderId: o.id,
            note: 'Hoàn tiền — trả về kho',
          );
        }
      }
    }
    final pay = paymentOfOrder(o.id);
    if (pay != null && pay.status == PaymentStatus.success && r.amount >= pay.amount) {
      pay.status = PaymentStatus.refunded;
    }
  }

  void onOrderRefundRejected(RefundRow r, String reason) {
    final o = shopOrders.where((x) => x.id == r.orderId).firstOrNull;
    if (o == null || o.status != ShopOrderStatus.refundRequested) return;
    final back = o.history.lastWhere((h) => h.to == ShopOrderStatus.refundRequested).from ?? ShopOrderStatus.paid;
    transitionOrder(o, back, reason: 'Từ chối hoàn tiền: $reason', notifyBuyer: false);
  }

  /// Job cửa hàng (giống `runShopMaintenance`): hết hạn, quá hạn nhận, tự hoàn tất.
  void runShopJobs() {
    final t = now();
    for (final o in shopOrders.where((o) => o.status == ShopOrderStatus.pendingPayment).toList()) {
      if (!t.isBefore(o.paymentExpiresAt)) closePendingOrder(o, expired: true);
    }
    for (final o in shopOrders.where((o) => o.status == ShopOrderStatus.readyForPickup).toList()) {
      if (o.pickupDeadline != null && !t.isBefore(o.pickupDeadline!)) markNotPickedUp(o);
    }
    for (final o in shopOrders.where((o) => o.status == ShopOrderStatus.delivered).toList()) {
      if (o.deliveredAt != null && t.difference(o.deliveredAt!).inDays >= MockShopConfig.autoCompleteDays) {
        transitionOrder(o, ShopOrderStatus.completed, reason: 'Tự động hoàn tất');
      }
    }
  }
}
