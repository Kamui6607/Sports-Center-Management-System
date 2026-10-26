/// Cửa hàng: giỏ hàng, địa chỉ, checkout, đơn hàng theo máy trạng thái (Doc/SHOP_FLOW_DESIGN.md).
library;

/// Trạng thái đơn (`OrderStatus` của BE).
enum ShopOrderStatus {
  pendingPayment,

  /// Đơn trả tiền tại quầy: đã giữ hàng, chờ Trung tâm chuẩn bị (chưa thu tiền).
  confirmed,
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

/// Hình thức nhận hàng.
enum FulfillmentType { pickup, delivery }

/// Cách thanh toán: chuyển khoản trước (VietQR/SePay) hoặc trả tiền khi nhận tại quầy (chỉ [FulfillmentType.pickup]).
enum ShopPaymentMethod { sepay, cash }

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
    this.shippingFee = 15000,
    this.freeShippingThreshold = 500000,
    this.deliveryProvinces = const ['Hồ Chí Minh'],
    this.pickupMaxDaysAhead = 7,
    this.pickupMaxReschedules = 1,
    this.pickupRescheduleMaxDays = 3,
    this.cashMaxOrderValue = 2000000,
  });

  final int holdMinutes;
  final int maxPendingOrders;

  /// Hạn nhận = cuối ngày (ngày hẹn + [pickupDays]).
  final int pickupDays;

  /// Ngày hẹn lấy chọn trong [hôm nay, hôm nay + N].
  final int pickupMaxDaysAhead;

  /// Số lần được đổi ngày lấy / mỗi lần dời tối đa N ngày.
  final int pickupMaxReschedules;
  final int pickupRescheduleMaxDays;

  /// Đơn trả tại quầy tối đa (VND).
  final int cashMaxOrderValue;
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

/// Một địa danh (Tỉnh/Thành hoặc Phường/Xã) — `GET /locations/...` (địa giới 2 cấp từ 01/07/2025).
class LocationItem {
  const LocationItem({required this.code, required this.name, this.deliverable = true});

  final int code;
  final String name;

  /// Tỉnh/Thành nằm trong khu vực giao hàng của cửa hàng.
  final bool deliverable;
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
    this.provinceCode,
    this.wardCode,
  });

  /// Mã địa danh để mở lại đúng mục trong dropdown (địa chỉ cũ có thể null).
  final int? provinceCode;
  final int? wardCode;

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
    this.provinceCode,
    this.wardCode,
  });

  final int? provinceCode;
  final int? wardCode;

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
    this.paymentMethod = ShopPaymentMethod.sepay,
    this.pickupDate,
  });

  final CheckoutMode mode;
  final FulfillmentType fulfillmentType;
  final ShopPaymentMethod paymentMethod;

  /// Ngày dự định lấy (chỉ phần ngày, giờ VN) — chỉ với nhận tại quầy.
  final DateTime? pickupDate;

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
    ShopPaymentMethod? paymentMethod,
    DateTime? pickupDate,
    bool clearAddress = false,
  }) => CheckoutRequest(
    mode: mode,
    fulfillmentType: fulfillmentType ?? this.fulfillmentType,
    paymentMethod: paymentMethod ?? this.paymentMethod,
    pickupDate: pickupDate ?? this.pickupDate,
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
    this.pickupDateMin,
    this.pickupDateMax,
    this.pickupDays = 3,
    this.cashAvailable = false,
    this.cashUnavailableReason,
  });

  /// Khoảng ngày được chọn làm ngày hẹn lấy (nhận tại quầy).
  final DateTime? pickupDateMin;
  final DateTime? pickupDateMax;
  final int pickupDays;

  /// Có được chọn "trả tiền tại quầy" không (+ lý do khi không).
  final bool cashAvailable;
  final String? cashUnavailableReason;

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

/// Kết quả đặt hàng: chuyển khoản ⇒ màn VietQR; trả tại quầy ([paymentId] null) ⇒ chi tiết đơn.
class PlacedOrder {
  const PlacedOrder({required this.orderId, required this.orderCode, this.paymentId, this.replayed = false});

  final String orderId;
  final String orderCode;
  final String? paymentId;
  final bool replayed;

  bool get payAtCounter => paymentId == null;
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
  const PickupInfo({
    this.code,
    this.qrPayload,
    this.deadline,
    this.failedAttempts = 0,
    this.lockedUntil,
    this.latePickupUntil,
  });

  final String? code;
  final String? qrPayload;
  final DateTime? deadline;
  final int failedAttempts;
  final DateTime? lockedUntil;

  /// Đơn đã quá hạn nhận nhưng vẫn đến lấy trễ được tới mốc này (khi đó yêu cầu hoàn tiền bị hủy).
  final DateTime? latePickupUntil;
}

class OrderRefundInfo {
  const OrderRefundInfo({
    required this.id,
    required this.status,
    required this.amount,
    required this.reason,
    this.rejectReason,
    this.grossAmount,
    this.feePercent,
    this.bankName,
    this.bankAccountNumber,
    this.bankAccountName,
    this.payoutMethod,
  });

  /// `PENDING` | `COMPLETED` | `REJECTED`.
  final String status;
  final String id;
  final int amount;

  /// Trước khi trừ phí giữ hàng (bùng hàng nhiều lần) — null khi không trừ phí.
  final int? grossAmount;
  final int? feePercent;

  /// STK nhận hoàn khách đã cung cấp.
  final String? bankName;
  final String? bankAccountNumber;
  final String? bankAccountName;

  /// `BANK_TRANSFER` | `CASH` khi đã hoàn.
  final String? payoutMethod;

  bool get isPending => status == 'PENDING';
  bool get hasBankInfo => (bankAccountNumber ?? '').trim().isNotEmpty;

  /// `ORDER_CANCELLED` | `ORDER_NOT_PICKED_UP` | `ORDER_LATE_PAYMENT`.
  final String reason;
  final String? rejectReason;
}

/// STK khách nhận tiền hoàn.
class RefundBankInput {
  const RefundBankInput({required this.bankName, required this.accountNumber, required this.accountName});

  final String bankName;
  final String accountNumber;
  final String accountName;
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
    this.paymentMethod = ShopPaymentMethod.sepay,
    this.isPaid = false,
    this.preferredPickupDate,
    this.pickupRescheduleCount = 0,
    this.amountDueAtCounter = 0,
    this.canReschedulePickup = false,
    this.canUpdateRefundBank = false,
  });

  final ShopPaymentMethod paymentMethod;
  final bool isPaid;

  /// Ngày hẹn lấy (chỉ phần ngày).
  final DateTime? preferredPickupDate;
  final int pickupRescheduleCount;

  /// Số tiền phải trả khi nhận tại quầy (0 nếu đã trả trước).
  final int amountDueAtCounter;
  final bool canReschedulePickup;
  final bool canUpdateRefundBank;

  OrderRefundInfo? get pendingRefund => refunds.where((r) => r.isPending).firstOrNull;

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
