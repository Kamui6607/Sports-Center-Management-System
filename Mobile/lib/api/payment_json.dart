import '../core/config/env.dart';
import '../core/error/app_failure.dart';
import '../core/network/json.dart';
import '../features/payments/domain/entities/payment.dart';

/// Ánh xạ "SePay checkout view" của BE (`POST /payments/sepay/checkout`,
/// `POST /products/orders`, `GET /payments/sepay/:id`, body lỗi 409 `SEPAY_PAYMENT_PENDING`).
abstract final class PaymentJson {
  static Checkout checkout(Json j, {String? title, int? quantity, int? enrolledSessionCount}) {
    final bank = j.obj('bank');
    final classInfo = j.objOrNull('classInfo');
    final order = j.objOrNull('order');
    final orderId = j.strOrNull('orderId') ?? order?.strOrNull('id');
    final classId = j.strOrNull('classId') ?? classInfo?.strOrNull('id');
    final items = order?.objList('items') ?? const <Json>[];
    final itemsTitle = items.map((i) => i.str('productName')).where((n) => n.isNotEmpty).join(', ');
    final createdAt = j.dateOrNull('createdAt');
    return Checkout(
      paymentId: j.str('paymentId'),
      orderCode: j.str('orderCode'),
      amount: j.money('amount'),
      status: j.enumOr('status', PaymentStatus.values, PaymentStatus.pending),
      purpose: orderId != null ? CheckoutPurpose.product : CheckoutPurpose.course,
      expiresAt:
          j.dateOrNull('expiresAt') ?? (createdAt ?? DateTime.now()).add(const Duration(minutes: Env.sepayTtlMinutes)),
      transferContent: j.str('transferContent', j.str('orderCode')),
      qrUrl: j.str('qrUrl'),
      bank: BankAccount(
        bankId: bank.str('id'),
        // BE chỉ trả mã/tên viết tắt ngân hàng (VD "MBBank").
        bankName: bank.str('id'),
        accountNumber: bank.str('accountNumber'),
        accountHolder: bank.str('accountHolder'),
      ),
      title: title ?? classInfo?.strOrNull('name') ?? (itemsTitle.isEmpty ? 'Đơn hàng' : itemsTitle),
      classId: classId,
      productOrderId: orderId,
      quantity: quantity ?? (items.isEmpty ? null : items.fold<int>(0, (s, i) => s + i.integer('quantity'))),
      paidAt: j.dateOrNull('paidAt'),
      enrolledSessionCount: enrolledSessionCount,
      // L6: "Chi tiết thanh toán" dựng từ chính giao dịch (BE đã bỏ bảng Invoice).
      invoiceId: j.str('status') == 'SUCCESS' ? j.strOrNull('paymentId') : null,
    );
  }

  /// BE-6: một giao dịch của `GET /payments/my` ⇒ "Chi tiết thanh toán" (thay hóa đơn).
  static Invoice invoice(Json p) {
    final items = p.objList('items');
    final isOrder = p.str('type') == 'ORDER';
    final lines = [
      for (final i in items)
        InvoiceLine(
          name: i.str('productName'),
          quantity: i.integer('quantity'),
          unitPrice: i.money('unitPrice'),
          total: i.money('totalAmount'),
        ),
    ];
    final total = p.money('amount');
    return Invoice(
      id: p.str('id'),
      invoiceNumber: p.str('transactionCode', p.str('id')),
      status: p.str('status') == 'REFUNDED' ? InvoiceStatus.cancelled : InvoiceStatus.issued,
      issuedAt: p.dateOrNull('paidAt') ?? p.date('createdAt'),
      purpose: isOrder ? CheckoutPurpose.product : CheckoutPurpose.course,
      itemName: isOrder ? lines.map((l) => l.name).join(', ') : p.str('className', 'Khóa học'),
      subtotal: total,
      discount: 0,
      total: total,
      paymentMethod: p.enumOr('method', PaymentMethod.values, PaymentMethod.sepay),
      quantity: lines.length == 1 ? lines.first.quantity : null,
      transactionCode: p.strOrNull('transactionCode'),
      paidAt: p.dateOrNull('paidAt'),
      lines: lines,
      refundedAmount: p.money('refundedAmount'),
    );
  }

  /// Mã lỗi BE khi đã có giao dịch chờ chuyển khoản cho cùng khóa/sản phẩm.
  static const pendingCode = 'SEPAY_PAYMENT_PENDING';

  /// Body lỗi 409 `SEPAY_PAYMENT_PENDING` chứa "checkout view" của giao dịch đang chờ
  /// ⇒ mở lại QR cũ thay vì báo lỗi.
  static Checkout? pendingCheckout(AppFailure f) {
    if (f.code != pendingCode) return null;
    final details = asJson(f.details);
    if (details.strOrNull('paymentId') == null) return null;
    return checkout(details);
  }
}
