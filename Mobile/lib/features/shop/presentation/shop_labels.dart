import 'package:flutter/widgets.dart';

import '../../../core/error/app_failure.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/status_colors.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/shop.dart';

extension ShopOrderStatusLabel on ShopOrderStatus {
  StatusLabel get status => switch (this) {
    ShopOrderStatus.pendingPayment => const StatusLabel('Chờ thanh toán', StatusTone.warning),
    ShopOrderStatus.paid => const StatusLabel('Đã thanh toán', StatusTone.info),
    ShopOrderStatus.processing => const StatusLabel('Đang chuẩn bị', StatusTone.info),
    ShopOrderStatus.readyForPickup => const StatusLabel('Sẵn sàng nhận', StatusTone.brand),
    ShopOrderStatus.shipping => const StatusLabel('Đang giao', StatusTone.brand),
    ShopOrderStatus.delivered => const StatusLabel('Đã giao', StatusTone.success),
    ShopOrderStatus.completed => const StatusLabel('Hoàn tất', StatusTone.success),
    ShopOrderStatus.expired => const StatusLabel('Hết hạn', StatusTone.neutral),
    ShopOrderStatus.cancelled => const StatusLabel('Đã hủy', StatusTone.danger),
    ShopOrderStatus.notPickedUp => const StatusLabel('Quá hạn nhận', StatusTone.danger),
    ShopOrderStatus.refundRequested => const StatusLabel('Chờ hoàn tiền', StatusTone.warning),
    ShopOrderStatus.refunded => const StatusLabel('Đã hoàn tiền', StatusTone.neutral),
  };

  /// Nhãn nút Manager khi chuyển SANG trạng thái này.
  String get actionLabel => switch (this) {
    ShopOrderStatus.readyForPickup => 'Báo sẵn sàng nhận',
    ShopOrderStatus.processing => 'Bắt đầu chuẩn bị',
    ShopOrderStatus.shipping => 'Giao cho đơn vị vận chuyển',
    ShopOrderStatus.delivered => 'Xác nhận đã giao',
    ShopOrderStatus.completed => 'Hoàn tất đơn',
    ShopOrderStatus.cancelled => 'Hủy đơn',
    ShopOrderStatus.notPickedUp => 'Khách không đến lấy',
    ShopOrderStatus.refundRequested => 'Hủy & hoàn tiền',
    _ => status.label,
  };

  /// Chuyển "tiêu cực" (hủy / hoàn) ⇒ nút đỏ + bắt buộc lý do.
  bool get isNegative =>
      this == ShopOrderStatus.cancelled ||
      this == ShopOrderStatus.refundRequested ||
      this == ShopOrderStatus.notPickedUp;
}

extension FulfillmentTypeLabel on FulfillmentType {
  String get label => switch (this) {
    FulfillmentType.pickup => 'Nhận tại trung tâm',
    FulfillmentType.delivery => 'Giao hàng tận nơi',
  };

  IconData get icon => switch (this) {
    FulfillmentType.pickup => AppIcons.shop,
    FulfillmentType.delivery => AppIcons.truck,
  };
}

extension OrderGroupLabel on OrderGroup {
  String get label => switch (this) {
    OrderGroup.pending => 'Chờ thanh toán',
    OrderGroup.active => 'Đang xử lý',
    OrderGroup.completed => 'Hoàn tất',
    OrderGroup.closed => 'Đã hủy/hoàn',
  };
}

extension InventoryTxTypeLabel on InventoryTxType {
  String get label => switch (this) {
    InventoryTxType.inbound => 'Nhập hàng',
    InventoryTxType.reserve => 'Giữ cho đơn',
    InventoryTxType.release => 'Nhả hàng',
    InventoryTxType.sale => 'Bán',
    InventoryTxType.returned => 'Trả về kho',
    InventoryTxType.adjust => 'Điều chỉnh',
  };
}

String refundReasonLabel(String code) => switch (code) {
  'ORDER_NOT_PICKED_UP' => 'Không đến lấy hàng',
  'ORDER_LATE_PAYMENT' => 'Chuyển khoản sau khi đơn đóng',
  _ => 'Hủy đơn đã thanh toán',
};

StatusLabel refundStatusLabel(String status) => switch (status) {
  'COMPLETED' => const StatusLabel('Đã hoàn', StatusTone.success),
  'REJECTED' => const StatusLabel('Bị từ chối', StatusTone.danger),
  _ => const StatusLabel('Chờ duyệt', StatusTone.warning),
};

/// Thông điệp tiếng Việt cho mọi mã lỗi nghiệp vụ của cửa hàng (fallback: thông điệp của BE).
abstract final class ShopErrors {
  static const _byCode = {
    'OUT_OF_STOCK': 'Sản phẩm đã hết hàng.',
    'INSUFFICIENT_STOCK': 'Không đủ hàng cho số lượng bạn chọn.',
    'PRODUCT_INACTIVE': 'Sản phẩm đã ngừng bán.',
    'PRODUCT_NOT_FOUND': 'Sản phẩm không còn tồn tại.',
    'MAX_PER_ORDER_EXCEEDED': 'Vượt số lượng tối đa cho mỗi đơn.',
    'DAILY_LIMIT_EXCEEDED': 'Bạn đã đặt tối đa số lượng cho phép trong hôm nay.',
    'PRICE_CHANGED': 'Giá hoặc phí giao hàng vừa thay đổi. Vui lòng xem lại tổng tiền trước khi đặt.',
    'PENDING_ORDER_LIMIT':
        'Bạn đang có quá nhiều đơn chờ thanh toán. Hãy thanh toán hoặc hủy bớt trước khi đặt đơn mới.',
    'CHECKOUT_LOCKED': 'Bạn đã để nhiều đơn hết hạn thanh toán nên tạm thời không thể đặt hàng.',
    'CART_EMPTY': 'Chưa có sản phẩm nào để đặt.',
    'CART_FULL': 'Giỏ hàng đã đầy.',
    'ADDRESS_REQUIRED': 'Vui lòng chọn địa chỉ giao hàng.',
    'ADDRESS_NOT_FOUND': 'Không tìm thấy địa chỉ giao hàng.',
    'ADDRESS_LIMIT': 'Sổ địa chỉ đã đủ 10 địa chỉ.',
    'DELIVERY_NOT_AVAILABLE': 'Địa chỉ nằm ngoài khu vực giao hàng của trung tâm.',
    'RECIPIENT_PHONE_REQUIRED': 'Vui lòng nhập số điện thoại người nhận.',
    'IDEMPOTENCY_KEY_REUSED': 'Yêu cầu đặt hàng bị trùng. Vui lòng thử lại.',
    'ORDER_PAID_USE_REFUND': 'Đơn đã thanh toán — hãy gửi yêu cầu hoàn tiền thay vì hủy.',
    'ORDER_NOT_CANCELLABLE': 'Không thể hủy đơn ở trạng thái hiện tại.',
    'ORDER_NOT_REFUNDABLE': 'Đơn ở trạng thái này không thể yêu cầu hoàn tiền.',
    'ORDER_NOT_DELIVERED': 'Chỉ xác nhận được đơn đã giao.',
    'ORDER_STATE_CHANGED': 'Đơn hàng vừa được cập nhật. Vui lòng tải lại.',
    'ORDER_INVALID_TRANSITION': 'Không thể chuyển đơn sang trạng thái này.',
    'REFUND_ALREADY_REQUESTED': 'Đơn đã có yêu cầu hoàn tiền đang xử lý.',
    'TRACKING_CODE_REQUIRED': 'Vui lòng nhập mã vận đơn.',
    'PICKUP_CODE_INVALID': 'Mã nhận hàng không đúng hoặc đơn không chờ nhận.',
    'PICKUP_CODE_USED': 'Mã nhận hàng đã được sử dụng.',
    'PICKUP_LOCKED': 'Nhập sai quá nhiều lần — tạm khóa xác nhận đơn này 15 phút.',
    'PHONE_MISMATCH': '4 số cuối số điện thoại không khớp người nhận.',
    'ORDER_NOT_READY': 'Đơn chưa sẵn sàng để nhận.',
    'REVIEW_NOT_ALLOWED': 'Chỉ đánh giá được sản phẩm trong đơn đã hoàn tất.',
    'REVIEW_EXISTS': 'Bạn đã đánh giá sản phẩm này trong đơn.',
    'STOCK_BELOW_RESERVED': 'Không thể giảm tồn xuống dưới số đang giữ cho đơn chờ thanh toán.',
    'RATE_LIMITED': 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.',
    'SEPAY_NOT_CONFIGURED': 'Cổng thanh toán chưa sẵn sàng. Vui lòng liên hệ trung tâm.',
  };

  /// Thông điệp hiển thị: BE trả câu tiếng Việt có ngữ cảnh (tên sản phẩm, số còn lại…) ⇒ ưu tiên;
  /// chỉ dùng câu chuẩn khi BE trả thông điệp chung. Thêm thời điểm mở khóa với `CHECKOUT_LOCKED`.
  static String message(Object error) {
    final f = AppFailure.from(error);
    final code = f.code;
    final details = f.details;
    if (code == 'CHECKOUT_LOCKED' && details is Map && details['lockedUntil'] != null) {
      final until = DateTime.tryParse('${details['lockedUntil']}');
      if (until != null) return '${_byCode[code]} Mở lại lúc ${VnTime.dateTime(until.toLocal())}.';
    }
    if (code == 'PICKUP_CODE_INVALID' || code == 'PHONE_MISMATCH') {
      final left = details is Map ? details['remainingAttempts'] : null;
      if (left != null) return '${_byCode[code]} Còn $left lần thử.';
    }
    final known = code == null ? null : _byCode[code];
    if (known == null) return f.message;
    return f.message.isNotEmpty && f.message != 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại.' ? f.message : known;
  }

  static bool isPriceChanged(Object error) => AppFailure.from(error).code == 'PRICE_CHANGED';
}
