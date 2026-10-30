/// Trạng thái tiền của giao dịch (`PaymentStatus`).
enum PaymentStatus { pending, success, failed, refunded }

enum PaymentMethod { cash, bankTransfer, sepay }

/// Mục đích giao dịch: mua khóa học, đơn sản phẩm hoặc gói thành viên.
enum CheckoutPurpose { course, product, membership }

/// Tài khoản nhận tiền của trung tâm (SePay).
class BankAccount {
  const BankAccount({
    required this.bankId,
    required this.bankName,
    required this.accountNumber,
    required this.accountHolder,
  });

  final String bankId;
  final String bankName;
  final String accountNumber;
  final String accountHolder;
}

/// Giao dịch VietQR (`POST /payments/sepay/checkout`, `GET /payments/sepay/:id`).
class Checkout {
  const Checkout({
    required this.paymentId,
    required this.orderCode,
    required this.amount,
    required this.status,
    required this.purpose,
    required this.expiresAt,
    required this.transferContent,
    required this.qrUrl,
    required this.bank,
    required this.title,
    this.classId,
    this.productOrderId,
    this.quantity,
    this.paidAt,
    this.enrolledSessionCount,
    this.invoiceId,
  });

  final String paymentId;
  final String orderCode;
  final int amount;
  final PaymentStatus status;
  final CheckoutPurpose purpose;
  final DateTime expiresAt;

  /// Nội dung chuyển khoản (chứa mã đơn).
  final String transferContent;

  /// Ảnh VietQR do BE sinh.
  final String qrUrl;
  final BankAccount bank;

  /// Tên khóa học / sản phẩm.
  final String title;
  final String? classId;
  final String? productOrderId;
  final int? quantity;
  final DateTime? paidAt;

  /// Số buổi được tự ghi danh khi mua khóa thành công.
  final int? enrolledSessionCount;
  final String? invoiceId;

  bool isExpired(DateTime now) => status == PaymentStatus.pending && !now.isBefore(expiresAt);
}

enum InvoiceStatus { issued, cancelled }

/// Một dòng sản phẩm của đơn (đơn có thể nhiều dòng — L7).
class InvoiceLine {
  const InvoiceLine({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.total,
    this.unit = 'cái',
    this.description,
  });

  final String name;
  final int quantity;
  final int unitPrice;
  final int total;

  /// Đơn vị tính (khóa / gói / cái).
  final String unit;
  final String? description;
}

/// Bên bán / bên mua in trên hóa đơn (ảnh chụp lúc mua).
class InvoiceParty {
  const InvoiceParty({required this.name, this.address, this.phone, this.email});

  final String name;
  final String? address;
  final String? phone;
  final String? email;
}

/// Một khoản hoàn tiền của giao dịch.
class InvoiceRefund {
  const InvoiceRefund({
    required this.reasonLabel,
    required this.amount,
    required this.statusLabel,
    required this.completed,
    required this.createdAt,
    this.processedAt,
  });

  final String reasonLabel;
  final int amount;
  final String statusLabel;
  final bool completed;
  final DateTime createdAt;
  final DateTime? processedAt;
}

/// Chi tiết thanh toán (L6 — BE đã bỏ bảng Invoice; dựng từ `GET /payments/my`):
/// giao dịch thành công (`issued`) hoặc đã hoàn tiền toàn bộ (`cancelled`).
class Invoice {
  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.status,
    required this.issuedAt,
    required this.purpose,
    required this.itemName,
    required this.subtotal,
    required this.discount,
    required this.total,
    required this.paymentMethod,
    this.memberName,
    this.quantity,
    this.transactionCode,
    this.paidAt,
    this.lines = const [],
    this.refundedAmount = 0,
    this.seller,
    this.buyer,
    this.discountLabel,
    this.shippingFee = 0,
    this.refunds = const [],
    this.pendingRefundAmount = 0,
    this.periodLabel,
    this.statusLabel,
    this.orderStatus,
    this.orderId,
    this.isPickup = false,
  });

  final String id;
  final String invoiceNumber;
  final InvoiceStatus status;
  final DateTime issuedAt;
  final CheckoutPurpose purpose;
  final String itemName;
  final int subtotal;
  final int discount;
  final int total;
  final PaymentMethod paymentMethod;
  final String? memberName;
  final int? quantity;
  final String? transactionCode;
  final DateTime? paidAt;

  /// Các dòng sản phẩm (đơn hàng); rỗng với giao dịch khóa học.
  final List<InvoiceLine> lines;

  /// Số tiền đã được hoàn (hoàn một phần khi buổi học bị hủy).
  final int refundedAmount;

  /// Hóa đơn chi tiết (`GET /payments/my/:id/invoice`) — null khi chỉ có dữ liệu danh sách.
  final InvoiceParty? seller;
  final InvoiceParty? buyer;

  /// Diễn giải dòng giảm giá (VD đăng ký muộn).
  final String? discountLabel;
  final int shippingFee;
  final List<InvoiceRefund> refunds;
  final int pendingRefundAmount;

  /// Thời hạn của gói / khóa (VD "01/11/2026 – 30/11/2026").
  final String? periodLabel;

  /// Nhãn trạng thái từ BE (Đã thanh toán / Đã hoàn tiền…).
  final String? statusLabel;

  /// Đơn sản phẩm nhận tại quầy (không có phí giao hàng).
  final bool isPickup;
  final String? orderStatus;
  final String? orderId;

  /// Đã hủy giao dịch / đơn hàng.
  bool get isCancelled =>
      orderStatus == 'CANCELLED' ||
      statusLabel == 'Đã hủy' ||
      statusLabel == 'Đã hủy / hết hạn' ||
      (status == InvoiceStatus.cancelled && refundedAmount == 0);

  /// Đã hoàn tiền (toàn bộ hoặc đánh dấu hoàn tiền).
  bool get isRefunded =>
      orderStatus == 'REFUNDED' ||
      statusLabel == 'Đã hoàn tiền' ||
      (total > 0 && refundedAmount >= total) ||
      (status == InvoiceStatus.cancelled && refundedAmount > 0);

  /// Hoàn tiền một phần (vẫn giữ phần tiền còn lại).
  bool get isPartiallyRefunded => !isRefunded && refundedAmount > 0;

  /// Thực trả sau hoàn.
  int get netAmount => (total - refundedAmount).clamp(0, total);
}
