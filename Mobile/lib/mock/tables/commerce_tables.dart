// Bảng tiền & cửa hàng: Payment, Invoice, ví HLV, giao dịch ví, hoàn tiền, sản phẩm, đơn hàng.
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import '../../features/coach/domain/entities/wallet.dart';
import '../../features/payments/domain/entities/payment.dart';
import '../../features/refunds/domain/entities/refund.dart';
import '../../features/shop/domain/entities/shop.dart';

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
    required this.reason,
    required this.amount,
    required this.createdAt,
    this.memberProfileId,
    this.classId,
    this.coachDebitAmount = 0,
    this.walletId,
    this.orderId,
    this.buyerUserId,
    this.scheduleId,
    this.note,
    this.status = RefundStatus.pending,
  });

  final String id;
  final String paymentId;

  /// Null khi người mua đơn hàng là HLV.
  final String? memberProfileId;

  /// Null với hoàn tiền đơn hàng.
  final String? classId;
  final String? scheduleId;
  final RefundReason reason;
  final int amount;
  final int coachDebitAmount;
  final String? walletId;

  /// Hoàn tiền đơn hàng (lý do ORDER_*).
  final String? orderId;
  final String? buyerUserId;
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
    this.reservedStock = 0,
    this.maxPerOrder = 10,
    this.maxPerDay = 20,
    this.lowStockThreshold = 5,
    this.isActive = true,
    this.imageUrl,
  });

  final String id;
  final String name;
  final String description;
  int price;

  /// Tồn thực tế; có thể bán = [stockQuantity] − [reservedStock].
  int stockQuantity;
  int reservedStock;
  int maxPerOrder;
  int maxPerDay;
  int lowStockThreshold;
  bool isActive;
  String? imageUrl;

  int get available => (stockQuantity - reservedStock).clamp(0, 1 << 30);
}

class ProductReviewRow {
  ProductReviewRow({
    required this.id,
    required this.productId,
    required this.userId,
    required this.rating,
    required this.createdAt,
    this.comment,
    this.orderLineId,
  });

  final String id;
  final String productId;
  final String userId;
  final int rating;
  final String? comment;
  final DateTime createdAt;

  /// Dòng đơn được đánh giá (null với dữ liệu cũ).
  final String? orderLineId;
  bool isHidden = false;
}

/// Dòng giỏ hàng (giỏ không giữ hàng).
class CartItemRow {
  CartItemRow({required this.userId, required this.productId, required this.quantity, required this.priceSnapshot});

  final String userId;
  final String productId;
  int quantity;
  int priceSnapshot;
}

class AddressRow {
  AddressRow({
    required this.id,
    required this.userId,
    required this.recipientName,
    required this.phone,
    required this.province,
    required this.district,
    required this.street,
    this.ward,
    this.isDefault = false,
    required this.createdAt,
  });

  final String id;
  final String userId;
  String recipientName;
  String phone;
  String province;
  String district;
  String? ward;
  String street;
  bool isDefault;
  final DateTime createdAt;
}

class OrderLineRow {
  OrderLineRow({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
  });

  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final int unitPrice;

  int get total => quantity * unitPrice;
}

class OrderHistoryRow {
  OrderHistoryRow({required this.to, required this.at, this.from, this.actorId, this.reason});

  final ShopOrderStatus? from;
  final ShopOrderStatus to;
  final String? actorId;
  final String? reason;
  final DateTime at;
}

/// Đơn hàng (`Order` + `OrderItem` + `OrderStatusHistory`).
class ShopOrderRow {
  ShopOrderRow({
    required this.id,
    required this.code,
    required this.userId,
    required this.fulfillmentType,
    required this.lines,
    required this.shippingFee,
    required this.createdAt,
    required this.paymentExpiresAt,
    this.status = ShopOrderStatus.pendingPayment,
    this.recipientName,
    this.recipientPhone,
    this.shippingAddress,
    this.note,
    this.idempotencyKey,
  });

  final String id;
  final String code;
  final String userId;
  final FulfillmentType fulfillmentType;
  final List<OrderLineRow> lines;
  final int shippingFee;
  final DateTime createdAt;
  DateTime paymentExpiresAt;
  ShopOrderStatus status;
  final String? recipientName;
  final String? recipientPhone;
  final String? shippingAddress;
  final String? note;
  final String? idempotencyKey;
  String? trackingCode;
  String? carrier;
  String? pickupCode;
  DateTime? pickupDeadline;
  int pickupFailedAttempts = 0;
  DateTime? pickupLockedUntil;
  DateTime? deliveredAt;
  DateTime? expiredAt;
  String? cancelNote;
  final history = <OrderHistoryRow>[];

  int get subtotal => lines.fold(0, (s, l) => s + l.total);

  int get total => subtotal + shippingFee;

  int get itemCount => lines.fold(0, (s, l) => s + l.quantity);
}

class InventoryTxRow {
  InventoryTxRow({
    required this.id,
    required this.productId,
    required this.type,
    required this.quantity,
    required this.stockAfter,
    required this.reservedAfter,
    required this.createdAt,
    this.orderId,
    this.note,
  });

  final String id;
  final String productId;
  final InventoryTxType type;
  final int quantity;
  final int stockAfter;
  final int reservedAfter;
  final DateTime createdAt;
  final String? orderId;
  final String? note;
}
