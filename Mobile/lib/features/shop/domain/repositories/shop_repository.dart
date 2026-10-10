import '../../../../core/data/paged.dart';
import '../entities/shop.dart';

/// Cửa hàng — module `shop` của BE (`/shop/*`). Người mua: MEMBER, COACH; xử lý đơn: MANAGER.
abstract interface class ShopRepository {
  /// `GET /shop/config` (công khai).
  Future<ShopConfig> config();

  // ── Giỏ hàng ─────────────────────────────────────────────────────────
  /// `GET /shop/cart`.
  Future<Cart> cart();

  /// `POST /shop/cart/items` (cộng dồn).
  Future<Cart> addToCart(String productId, int quantity);

  /// `PATCH /shop/cart/items/:productId`.
  Future<Cart> updateCartItem(String productId, int quantity);

  /// `DELETE /shop/cart/items/:productId`.
  Future<Cart> removeCartItem(String productId);

  /// `DELETE /shop/cart`.
  Future<Cart> clearCart();

  /// `POST /shop/cart/accept-prices`.
  Future<Cart> acceptCartPrices();

  // ── Sổ địa chỉ ───────────────────────────────────────────────────────
  Future<List<ShopAddress>> addresses();

  Future<ShopAddress> createAddress(AddressInput input);

  Future<ShopAddress> updateAddress(String id, AddressInput input);

  Future<void> deleteAddress(String id);

  Future<void> setDefaultAddress(String id);

  // ── Checkout ─────────────────────────────────────────────────────────
  /// `POST /shop/checkout/preview` — không ghi dữ liệu.
  Future<CheckoutPreview> preview(CheckoutRequest request);

  /// `POST /shop/checkout` + header `Idempotency-Key` (cùng khóa ⇒ trả lại đơn cũ).
  Future<PlacedOrder> placeOrder(CheckoutRequest request, {required int expectedTotal, required String idempotencyKey});

  // ── Đơn của tôi ──────────────────────────────────────────────────────
  /// `GET /shop/orders?status=<nhóm>`.
  Future<OrderList> myOrders(OrderGroup group);

  /// `GET /shop/orders/:id`.
  Future<ShopOrder> myOrder(String id);

  /// `POST /shop/orders/:id/cancel` (đơn chờ thanh toán).
  Future<ShopOrder> cancelOrder(String id, {String? reason});

  /// `POST /shop/orders/:id/request-refund` (đơn đã thanh toán).
  Future<ShopOrder> requestRefund(String id, String reason);

  /// `POST /shop/orders/:id/confirm-received`.
  Future<ShopOrder> confirmReceived(String id);

  /// `POST /shop/order-items/:id/review`.
  Future<void> reviewItem(String orderItemId, int rating, String? comment);

  // ── Manager ──────────────────────────────────────────────────────────
  Future<ShopSummary> managerSummary();

  Future<Paged<ShopOrder>> managerOrders({OrderGroup? group, FulfillmentType? type, String search = '', int page = 1});

  Future<ShopOrder> managerOrder(String id);

  /// `POST /shop/manage/orders/:id/status`.
  Future<ShopOrder> transition(String id, ShopOrderStatus to, {String? reason, String? trackingCode, String? carrier});

  /// `POST /shop/manage/pickup/verify` — nội dung QR hoặc mã nhập tay.
  Future<PickupLookup> verifyPickup(String code);

  /// `POST /shop/manage/orders/:id/pickup`.
  Future<ShopOrder> confirmPickup(String orderId, String code, String phoneLast4);

  /// `GET /shop/manage/inventory`.
  Future<List<InventoryItem>> inventory({bool lowStockOnly = false, String search = ''});

  /// `POST /shop/manage/inventory/:productId` — nhập (IN, dương) / điều chỉnh (ADJUST, ±).
  Future<void> changeInventory(String productId, {required bool inbound, required int quantity, required String note});

  /// `GET /shop/manage/inventory/:productId/transactions`.
  Future<List<InventoryTx>> inventoryTransactions(String productId);

  /// `PATCH /shop/manage/reviews/:id`.
  Future<void> setReviewHidden(String reviewId, bool hidden, {String? reason});
}
