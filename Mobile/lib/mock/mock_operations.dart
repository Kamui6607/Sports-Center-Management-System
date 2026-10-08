import '../core/config/env.dart';
import '../features/auth/domain/entities/app_user.dart';
import '../features/coach/domain/entities/wallet.dart';
import '../features/notifications/domain/entities/app_notification.dart';
import '../features/payments/domain/entities/payment.dart';
import '../features/products/domain/entities/product.dart';
import '../features/refunds/domain/entities/refund.dart';
import '../features/schedule/domain/entities/session.dart';
import 'mock_database.dart';
import 'mock_tables.dart';

/// Thao tác nghiệp vụ dùng chung giữa nhiều repository (mô phỏng service của BE).
extension MockOperations on MockDatabase {
  /// Thông báo cho mọi tài khoản Quản lý (có việc chờ duyệt).
  void notifyManagers(String title, String body, {Map<String, String> metadata = const {}}) {
    for (final m in users.where((u) => u.role == UserRole.manager)) {
      notify(m.id, NotificationType.general, title, body, metadata: metadata);
    }
  }

  void notify(
    String userId,
    NotificationType type,
    String title,
    String body, {
    Map<String, String> metadata = const {},
    String? reason,
  }) {
    notifications.add(
      NotificationRow(
        id: nextId('noti'),
        userId: userId,
        type: type,
        title: title,
        body: body,
        reason: reason,
        metadata: metadata,
        createdAt: now(),
      ),
    );
  }

  PaymentRow createPendingPayment({
    required String userId,
    String? memberProfileId,
    required int amount,
    String? classId,
    String? productOrderId,
  }) {
    final p = PaymentRow(
      id: nextId('pay'),
      userId: userId,
      memberProfileId: memberProfileId,
      amount: amount,
      status: PaymentStatus.pending,
      orderCode: newOrderCode(),
      createdAt: now(),
      expiresAt: now().add(const Duration(minutes: Env.sepayTtlMinutes)),
      classId: classId,
      productOrderId: productOrderId,
    );
    payments.add(p);
    return p;
  }

  /// Hết hạn các giao dịch PENDING quá hạn: giao dịch ⇒ FAILED, đơn sản phẩm ⇒
  /// CANCELLED + hoàn kho (mô phỏng job của BE).
  void expireStalePayments() {
    final t = now();
    for (final p in payments.where((p) => p.status == PaymentStatus.pending && !t.isBefore(p.expiresAt))) {
      p.status = PaymentStatus.failed;
      final orderId = p.productOrderId;
      if (orderId != null) {
        final o = productOrders.firstWhere((o) => o.id == orderId);
        if (o.status == OrderStatus.pending) {
          o.status = OrderStatus.cancelled;
          o.cancelReason = OrderCancelReason.expired;
          products.firstWhere((x) => x.id == o.productId).stockQuantity += o.quantity;
        }
      }
    }
  }

  /// SePay xác nhận đã thu tiền ⇒ chốt giao dịch (mô phỏng webhook BE).
  void settlePayment(String paymentId) {
    final p = payments.firstWhere((x) => x.id == paymentId);
    if (p.status != PaymentStatus.pending) return;
    p
      ..status = PaymentStatus.success
      ..paidAt = now();
    final buyer = user(p.userId);
    final classId = p.classId;
    final orderId = p.productOrderId;
    if (classId != null) {
      final c = classRow(classId);
      // Tự ghi danh vào mọi buổi SCHEDULED chưa diễn ra.
      var enrolled = 0;
      for (final s in sessionsOf(
        classId,
      ).where((s) => s.status == ScheduleStatus.scheduled && s.start.isAfter(now()))) {
        final existing = enrollments
            .where((e) => e.memberProfileId == p.memberProfileId && e.sessionId == s.id)
            .firstOrNull;
        if (existing != null) {
          existing.status = EnrollmentStatus.booked;
        } else {
          enrollments.add(
            EnrollmentRow(id: nextId('enr'), memberProfileId: p.memberProfileId!, sessionId: s.id, bookedAt: now()),
          );
        }
        enrolled++;
      }
      final wallet = walletOf(c.coachProfileId);
      final share = (p.amount * MockDatabase.coachShare).round();
      wallet.balance += share;
      walletTxs.add(
        WalletTxRow(
          id: nextId('wtx'),
          walletId: wallet.id,
          amount: share,
          type: WalletTxType.deposit,
          status: WalletTxStatus.completed,
          createdAt: now(),
          classId: c.id,
          paymentId: p.id,
          note: 'Doanh thu 85% từ ${buyer.fullName}',
        ),
      );
      _issueInvoice(p, c.name, CheckoutPurpose.course, null);
      notify(
        buyer.id,
        NotificationType.paymentSuccess,
        'Thanh toán thành công',
        'Bạn đã mua khóa "${c.name}" và được ghi danh $enrolled buổi.',
        metadata: {'classId': c.id, 'paymentId': p.id},
      );
      notify(
        userOfCoach(c.coachProfileId).id,
        NotificationType.enrollmentConfirmed,
        'Học viên mới',
        '${buyer.fullName} vừa mua khóa "${c.name}".',
        metadata: {'classId': c.id},
      );
    } else if (orderId != null) {
      final o = productOrders.firstWhere((x) => x.id == orderId);
      o.status = OrderStatus.success;
      final product = products.firstWhere((x) => x.id == o.productId);
      _issueInvoice(p, product.name, CheckoutPurpose.product, o.quantity);
      notify(
        buyer.id,
        NotificationType.paymentSuccess,
        'Đơn hàng thành công',
        'Đơn ${product.name} × ${o.quantity} đã được thanh toán.',
        metadata: {'orderId': o.id, 'paymentId': p.id},
      );
    }
  }

  void _issueInvoice(PaymentRow p, String itemName, CheckoutPurpose purpose, int? quantity) {
    final count = invoices.length + 1;
    invoices.add(
      InvoiceRow(
        id: nextId('inv'),
        invoiceNumber: 'HD${VnInvoiceNumber.year(p.paidAt ?? now())}-${count.toString().padLeft(5, '0')}',
        paymentId: p.id,
        userId: p.userId,
        total: p.amount,
        issuedAt: p.paidAt ?? now(),
        itemName: itemName,
        purpose: purpose,
        memberName: user(p.userId).fullName,
        quantity: quantity,
      ),
    );
  }

  /// Tổng tiền đã hoàn (hoặc đang chờ hoàn) của một giao dịch.
  int refundedOf(String paymentId) => refunds
      .where((r) => r.paymentId == paymentId && r.status != RefundStatus.rejected)
      .fold(0, (s, r) => s + r.amount);
}

/// Định dạng năm cho số hóa đơn.
abstract final class VnInvoiceNumber {
  static String year(DateTime d) => d.toUtc().add(const Duration(hours: 7)).year.toString();
}
