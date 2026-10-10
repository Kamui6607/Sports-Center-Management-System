import '../../../api/shop_json.dart';
import '../../../core/data/paged.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/shop.dart';
import '../domain/repositories/shop_repository.dart';

/// [ShopRepository] gọi BE thật — module `shop` (`/api/v1/shop/*`).
class ShopApiRepository implements ShopRepository {
  ShopApiRepository(this._api);

  final ApiClient _api;

  @override
  Future<ShopConfig> config() async => ShopJson.config((await _api.get('/shop/config', auth: false)).json);

  // ── Giỏ hàng ─────────────────────────────────────────────────────────

  @override
  Future<Cart> cart() async => ShopJson.cart((await _api.get('/shop/cart')).json);

  @override
  Future<Cart> addToCart(String productId, int quantity) async =>
      ShopJson.cart((await _api.post('/shop/cart/items', body: {'productId': productId, 'quantity': quantity})).json);

  @override
  Future<Cart> updateCartItem(String productId, int quantity) async =>
      ShopJson.cart((await _api.patch('/shop/cart/items/$productId', body: {'quantity': quantity})).json);

  @override
  Future<Cart> removeCartItem(String productId) async =>
      ShopJson.cart((await _api.delete('/shop/cart/items/$productId')).json);

  @override
  Future<Cart> clearCart() async => ShopJson.cart((await _api.delete('/shop/cart')).json);

  @override
  Future<Cart> acceptCartPrices() async => ShopJson.cart((await _api.post('/shop/cart/accept-prices')).json);

  // ── Sổ địa chỉ ───────────────────────────────────────────────────────

  @override
  Future<List<ShopAddress>> addresses() async =>
      (await _api.get('/shop/addresses')).list.map(ShopJson.address).toList();

  @override
  Future<ShopAddress> createAddress(AddressInput input) async =>
      ShopJson.address((await _api.post('/shop/addresses', body: ShopJson.addressBody(input))).json);

  @override
  Future<ShopAddress> updateAddress(String id, AddressInput input) async =>
      ShopJson.address((await _api.patch('/shop/addresses/$id', body: ShopJson.addressBody(input))).json);

  @override
  Future<void> deleteAddress(String id) => _api.delete('/shop/addresses/$id');

  @override
  Future<void> setDefaultAddress(String id) => _api.post('/shop/addresses/$id/default');

  // ── Checkout ─────────────────────────────────────────────────────────

  @override
  Future<CheckoutPreview> preview(CheckoutRequest request) async =>
      ShopJson.preview((await _api.post('/shop/checkout/preview', body: ShopJson.checkoutBody(request))).json);

  @override
  Future<PlacedOrder> placeOrder(
    CheckoutRequest request, {
    required int expectedTotal,
    required String idempotencyKey,
  }) async {
    final res = await _api.post(
      '/shop/checkout',
      body: {...ShopJson.checkoutBody(request), 'expectedTotal': expectedTotal},
      headers: {'Idempotency-Key': idempotencyKey},
    );
    return ShopJson.placed(res.json);
  }

  // ── Đơn của tôi ──────────────────────────────────────────────────────

  @override
  Future<OrderList> myOrders(OrderGroup group) async {
    final res = await _api.get('/shop/orders', query: {'status': ShopJson.group(group), 'limit': 50});
    return OrderList(orders: res.list.map(ShopJson.order).toList(), counts: ShopJson.counts(res.raw.obj('counts')));
  }

  @override
  Future<ShopOrder> myOrder(String id) async => ShopJson.order((await _api.get('/shop/orders/$id')).json);

  @override
  Future<ShopOrder> cancelOrder(String id, {String? reason}) async => ShopJson.order(
    (await _api.post(
      '/shop/orders/$id/cancel',
      body: {if (reason != null && reason.trim().isNotEmpty) 'reason': reason},
    )).json,
  );

  @override
  Future<ShopOrder> requestRefund(String id, String reason) async =>
      ShopJson.order((await _api.post('/shop/orders/$id/request-refund', body: {'reason': reason.trim()})).json);

  @override
  Future<ShopOrder> confirmReceived(String id) async =>
      ShopJson.order((await _api.post('/shop/orders/$id/confirm-received')).json);

  @override
  Future<void> reviewItem(String orderItemId, int rating, String? comment) => _api.post(
    '/shop/order-items/$orderItemId/review',
    body: {'rating': rating, if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim()},
  );

  // ── Manager ──────────────────────────────────────────────────────────

  @override
  Future<ShopSummary> managerSummary() async => ShopJson.summary((await _api.get('/shop/manage/summary')).json);

  @override
  Future<Paged<ShopOrder>> managerOrders({
    OrderGroup? group,
    FulfillmentType? type,
    String search = '',
    int page = 1,
  }) async {
    final res = await _api.get(
      '/shop/manage/orders',
      query: {
        'status': group == null ? null : ShopJson.group(group),
        'fulfillmentType': type == null ? null : (type == FulfillmentType.pickup ? 'PICKUP' : 'DELIVERY'),
        'search': search.trim(),
        'page': page,
        'limit': 20,
      },
    );
    return res.paged(ShopJson.order, page: page, limit: 20);
  }

  @override
  Future<ShopOrder> managerOrder(String id) async => ShopJson.order((await _api.get('/shop/manage/orders/$id')).json);

  @override
  Future<ShopOrder> transition(
    String id,
    ShopOrderStatus to, {
    String? reason,
    String? trackingCode,
    String? carrier,
  }) async {
    final res = await _api.post(
      '/shop/manage/orders/$id/status',
      body: {
        'status': _beStatus(to),
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
        if (trackingCode != null && trackingCode.trim().isNotEmpty) 'trackingCode': trackingCode.trim(),
        if (carrier != null && carrier.trim().isNotEmpty) 'carrier': carrier.trim(),
      },
    );
    return ShopJson.order(res.json);
  }

  static String _beStatus(ShopOrderStatus s) =>
      s.name.replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m.group(0)}').toUpperCase();

  @override
  Future<PickupLookup> verifyPickup(String code) async {
    final j = (await _api.post('/shop/manage/pickup/verify', body: {'code': code.trim()})).json;
    return PickupLookup(order: ShopJson.order(j), lockedUntil: j.dateOrNull('pickupLockedUntil'));
  }

  @override
  Future<ShopOrder> confirmPickup(String orderId, String code, String phoneLast4) async => ShopJson.order(
    (await _api.post(
      '/shop/manage/orders/$orderId/pickup',
      body: {'code': code.trim(), 'phoneLast4': phoneLast4.trim()},
    )).json,
  );

  @override
  Future<List<InventoryItem>> inventory({bool lowStockOnly = false, String search = ''}) async {
    final res = await _api.get(
      '/shop/manage/inventory',
      query: {'lowStock': lowStockOnly ? 'true' : null, 'search': search.trim(), 'limit': 50},
    );
    return res.list.map(ShopJson.inventory).toList();
  }

  @override
  Future<void> changeInventory(
    String productId, {
    required bool inbound,
    required int quantity,
    required String note,
  }) => _api.post(
    '/shop/manage/inventory/$productId',
    body: {'type': inbound ? 'IN' : 'ADJUST', 'quantity': quantity, 'note': note.trim()},
  );

  @override
  Future<List<InventoryTx>> inventoryTransactions(String productId) async => (await _api.get(
    '/shop/manage/inventory/$productId/transactions',
    query: {'limit': 50},
  )).list.map(ShopJson.inventoryTx).toList();

  @override
  Future<void> setReviewHidden(String reviewId, bool hidden, {String? reason}) => _api.patch(
    '/shop/manage/reviews/$reviewId',
    body: {'isHidden': hidden, if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim()},
  );
}
