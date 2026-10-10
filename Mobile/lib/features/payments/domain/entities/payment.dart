/// Trạng thái tiền của giao dịch (`PaymentStatus`).
enum PaymentStatus { pending, success, failed, refunded }

enum PaymentMethod { cash, bankTransfer, sepay }

/// Mục đích giao dịch: mua khóa học hoặc đơn sản phẩm.
enum CheckoutPurpose { course, product }

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
  const InvoiceLine({required this.name, required this.quantity, required this.unitPrice, required this.total});

  final String name;
  final int quantity;
  final int unitPrice;
  final int total;
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
}
