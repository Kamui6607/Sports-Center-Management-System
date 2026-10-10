/// Cửa hàng: giỏ hàng, địa chỉ, checkout, đơn hàng theo máy trạng thái (Doc/SHOP_FLOW_DESIGN.md).
library;

/// Trạng thái đơn (`OrderStatus` của BE).
enum ShopOrderStatus {
  pendingPayment,
  paid,
  processing,
  readyForPickup,
  shipping,
  delivered,
  completed,
  expired,
  cancelled,
  notPickedUp,
  refundRequested,
  refunded,
}

/// Hình thức nhận hàng — luôn trả trước qua VietQR (không COD).
enum FulfillmentType { pickup, delivery }

/// Nhóm trạng thái cho tab "Đơn của tôi" / lọc của Manager (`status=PENDING|ACTIVE|COMPLETED|CLOSED`).
enum OrderGroup { pending, active, completed, closed }

enum CheckoutMode { cart, buyNow }

/// Cảnh báo / lỗi nghiệp vụ theo mã của BE (`OUT_OF_STOCK`, `PRICE_CHANGED`, `DAILY_LIMIT_EXCEEDED`…).
class ShopWarning {
  const ShopWarning({
    required this.code,
    required this.message,
    this.available,
    this.oldPrice,
    this.newPrice,
    this.maxPerOrder,
    this.remainingToday,
  });

  final String code;
  final String message;
  final int? available;
  final int? oldPrice;
  final int? newPrice;
  final int? maxPerOrder;
  final int? remainingToday;

  bool get isPriceChange => code == 'PRICE_CHANGED';
}

/// Cấu hình cửa hàng (`GET /shop/config`).
class ShopConfig {
  const ShopConfig({
    this.holdMinutes = 15,
    this.maxPendingOrders = 2,
    this.pickupDays = 3,
    this.shippingFee = 30000,
    this.freeShippingThreshold = 500000,
    this.deliveryProvinces = const ['Hồ Chí Minh'],
  });

  final int holdMinutes;
  final int maxPendingOrders;
  final int pickupDays;
  final int shippingFee;
  final int freeShippingThreshold;
  final List<String> deliveryProvinces;
}

class CartLine {
  const CartLine({
    required this.productId,
    required this.productName,
    required this.unitPrice,
    required this.quantity,
    required this.availableStock,
    required this.maxPerOrder,
    this.imageUrl,
    this.warnings = const [],
    this.purchasable = true,
    this.isActive = true,
  });

  final String productId;
  final String productName;
  final String? imageUrl;
  final int unitPrice;
  final int quantity;
  final int availableStock;
  final int maxPerOrder;
  final List<ShopWarning> warnings;

  /// Đặt được (không có cảnh báo chặn — giá đổi không chặn).
  final bool purchasable;
  final bool isActive;

  int get lineTotal => unitPrice * quantity;

  /// Số lượng tối đa chọn được cho dòng này.
  int get maxSelectable {
    final m = availableStock < maxPerOrder ? availableStock : maxPerOrder;
    return m < 1 ? 1 : m;
  }

  ShopWarning? get priceChange => warnings.where((w) => w.isPriceChange).firstOrNull;
}

/// Giỏ hàng lưu ở server (không giữ hàng).
class Cart {
  const Cart({this.lines = const []});

  final List<CartLine> lines;

  /// Số dòng (badge).
  int get count => lines.length;

  bool get isEmpty => lines.isEmpty;

  bool get hasPriceChange => lines.any((l) => l.priceChange != null);

  int subtotalOf(Set<String> productIds) =>
      lines.where((l) => productIds.contains(l.productId) && l.purchasable).fold(0, (s, l) => s + l.lineTotal);

  static const empty = Cart();
}

class ShopAddress {
  const ShopAddress({
    required this.id,
    required this.recipientName,
    required this.phone,
    required this.province,
    required this.district,
    required this.street,
    this.ward,
    this.isDefault = false,
    this.deliverable = true,
  });

  final String id;
  final String recipientName;
  final String phone;
  final String province;
  final String district;
  final String? ward;
  final String street;
  final bool isDefault;

  /// Trong khu vực giao hàng của trung tâm.
  final bool deliverable;

  String get fullAddress =>
      [street, ward, district, province].where((p) => p != null && p.trim().isNotEmpty).join(', ');
}

class AddressInput {
  const AddressInput({
    required this.recipientName,
    required this.phone,
    required this.province,
    required this.district,
    required this.street,
    this.ward,
    this.isDefault = false,
  });

  final String recipientName;
  final String phone;
  final String province;
  final String district;
  final String? ward;
  final String street;
  final bool isDefault;
}

/// Yêu cầu xem trước / đặt hàng. Giá luôn do server tính (client chỉ gửi tổng đã xem — `expectedTotal`).
class CheckoutRequest {
  const CheckoutRequest({
    required this.mode,
    required this.fulfillmentType,
    this.productIds = const [],
    this.items = const {},
    this.addressId,
    this.recipientName,
    this.recipientPhone,
    this.note,
  });

  final CheckoutMode mode;
  final FulfillmentType fulfillmentType;

  /// Giỏ: các dòng được chọn (rỗng = cả giỏ).
  final List<String> productIds;

  /// Mua ngay: productId ⇒ số lượng.
  final Map<String, int> items;
  final String? addressId;
  final String? recipientName;
  final String? recipientPhone;
  final String? note;

  CheckoutRequest copyWith({
    FulfillmentType? fulfillmentType,
    String? addressId,
    String? recipientName,
    String? recipientPhone,
    String? note,
    bool clearAddress = false,
  }) => CheckoutRequest(
    mode: mode,
    fulfillmentType: fulfillmentType ?? this.fulfillmentType,
    productIds: productIds,
    items: items,
    addressId: clearAddress ? null : (addressId ?? this.addressId),
    recipientName: recipientName ?? this.recipientName,
    recipientPhone: recipientPhone ?? this.recipientPhone,
    note: note ?? this.note,
  );
}

class CheckoutLine {
  const CheckoutLine({
    required this.productId,
    required this.productName,
    required this.unitPrice,
    required this.quantity,
    required this.lineTotal,
    this.imageUrl,
    this.warnings = const [],
  });

  final String productId;
  final String productName;
  final String? imageUrl;
  final int unitPrice;
  final int quantity;
  final int lineTotal;
  final List<ShopWarning> warnings;
}

/// `POST /shop/checkout/preview`.
class CheckoutPreview {
  const CheckoutPreview({
    required this.lines,
    required this.subtotal,
    required this.shippingFee,
    required this.total,
    required this.canCheckout,
    this.warnings = const [],
    this.recipientName,
    this.recipientPhone,
    this.addressText,
    this.deliverable = true,
    this.lockedUntil,
    this.pendingOrders = 0,
    this.maxPendingOrders = 2,
    this.holdMinutes = 15,
    this.freeShippingThreshold = 0,
  });

  final List<CheckoutLine> lines;
  final int subtotal;
  final int shippingFee;
  final int total;
  final bool canCheckout;

  /// Cảnh báo chung (khóa đặt hàng, quá số đơn chờ, ngoài khu vực giao…).
  final List<ShopWarning> warnings;
  final String? recipientName;
  final String? recipientPhone;
  final String? addressText;
  final bool deliverable;
  final DateTime? lockedUntil;
  final int pendingOrders;
  final int maxPendingOrders;
  final int holdMinutes;
  final int freeShippingThreshold;

  List<ShopWarning> get allWarnings => [...warnings, for (final l in lines) ...l.warnings];
}

/// Kết quả đặt hàng: chuyển sang màn VietQR có sẵn.
class PlacedOrder {
  const PlacedOrder({required this.orderId, required this.orderCode, required this.paymentId, this.replayed = false});

  final String orderId;
  final String orderCode;
  final String paymentId;
  final bool replayed;
}

class OrderLineReview {
  const OrderLineReview({required this.id, required this.rating, this.comment, this.isHidden = false});

  final String id;
  final int rating;
  final String? comment;
  final bool isHidden;
}

class ShopOrderLine {
  const ShopOrderLine({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.total,
    this.imageUrl,
    this.review,
    this.canReview = false,
  });

  final String id;
  final String productId;
  final String productName;
  final String? imageUrl;
  final int quantity;
  final int unitPrice;
  final int total;
  final OrderLineReview? review;
  final bool canReview;
}

class OrderHistoryEntry {
  const OrderHistoryEntry({
    required this.toStatus,
    required this.at,
    this.fromStatus,
    this.reason,
    this.byCustomer = false,
    this.bySystem = false,
  });

  final ShopOrderStatus toStatus;
  final ShopOrderStatus? fromStatus;
  final DateTime at;
  final String? reason;
  final bool byCustomer;
  final bool bySystem;
}

/// Mã nhận hàng (chỉ chủ đơn thấy `code`/`qrPayload`).
class PickupInfo {
  const PickupInfo({this.code, this.qrPayload, this.deadline, this.failedAttempts = 0, this.lockedUntil});

  final String? code;
  final String? qrPayload;
  final DateTime? deadline;
  final int failedAttempts;
  final DateTime? lockedUntil;
}

class OrderRefundInfo {
  const OrderRefundInfo({
    required this.id,
    required this.status,
    required this.amount,
    required this.reason,
    this.rejectReason,
  });

  /// `PENDING` | `COMPLETED` | `REJECTED`.
  final String status;
  final String id;
  final int amount;

  /// `ORDER_CANCELLED` | `ORDER_NOT_PICKED_UP` | `ORDER_LATE_PAYMENT`.
  final String reason;
  final String? rejectReason;
}

/// Đơn hàng (danh sách: [lines], [history]… có thể rỗng; chi tiết: đầy đủ).
class ShopOrder {
  const ShopOrder({
    required this.id,
    required this.code,
    required this.status,
    required this.fulfillmentType,
    required this.subtotal,
    required this.shippingFee,
    required this.total,
    required this.createdAt,
    this.lines = const [],
    this.recipientName,
    this.recipientPhone,
    this.recipientPhoneMasked,
    this.shippingAddress,
    this.note,
    this.trackingCode,
    this.carrier,
    this.paymentExpiresAt,
    this.pickupDeadline,
    this.paymentId,
    this.cancelNote,
    this.history = const [],
    this.refunds = const [],
    this.pickup,
    this.canPay = false,
    this.canCancel = false,
    this.canRequestRefund = false,
    this.canConfirmReceived = false,
    this.buyerName,
    this.buyerPhone,
    this.allowedTransitions = const [],
    this.paymentRequiresReview = false,
  });

  final String id;
  final String code;
  final ShopOrderStatus status;
  final FulfillmentType fulfillmentType;
  final int subtotal;
  final int shippingFee;
  final int total;
  final DateTime createdAt;
  final List<ShopOrderLine> lines;
  final String? recipientName;
  final String? recipientPhone;
  final String? recipientPhoneMasked;
  final String? shippingAddress;
  final String? note;
  final String? trackingCode;
  final String? carrier;
  final DateTime? paymentExpiresAt;
  final DateTime? pickupDeadline;
  final String? paymentId;
  final String? cancelNote;
  final List<OrderHistoryEntry> history;
  final List<OrderRefundInfo> refunds;
  final PickupInfo? pickup;
  final bool canPay;
  final bool canCancel;
  final bool canRequestRefund;
  final bool canConfirmReceived;

  /// Manager.
  final String? buyerName;
  final String? buyerPhone;
  final List<ShopOrderStatus> allowedTransitions;

  /// Tiền đã về nhưng cần đối soát (về muộn / lệch).
  final bool paymentRequiresReview;

  int get itemCount => lines.fold(0, (s, l) => s + l.quantity);

  String get title => lines.isEmpty
      ? 'Đơn $code'
      : lines.length == 1
      ? lines.first.productName
      : '${lines.first.productName} và ${lines.length - 1} sản phẩm khác';

  bool get isPickup => fulfillmentType == FulfillmentType.pickup;
}

class OrderCounts {
  const OrderCounts({this.pending = 0, this.active = 0, this.completed = 0, this.closed = 0});

  final int pending;
  final int active;
  final int completed;
  final int closed;

  int of(OrderGroup g) => switch (g) {
    OrderGroup.pending => pending,
    OrderGroup.active => active,
    OrderGroup.completed => completed,
    OrderGroup.closed => closed,
  };
}

class OrderList {
  const OrderList({required this.orders, this.counts = const OrderCounts()});

  final List<ShopOrder> orders;
  final OrderCounts counts;
}

// ── Manager ──────────────────────────────────────────────────────────────────

class ShopSummary {
  const ShopSummary({
    this.needsAction = 0,
    this.toPrepare = 0,
    this.readyForPickup = 0,
    this.shipping = 0,
    this.refundRequested = 0,
    this.lowStockProducts = 0,
  });

  final int needsAction;
  final int toPrepare;
  final int readyForPickup;
  final int shipping;
  final int refundRequested;
  final int lowStockProducts;
}

/// Kết quả tra mã nhận hàng (đối chiếu trước khi giao).
class PickupLookup {
  const PickupLookup({required this.order, this.lockedUntil});

  final ShopOrder order;
  final DateTime? lockedUntil;
}

class InventoryItem {
  const InventoryItem({
    required this.id,
    required this.name,
    required this.price,
    required this.stockQuantity,
    required this.reservedStock,
    required this.availableStock,
    required this.lowStockThreshold,
    this.imageUrl,
    this.isActive = true,
    this.lowStock = false,
    this.maxPerOrder = 10,
    this.maxPerDay = 20,
  });

  final String id;
  final String name;
  final String? imageUrl;
  final int price;
  final bool isActive;
  final int stockQuantity;
  final int reservedStock;
  final int availableStock;
  final int lowStockThreshold;
  final bool lowStock;
  final int maxPerOrder;
  final int maxPerDay;
}

enum InventoryTxType { inbound, reserve, release, sale, returned, adjust }

class InventoryTx {
  const InventoryTx({
    required this.id,
    required this.type,
    required this.quantity,
    required this.stockAfter,
    required this.reservedAfter,
    required this.createdAt,
    this.orderCode,
    this.note,
  });

  final String id;
  final InventoryTxType type;
  final int quantity;
  final int stockAfter;
  final int reservedAfter;
  final DateTime createdAt;
  final String? orderCode;
  final String? note;
}
