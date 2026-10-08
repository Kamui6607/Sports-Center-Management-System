// Bảng tiền & cửa hàng: Payment, Invoice, ví HLV, giao dịch ví, hoàn tiền, sản phẩm, đơn hàng.
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import '../../features/coach/domain/entities/wallet.dart';
import '../../features/payments/domain/entities/payment.dart';
import '../../features/products/domain/entities/product.dart';
import '../../features/refunds/domain/entities/refund.dart';

class PaymentRow {
  PaymentRow({
    required this.id,
    required this.userId,
    required this.amount,
    required this.status,
    required this.orderCode,
    required this.createdAt,
    required this.expiresAt,
    this.memberProfileId,
    this.classId,
    this.productOrderId,
    this.method = PaymentMethod.sepay,
    this.paidAt,
  });

  final String id;
  final String userId;
  final String? memberProfileId;
  final int amount;
  final PaymentMethod method;
  final String? classId;
  final String? productOrderId;
  PaymentStatus status;
  final String orderCode;
  final DateTime createdAt;
  final DateTime expiresAt;
  DateTime? paidAt;
}

class InvoiceRow {
  InvoiceRow({
    required this.id,
    required this.invoiceNumber,
    required this.paymentId,
    required this.userId,
    required this.total,
    required this.issuedAt,
    required this.itemName,
    required this.purpose,
    this.memberName,
    this.quantity,
  });

  final String id;
  final String invoiceNumber;
  final String paymentId;
  final String userId;
  final int total;
  final DateTime issuedAt;
  final String itemName;
  final CheckoutPurpose purpose;
  final String? memberName;
  final int? quantity;
  InvoiceStatus status = InvoiceStatus.issued;
}

class WalletRow {
  WalletRow({required this.id, required this.coachProfileId, required this.balance});

  final String id;
  final String coachProfileId;
  int balance;
}

class WalletTxRow {
  WalletTxRow({
    required this.id,
    required this.walletId,
    required this.amount,
    required this.type,
    required this.status,
    required this.createdAt,
    this.classId,
    this.paymentId,
    this.note,
    this.bankInfo,
  });

  final String id;
  final String walletId;
  final int amount;
  final WalletTxType type;
  WalletTxStatus status;
  final DateTime createdAt;
  final String? classId;
  final String? paymentId;
  final String? note;
  final BankInfo? bankInfo;
  String? rejectReason;
}

class RefundRow {
  RefundRow({
    required this.id,
    required this.paymentId,
    required this.memberProfileId,
    required this.classId,
    required this.reason,
    required this.amount,
    required this.coachDebitAmount,
    required this.walletId,
    required this.createdAt,
    this.scheduleId,
    this.note,
    this.status = RefundStatus.pending,
  });

  final String id;
  final String paymentId;
  final String memberProfileId;
  final String classId;
  final String? scheduleId;
  final RefundReason reason;
  final int amount;
  final int coachDebitAmount;
  final String walletId;
  final String? note;
  final DateTime createdAt;
  RefundStatus status;
  DateTime? processedAt;
  String? processedNote;
  String? rejectReason;
}

class ProductRow {
  ProductRow({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.stockQuantity,
  });

  final String id;
  final String name;
  final String description;
  final int price;
  int stockQuantity;
}

class ProductReviewRow {
  ProductReviewRow({
    required this.id,
    required this.productId,
    required this.userId,
    required this.rating,
    required this.createdAt,
    this.comment,
  });

  final String id;
  final String productId;
  final String userId;
  final int rating;
  final String? comment;
  final DateTime createdAt;
}

class ProductOrderRow {
  ProductOrderRow({
    required this.id,
    required this.productId,
    required this.userId,
    required this.quantity,
    required this.totalPrice,
    required this.createdAt,
    this.status = OrderStatus.pending,
  });

  final String id;
  final String productId;
  final String userId;
  final int quantity;
  final int totalPrice;
  final DateTime createdAt;
  OrderStatus status;
  OrderCancelReason? cancelReason;
}
