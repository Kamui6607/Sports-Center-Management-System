import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/payment.dart';

StatusLabel checkoutStatus(Checkout c, DateTime now) {
  if (c.isExpired(now)) return const StatusLabel('Hết hạn', StatusTone.neutral);
  return c.status.status;
}

extension PaymentStatusLabel on PaymentStatus {
  StatusLabel get status => switch (this) {
    PaymentStatus.pending => const StatusLabel('Chờ thanh toán', StatusTone.warning),
    PaymentStatus.success => const StatusLabel('Thành công', StatusTone.success),
    PaymentStatus.failed => const StatusLabel('Thất bại', StatusTone.danger),
    PaymentStatus.refunded => const StatusLabel('Đã hoàn tiền', StatusTone.info),
  };
}

extension PaymentMethodLabel on PaymentMethod {
  String get label => switch (this) {
    PaymentMethod.cash => 'Tiền mặt',
    PaymentMethod.bankTransfer => 'Chuyển khoản',
    PaymentMethod.sepay => 'VietQR (SePay)',
  };
}

extension InvoiceStatusLabel on InvoiceStatus {
  StatusLabel get status => switch (this) {
    InvoiceStatus.issued => const StatusLabel('Thành công', StatusTone.success),
    InvoiceStatus.cancelled => const StatusLabel('Đã hoàn tiền', StatusTone.info),
  };
}
