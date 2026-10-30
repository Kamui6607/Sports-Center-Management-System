import '../core/config/env.dart';
import '../core/error/app_failure.dart';
import '../core/network/json.dart';
import '../core/utils/vn_time.dart';
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
    // Mua gói thành viên: không có classId/orderId; tên gói ở `membership.planName` (polling) hoặc `planName` (tạo đơn).
    final planName = j.objOrNull('membership')?.strOrNull('planName') ?? j.strOrNull('planName');
    return Checkout(
      paymentId: j.str('paymentId'),
      orderCode: j.str('orderCode'),
      amount: j.money('amount'),
      status: j.enumOr('status', PaymentStatus.values, PaymentStatus.pending),
      purpose: orderId != null
          ? CheckoutPurpose.product
          : planName != null
          ? CheckoutPurpose.membership
          : CheckoutPurpose.course,
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
      title: title ?? planName ?? classInfo?.strOrNull('name') ?? (itemsTitle.isEmpty ? 'Đơn hàng' : itemsTitle),
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
    final isMembership = p.str('type') == 'MEMBERSHIP';
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
      purpose: isOrder
          ? CheckoutPurpose.product
          : isMembership
          ? CheckoutPurpose.membership
          : CheckoutPurpose.course,
      itemName: isOrder
          ? lines.map((l) => l.name).join(', ')
          : isMembership
          ? p.str('membershipPlanName', 'Gói thành viên')
          : p.str('className', 'Khóa học'),
      // BE trả bảng tính theo ảnh chụp lúc mua: tạm tính − giảm + phí giao hàng = tổng.
      subtotal: p.intOrNull('subtotal') ?? total,
      discount: p.money('discount'),
      shippingFee: p.money('shippingFee'),
      isPickup: p.str('fulfillmentType') == 'PICKUP',
      total: total,
      paymentMethod: p.enumOr('method', PaymentMethod.values, PaymentMethod.sepay),
      quantity: lines.length == 1 ? lines.first.quantity : null,
      transactionCode: p.strOrNull('transactionCode'),
      paidAt: p.dateOrNull('paidAt'),
      lines: lines,
      refundedAmount: p.money('refundedAmount'),
    );
  }

  /// Hóa đơn chi tiết `GET /payments/my/:id/invoice` (BE dựng từ ảnh chụp lúc mua).
  static Invoice invoiceDetail(Json j) {
    final kind = j.str('kind');
    final seller = j.objOrNull('seller');
    final buyer = j.objOrNull('buyer');
    final membership = j.objOrNull('membership');
    final course = j.objOrNull('course');
    final lines = [
      for (final l in j.objList('lines'))
        InvoiceLine(
          name: l.str('name'),
          description: l.strOrNull('description'),
          unit: l.str('unit', 'cái'),
          quantity: l.integer('quantity', 1),
          unitPrice: l.money('unitPrice'),
          total: l.money('amount'),
        ),
    ];
    final from = membership?.dateOrNull('startDate') ?? course?.dateOrNull('startDate');
    final to = membership?.dateOrNull('endDate') ?? course?.dateOrNull('endDate');
    return Invoice(
      id: j.str('id'),
      invoiceNumber: j.str('invoiceNumber'),
      status: j.str('status') == 'REFUNDED' ? InvoiceStatus.cancelled : InvoiceStatus.issued,
      statusLabel: j.strOrNull('statusLabel'),
      issuedAt: j.dateOrNull('paidAt') ?? j.date('createdAt'),
      purpose: kind == 'ORDER'
          ? CheckoutPurpose.product
          : kind == 'MEMBERSHIP'
          ? CheckoutPurpose.membership
          : CheckoutPurpose.course,
      itemName: lines.isEmpty ? 'Giao dịch' : lines.map((l) => l.name).join(', '),
      subtotal: j.money('subtotal'),
      discount: j.money('discount'),
      discountLabel: j.strOrNull('discountLabel'),
      shippingFee: j.money('shippingFee'),
      total: j.money('total'),
      paymentMethod: j.enumOr('method', PaymentMethod.values, PaymentMethod.sepay),
      memberName: buyer?.strOrNull('fullName'),
      transactionCode: j.strOrNull('gatewayTransId') ?? j.strOrNull('transactionCode'),
      paidAt: j.dateOrNull('paidAt'),
      lines: lines,
      refundedAmount: j.money('refundedAmount'),
      pendingRefundAmount: j.money('pendingRefundAmount'),
      isPickup: j.objOrNull('order')?.str('fulfillmentType') == 'PICKUP',
      orderStatus: j.objOrNull('order')?.strOrNull('status'),
      orderId: j.objOrNull('order')?.strOrNull('id'),
      seller: seller == null
          ? null
          : InvoiceParty(
              name: seller.str('name'),
              address: seller.strOrNull('address'),
              phone: seller.strOrNull('hotline'),
              email: seller.strOrNull('email'),
            ),
      buyer: buyer == null
          ? null
          : InvoiceParty(name: buyer.str('fullName'), phone: buyer.strOrNull('phone'), email: buyer.strOrNull('email')),
      periodLabel: from != null && to != null ? '${VnTime.date(from)} – ${VnTime.date(to)}' : null,
      refunds: [
        for (final r in j.objList('refunds'))
          InvoiceRefund(
            reasonLabel: r.str('reasonLabel'),
            amount: r.money('amount'),
            statusLabel: r.str('statusLabel'),
            completed: r.str('status') == 'COMPLETED',
            createdAt: r.date('createdAt'),
            processedAt: r.dateOrNull('processedAt'),
          ),
      ],
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
