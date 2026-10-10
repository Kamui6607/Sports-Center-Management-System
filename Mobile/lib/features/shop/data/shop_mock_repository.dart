import '../../../core/data/paged.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/utils/money.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../payments/domain/entities/payment.dart';
import '../../refunds/domain/entities/refund.dart';
import '../domain/entities/shop.dart';
import '../domain/repositories/shop_repository.dart';

/// Mock theo `BE/src/modules/shop` — cùng luật nghiệp vụ & mã lỗi (Doc/SHOP_FLOW_DESIGN.md §3–§5).
class ShopMockRepository implements ShopRepository {
  ShopMockRepository(this._server);

  final MockServer _server;

  MockDatabase get _db => _server.db;

  UserRow _buyer() {
    final u = _server.requireUser();
    if (u.role == UserRole.manager) throw const AppFailure.forbidden('Quản lý không đặt mua sản phẩm.');
    return u;
  }

  ProductRow _productOr404(String id) {
    final p = _db.products.where((x) => x.id == id).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Sản phẩm không tồn tại.');
    return p;
  }

  @override
  Future<ShopConfig> config() => _server.run(
    () => const ShopConfig(
      holdMinutes: MockShopConfig.holdMinutes,
      maxPendingOrders: MockShopConfig.maxPendingOrders,
      pickupDays: MockShopConfig.pickupDays,
      shippingFee: MockShopConfig.shippingFee,
      freeShippingThreshold: MockShopConfig.freeShippingThreshold,
      deliveryProvinces: MockShopConfig.deliveryProvinces,
    ),
  );

  // ── Giỏ hàng ─────────────────────────────────────────────────────────

  List<ShopWarning> _warnings(ProductRow p, int qty, {int? snapshot}) {
    if (!p.isActive) return const [ShopWarning(code: 'PRODUCT_INACTIVE', message: 'Sản phẩm đã ngừng bán.')];
    return [
      if (p.available <= 0)
        const ShopWarning(code: 'OUT_OF_STOCK', message: 'Sản phẩm đã hết hàng.', available: 0)
      else if (qty > p.available)
        ShopWarning(code: 'INSUFFICIENT_STOCK', message: 'Chỉ còn ${p.available} sản phẩm.', available: p.available),
      if (qty > p.maxPerOrder)
        ShopWarning(
          code: 'MAX_PER_ORDER_EXCEEDED',
          message: 'Tối đa ${p.maxPerOrder} sản phẩm mỗi đơn.',
          maxPerOrder: p.maxPerOrder,
        ),
      if (snapshot != null && snapshot != p.price)
        ShopWarning(
          code: 'PRICE_CHANGED',
          message: 'Giá đã đổi từ ${Money.format(snapshot)} thành ${Money.format(p.price)}.',
          oldPrice: snapshot,
          newPrice: p.price,
        ),
    ];
  }

  Cart _cartOf(String userId) => Cart(
    lines: [
      for (final c in _db.cartItems.where((c) => c.userId == userId))
        () {
          final p = _db.product(c.productId);
          final w = _warnings(p, c.quantity, snapshot: c.priceSnapshot);
          return CartLine(
            productId: p.id,
            productName: p.name,
            imageUrl: p.imageUrl,
            unitPrice: p.price,
            quantity: c.quantity,
            availableStock: p.available,
            maxPerOrder: p.maxPerOrder,
            warnings: w,
            purchasable: !w.any((x) => !x.isPriceChange),
            isActive: p.isActive,
          );
        }(),
    ],
  );

  void _assertQuantity(ProductRow p, int qty) {
    if (!p.isActive) throw const AppFailure.business('Sản phẩm đã ngừng bán.', code: 'PRODUCT_INACTIVE');
    if (qty > p.maxPerOrder) {
      throw AppFailure.business(
        'Mỗi đơn chỉ được mua tối đa ${p.maxPerOrder} sản phẩm này.',
        code: 'MAX_PER_ORDER_EXCEEDED',
      );
    }
    if (qty > p.available) {
      throw AppFailure.conflict(
        p.available <= 0 ? 'Sản phẩm đã hết hàng.' : 'Chỉ còn ${p.available} sản phẩm trong kho.',
        code: p.available <= 0 ? 'OUT_OF_STOCK' : 'INSUFFICIENT_STOCK',
      );
    }
  }

  @override
  Future<Cart> cart() => _server.run(() => _cartOf(_buyer().id));

  @override
  Future<Cart> addToCart(String productId, int quantity) => _server.run(() {
    final u = _buyer();
    final p = _productOr404(productId);
    final existing = _db.cartItems.where((c) => c.userId == u.id && c.productId == productId).firstOrNull;
    final next = (existing?.quantity ?? 0) + quantity;
    _assertQuantity(p, next);
    if (existing == null) {
      _db.cartItems.add(CartItemRow(userId: u.id, productId: productId, quantity: next, priceSnapshot: p.price));
    } else {
      existing
        ..quantity = next
        ..priceSnapshot = p.price;
    }
    return _cartOf(u.id);
  });

  @override
  Future<Cart> updateCartItem(String productId, int quantity) => _server.run(() {
    final u = _buyer();
    final item = _db.cartItems.where((c) => c.userId == u.id && c.productId == productId).firstOrNull;
    if (item == null) throw const AppFailure.notFound('Sản phẩm không có trong giỏ.');
    final p = _productOr404(productId);
    _assertQuantity(p, quantity);
    item
      ..quantity = quantity
      ..priceSnapshot = p.price;
    return _cartOf(u.id);
  });

  @override
  Future<Cart> removeCartItem(String productId) => _server.run(() {
    final u = _buyer();
    _db.cartItems.removeWhere((c) => c.userId == u.id && c.productId == productId);
    return _cartOf(u.id);
  });

  @override
  Future<Cart> clearCart() => _server.run(() {
    final u = _buyer();
    _db.cartItems.removeWhere((c) => c.userId == u.id);
    return _cartOf(u.id);
  });

  @override
  Future<Cart> acceptCartPrices() => _server.run(() {
    final u = _buyer();
    for (final c in _db.cartItems.where((c) => c.userId == u.id)) {
      c.priceSnapshot = _db.product(c.productId).price;
    }
    return _cartOf(u.id);
  });

  // ── Sổ địa chỉ ───────────────────────────────────────────────────────

  static bool _deliverable(String province) {
    String norm(String v) => v.toLowerCase().replaceAll(RegExp(r'^(tp\.?|thành phố|tỉnh)\s+'), '').trim();
    return MockShopConfig.deliveryProvinces.any((p) => norm(p) == norm(province));
  }

  ShopAddress _toAddress(AddressRow a) => ShopAddress(
    id: a.id,
    recipientName: a.recipientName,
    phone: a.phone,
    province: a.province,
    district: a.district,
    ward: a.ward,
    street: a.street,
    isDefault: a.isDefault,
    deliverable: _deliverable(a.province),
  );

  AddressRow _ownAddress(String userId, String id) {
    final a = _db.addresses.where((x) => x.id == id && x.userId == userId).firstOrNull;
    if (a == null) throw const AppFailure.notFound('Không tìm thấy địa chỉ.');
    return a;
  }

  void _validateAddress(AddressInput i) {
    final errors = <String, String>{
      if (i.recipientName.trim().length < 2) 'recipientName': 'Nhập tên người nhận',
      if (!RegExp(r'^(\+?84|0)\d{9,10}$').hasMatch(i.phone.trim())) 'phone': 'Số điện thoại không hợp lệ',
      if (i.province.trim().length < 2) 'province': 'Nhập tỉnh/thành phố',
      if (i.district.trim().length < 2) 'district': 'Nhập quận/huyện',
      if (i.street.trim().length < 3) 'street': 'Nhập số nhà, tên đường',
    };
    if (errors.isNotEmpty) {
      throw AppFailure.validation('Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.', fieldErrors: errors);
    }
  }

  List<AddressRow> _addressesOf(String userId) =>
      _db.addresses.where((a) => a.userId == userId).toList()
        ..sort((a, b) => a.isDefault == b.isDefault ? a.createdAt.compareTo(b.createdAt) : (a.isDefault ? -1 : 1));

  @override
  Future<List<ShopAddress>> addresses() => _server.run(() => _addressesOf(_buyer().id).map(_toAddress).toList());

  @override
  Future<ShopAddress> createAddress(AddressInput input) => _server.run(() {
    final u = _buyer();
    _validateAddress(input);
    final mine = _addressesOf(u.id);
    if (mine.length >= 10) throw const AppFailure.business('Sổ địa chỉ tối đa 10 địa chỉ.', code: 'ADDRESS_LIMIT');
    final makeDefault = mine.isEmpty || input.isDefault;
    if (makeDefault) {
      for (final a in mine) {
        a.isDefault = false;
      }
    }
    final row = AddressRow(
      id: _db.nextId('addr'),
      userId: u.id,
      recipientName: input.recipientName.trim(),
      phone: input.phone.trim(),
      province: input.province.trim(),
      district: input.district.trim(),
      ward: input.ward?.trim().isEmpty ?? true ? null : input.ward!.trim(),
      street: input.street.trim(),
      isDefault: makeDefault,
      createdAt: _db.now(),
    );
    _db.addresses.add(row);
    return _toAddress(row);
  });

  @override
  Future<ShopAddress> updateAddress(String id, AddressInput input) => _server.run(() {
    final u = _buyer();
    final a = _ownAddress(u.id, id);
    _validateAddress(input);
    if (input.isDefault) {
      for (final x in _addressesOf(u.id)) {
        x.isDefault = false;
      }
      a.isDefault = true;
    }
    a
      ..recipientName = input.recipientName.trim()
      ..phone = input.phone.trim()
      ..province = input.province.trim()
      ..district = input.district.trim()
      ..ward = input.ward?.trim().isEmpty ?? true ? null : input.ward!.trim()
      ..street = input.street.trim();
    return _toAddress(a);
  });

  @override
  Future<void> deleteAddress(String id) => _server.run(() {
    final u = _buyer();
    final a = _ownAddress(u.id, id);
    _db.addresses.remove(a);
    if (a.isDefault) _addressesOf(u.id).firstOrNull?.isDefault = true;
  });

  @override
  Future<void> setDefaultAddress(String id) => _server.run(() {
    final u = _buyer();
    final a = _ownAddress(u.id, id);
    for (final x in _addressesOf(u.id)) {
      x.isDefault = false;
    }
    a.isDefault = true;
  });

  // ── Checkout ─────────────────────────────────────────────────────────

  Map<String, ({int qty, int? snapshot})> _lines(String userId, CheckoutRequest r) {
    if (r.mode == CheckoutMode.buyNow) return {for (final e in r.items.entries) e.key: (qty: e.value, snapshot: null)};
    return {
      for (final c in _db.cartItems.where(
        (c) => c.userId == userId && (r.productIds.isEmpty || r.productIds.contains(c.productId)),
      ))
        c.productId: (qty: c.quantity, snapshot: c.priceSnapshot),
    };
  }

  int _orderedToday(String userId, String productId) {
    final start = VnTime.startOfDay(_db.now());
    return _db.shopOrders
        .where(
          (o) =>
              o.userId == userId &&
              !o.createdAt.isBefore(start) &&
              o.status != ShopOrderStatus.expired &&
              o.status != ShopOrderStatus.cancelled,
        )
        .expand((o) => o.lines)
        .where((l) => l.productId == productId)
        .fold(0, (s, l) => s + l.quantity);
  }

  int _pendingCount(String userId) => _db.shopOrders
      .where(
        (o) =>
            o.userId == userId && o.status == ShopOrderStatus.pendingPayment && _db.now().isBefore(o.paymentExpiresAt),
      )
      .length;

  /// Tính toàn bộ đơn từ dữ liệu "server" (giống `evaluate` của BE). [strict] ⇒ ném lỗi đầu tiên.
  CheckoutPreview _evaluate(UserRow u, CheckoutRequest r, {required bool strict}) {
    final issues = <ShopWarning>[];
    void fail(AppFailure f) {
      if (strict) throw f;
      issues.add(ShopWarning(code: f.code ?? 'ERROR', message: f.message));
    }

    final lines = _lines(u.id, r);
    if (lines.isEmpty) fail(const AppFailure.business('Chưa có sản phẩm nào để đặt.', code: 'CART_EMPTY'));
    final locked = _db.checkoutLocks[u.id];
    final lockedUntil = locked != null && _db.now().isBefore(locked) ? locked : null;
    if (lockedUntil != null) {
      fail(
        AppFailure(
          FailureType.forbidden,
          'Bạn đã để quá nhiều đơn hết hạn thanh toán. Tạm khóa đặt hàng tới ${VnTime.dateTime(lockedUntil)}.',
          code: 'CHECKOUT_LOCKED',
        ),
      );
    }

    final out = <CheckoutLine>[];
    for (final e in lines.entries) {
      final p = _productOr404(e.key);
      final w = _warnings(p, e.value.qty, snapshot: e.value.snapshot);
      final used = _orderedToday(u.id, p.id);
      if (used + e.value.qty > p.maxPerDay) {
        w.add(
          ShopWarning(
            code: 'DAILY_LIMIT_EXCEEDED',
            message:
                'Mỗi ngày chỉ được đặt tối đa ${p.maxPerDay} sản phẩm "${p.name}" (hôm nay còn ${p.maxPerDay - used}).',
            remainingToday: p.maxPerDay - used,
          ),
        );
      }
      if (strict) {
        for (final x in w.where((x) => !x.isPriceChange)) {
          final conflict = x.code == 'OUT_OF_STOCK' || x.code == 'INSUFFICIENT_STOCK';
          throw AppFailure(
            conflict ? FailureType.conflict : FailureType.business,
            '${p.name}: ${x.message}',
            code: x.code,
          );
        }
      }
      out.add(
        CheckoutLine(
          productId: p.id,
          productName: p.name,
          imageUrl: p.imageUrl,
          unitPrice: p.price,
          quantity: e.value.qty,
          lineTotal: p.price * e.value.qty,
          warnings: w,
        ),
      );
    }
    final subtotal = out.fold(0, (s, l) => s + l.lineTotal);
    final ship = r.fulfillmentType == FulfillmentType.pickup || subtotal >= MockShopConfig.freeShippingThreshold
        ? 0
        : MockShopConfig.shippingFee;

    var name = r.recipientName ?? u.fullName;
    var phone = r.recipientPhone ?? u.phone;
    String? addressText;
    var deliverable = true;
    if (r.fulfillmentType == FulfillmentType.delivery) {
      final a = r.addressId == null
          ? null
          : _db.addresses.where((x) => x.id == r.addressId && x.userId == u.id).firstOrNull;
      if (r.addressId == null) {
        fail(const AppFailure.business('Vui lòng chọn địa chỉ giao hàng.', code: 'ADDRESS_REQUIRED'));
      } else if (a == null) {
        fail(const AppFailure(FailureType.notFound, 'Không tìm thấy địa chỉ giao hàng.', code: 'ADDRESS_NOT_FOUND'));
      } else {
        final view = _toAddress(a);
        addressText = view.fullAddress;
        deliverable = view.deliverable;
        name = r.recipientName ?? a.recipientName;
        phone = r.recipientPhone ?? a.phone;
        if (!deliverable) {
          fail(
            AppFailure.business(
              'Hiện chỉ giao hàng tại: ${MockShopConfig.deliveryProvinces.join(', ')}.',
              code: 'DELIVERY_NOT_AVAILABLE',
            ),
          );
        }
      }
    }
    if (phone == null || phone.isEmpty) {
      fail(const AppFailure.business('Vui lòng nhập số điện thoại người nhận.', code: 'RECIPIENT_PHONE_REQUIRED'));
    }
    final pending = _pendingCount(u.id);
    if (pending >= MockShopConfig.maxPendingOrders) {
      fail(
        AppFailure.conflict(
          'Bạn đang có $pending đơn chờ thanh toán. Vui lòng thanh toán hoặc hủy bớt trước khi đặt đơn mới.',
          code: 'PENDING_ORDER_LIMIT',
        ),
      );
    }
    final blocking = [...issues, ...out.expand((l) => l.warnings)].where((w) => !w.isPriceChange);
    return CheckoutPreview(
      lines: out,
      subtotal: subtotal,
      shippingFee: ship,
      total: subtotal + ship,
      canCheckout: blocking.isEmpty && out.isNotEmpty,
      warnings: issues,
      recipientName: name,
      recipientPhone: phone,
      addressText: addressText,
      deliverable: deliverable,
      lockedUntil: lockedUntil,
      pendingOrders: pending,
      maxPendingOrders: MockShopConfig.maxPendingOrders,
      holdMinutes: MockShopConfig.holdMinutes,
      freeShippingThreshold: MockShopConfig.freeShippingThreshold,
    );
  }

  @override
  Future<CheckoutPreview> preview(CheckoutRequest request) =>
      _server.run(() => _evaluate(_buyer(), request, strict: false));

  @override
  Future<PlacedOrder> placeOrder(
    CheckoutRequest request, {
    required int expectedTotal,
    required String idempotencyKey,
  }) => _server.run(() {
    final u = _buyer();
    final dup = _db.shopOrders.where((o) => o.userId == u.id && o.idempotencyKey == idempotencyKey).firstOrNull;
    if (dup != null) {
      return PlacedOrder(
        orderId: dup.id,
        orderCode: dup.code,
        paymentId: _db.paymentOfOrder(dup.id)!.id,
        replayed: true,
      );
    }
    final e = _evaluate(u, request, strict: true);
    if (e.total != expectedTotal) {
      throw const AppFailure.conflict(
        'Giá hoặc phí giao hàng đã thay đổi. Vui lòng xem lại đơn trước khi thanh toán.',
        code: 'PRICE_CHANGED',
      );
    }
    // Giữ hàng có điều kiện (một dòng thiếu ⇒ hoàn tác các dòng đã giữ).
    final reserved = <CheckoutLine>[];
    for (final l in e.lines) {
      if (!_db.product(l.productId).isActive || _db.product(l.productId).available < l.quantity) {
        for (final r in reserved) {
          _db.product(r.productId).reservedStock -= r.quantity;
        }
        throw AppFailure.conflict('${l.productName}: sản phẩm vừa hết hàng.', code: 'OUT_OF_STOCK');
      }
      _db.product(l.productId).reservedStock += l.quantity;
      reserved.add(l);
    }
    final now = _db.now();
    final addr = request.fulfillmentType == FulfillmentType.delivery ? e.addressText : null;
    final o = ShopOrderRow(
      id: _db.nextId('ord'),
      code: _db.newShopOrderCode(),
      userId: u.id,
      fulfillmentType: request.fulfillmentType,
      lines: [
        for (final l in e.lines)
          OrderLineRow(
            id: _db.nextId('oi'),
            productId: l.productId,
            productName: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          ),
      ],
      shippingFee: e.shippingFee,
      createdAt: now,
      paymentExpiresAt: now.add(const Duration(minutes: MockShopConfig.holdMinutes)),
      recipientName: e.recipientName,
      recipientPhone: e.recipientPhone,
      shippingAddress: addr,
      note: request.note,
      idempotencyKey: idempotencyKey,
    );
    o.history.add(OrderHistoryRow(to: ShopOrderStatus.pendingPayment, at: now, actorId: u.id, reason: 'Tạo đơn'));
    _db.shopOrders.add(o);
    for (final l in e.lines) {
      _db.inventoryTxs.add(
        InventoryTxRow(
          id: _db.nextId('itx'),
          productId: l.productId,
          type: InventoryTxType.reserve,
          quantity: l.quantity,
          stockAfter: _db.product(l.productId).stockQuantity,
          reservedAfter: _db.product(l.productId).reservedStock,
          createdAt: now,
          orderId: o.id,
          note: 'Giữ hàng cho đơn ${o.code}',
        ),
      );
    }
    final pay = _db.createPendingPayment(
      userId: u.id,
      memberProfileId: _db.memberOfUser(u.id)?.id,
      amount: o.total,
      productOrderId: o.id,
    );
    if (request.mode == CheckoutMode.cart) {
      _db.cartItems.removeWhere((c) => c.userId == u.id && e.lines.any((l) => l.productId == c.productId));
    }
    return PlacedOrder(orderId: o.id, orderCode: o.code, paymentId: pay.id);
  });

  // ── Đơn hàng ─────────────────────────────────────────────────────────

  static const _groups = <OrderGroup, Set<ShopOrderStatus>>{
    OrderGroup.pending: {ShopOrderStatus.pendingPayment},
    OrderGroup.active: {
      ShopOrderStatus.paid,
      ShopOrderStatus.processing,
      ShopOrderStatus.readyForPickup,
      ShopOrderStatus.shipping,
      ShopOrderStatus.delivered,
      ShopOrderStatus.refundRequested,
    },
    OrderGroup.completed: {ShopOrderStatus.completed},
    OrderGroup.closed: {
      ShopOrderStatus.expired,
      ShopOrderStatus.cancelled,
      ShopOrderStatus.notPickedUp,
      ShopOrderStatus.refunded,
    },
  };

  ShopOrder _toOrder(ShopOrderRow o, {required bool owner, bool manager = false}) {
    final pay = _db.paymentOfOrder(o.id);
    final now = _db.now();
    final buyer = _db.user(o.userId);
    final pickupReady = o.status == ShopOrderStatus.readyForPickup;
    return ShopOrder(
      id: o.id,
      code: o.code,
      status: o.status,
      fulfillmentType: o.fulfillmentType,
      subtotal: o.subtotal,
      shippingFee: o.shippingFee,
      total: o.total,
      createdAt: o.createdAt,
      lines: [
        for (final l in o.lines)
          () {
            final review = _db.productReviews.where((r) => r.orderLineId == l.id).firstOrNull;
            return ShopOrderLine(
              id: l.id,
              productId: l.productId,
              productName: l.productName,
              imageUrl: _db.product(l.productId).imageUrl,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              total: l.total,
              review: review == null
                  ? null
                  : OrderLineReview(
                      id: review.id,
                      rating: review.rating,
                      comment: review.comment,
                      isHidden: review.isHidden,
                    ),
              canReview: owner && o.status == ShopOrderStatus.completed && review == null,
            );
          }(),
      ],
      recipientName: o.recipientName,
      recipientPhone: o.recipientPhone,
      recipientPhoneMasked: manager && o.recipientPhone != null
          ? '******${o.recipientPhone!.substring(o.recipientPhone!.length - 4)}'
          : null,
      shippingAddress: o.shippingAddress,
      note: o.note,
      trackingCode: o.trackingCode,
      carrier: o.carrier,
      paymentExpiresAt: o.paymentExpiresAt,
      pickupDeadline: o.pickupDeadline,
      paymentId: pay?.id,
      cancelNote: o.cancelNote,
      history: [
        for (final h in o.history)
          OrderHistoryEntry(
            toStatus: h.to,
            fromStatus: h.from,
            at: h.at,
            reason: h.reason,
            byCustomer: h.actorId == o.userId,
            bySystem: h.actorId == null,
          ),
      ],
      refunds: [
        for (final r in _db.refunds.where((r) => r.orderId == o.id))
          OrderRefundInfo(
            id: r.id,
            status: r.status.name.toUpperCase(),
            amount: r.amount,
            reason: switch (r.reason) {
              RefundReason.orderNotPickedUp => 'ORDER_NOT_PICKED_UP',
              RefundReason.orderLatePayment => 'ORDER_LATE_PAYMENT',
              _ => 'ORDER_CANCELLED',
            },
            rejectReason: r.rejectReason,
          ),
      ],
      pickup: pickupReady
          ? PickupInfo(
              code: owner ? o.pickupCode : null,
              qrPayload: owner && o.pickupCode != null ? 'SCMS-PICKUP:${o.code}:${o.pickupCode}' : null,
              deadline: o.pickupDeadline,
              failedAttempts: o.pickupFailedAttempts,
              lockedUntil: o.pickupLockedUntil != null && now.isBefore(o.pickupLockedUntil!)
                  ? o.pickupLockedUntil
                  : null,
            )
          : null,
      canPay: owner && o.status == ShopOrderStatus.pendingPayment && now.isBefore(o.paymentExpiresAt),
      canCancel: owner && o.status == ShopOrderStatus.pendingPayment,
      canRequestRefund: owner && o.status == ShopOrderStatus.paid,
      canConfirmReceived: owner && o.status == ShopOrderStatus.delivered,
      buyerName: manager ? buyer.fullName : null,
      buyerPhone: manager ? buyer.phone : null,
      allowedTransitions: manager ? (mockManagerTransitions[o.fulfillmentType]![o.status] ?? const []) : const [],
      paymentRequiresReview: pay != null && pay.status == PaymentStatus.success && o.status == ShopOrderStatus.expired,
    );
  }

  ShopOrderRow _own(String userId, String id) {
    final o = _db.shopOrders.where((x) => x.id == id && x.userId == userId).firstOrNull;
    if (o == null) throw const AppFailure.notFound('Không tìm thấy đơn hàng.');
    return o;
  }

  @override
  Future<OrderList> myOrders(OrderGroup group) => _server.run(() {
    final u = _buyer();
    final mine = _db.shopOrders.where((o) => o.userId == u.id).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    int count(OrderGroup g) => mine.where((o) => _groups[g]!.contains(o.status)).length;
    return OrderList(
      orders: mine.where((o) => _groups[group]!.contains(o.status)).map((o) => _toOrder(o, owner: true)).toList(),
      counts: OrderCounts(
        pending: count(OrderGroup.pending),
        active: count(OrderGroup.active),
        completed: count(OrderGroup.completed),
        closed: count(OrderGroup.closed),
      ),
    );
  });

  @override
  Future<ShopOrder> myOrder(String id) => _server.run(() => _toOrder(_own(_buyer().id, id), owner: true));

  @override
  Future<ShopOrder> cancelOrder(String id, {String? reason}) => _server.run(() {
    final u = _buyer();
    final o = _own(u.id, id);
    if (o.status != ShopOrderStatus.pendingPayment) {
      throw AppFailure.conflict(
        o.status == ShopOrderStatus.paid
            ? 'Đơn đã thanh toán — vui lòng gửi yêu cầu hoàn tiền thay vì hủy.'
            : 'Không thể hủy đơn ở trạng thái hiện tại.',
        code: o.status == ShopOrderStatus.paid ? 'ORDER_PAID_USE_REFUND' : 'ORDER_NOT_CANCELLABLE',
      );
    }
    _db.closePendingOrder(o, expired: false, actorId: u.id, note: reason);
    return _toOrder(o, owner: true);
  });

  @override
  Future<ShopOrder> requestRefund(String id, String reason) => _server.run(() {
    final u = _buyer();
    final o = _own(u.id, id);
    if (o.status != ShopOrderStatus.paid) {
      throw const AppFailure.conflict(
        'Đơn ở trạng thái này không thể yêu cầu hoàn tiền.',
        code: 'ORDER_NOT_REFUNDABLE',
      );
    }
    _db.transitionOrder(o, ShopOrderStatus.refundRequested, actorId: u.id, reason: reason, notifyBuyer: false);
    _db.createOrderRefund(o, RefundReason.orderCancelled, o.total, note: reason);
    return _toOrder(o, owner: true);
  });

  @override
  Future<ShopOrder> confirmReceived(String id) => _server.run(() {
    final u = _buyer();
    final o = _own(u.id, id);
    if (o.status != ShopOrderStatus.delivered) {
      throw const AppFailure.conflict('Chỉ xác nhận được đơn đã giao.', code: 'ORDER_NOT_DELIVERED');
    }
    _db.transitionOrder(
      o,
      ShopOrderStatus.completed,
      actorId: u.id,
      reason: 'Khách xác nhận đã nhận hàng',
      notifyBuyer: false,
    );
    return _toOrder(o, owner: true);
  });

  @override
  Future<void> reviewItem(String orderItemId, int rating, String? comment) => _server.run(() {
    final u = _buyer();
    final o = _db.shopOrders.where((x) => x.userId == u.id && x.lines.any((l) => l.id == orderItemId)).firstOrNull;
    if (o == null) throw const AppFailure.notFound('Không tìm thấy sản phẩm trong đơn của bạn.');
    if (o.status != ShopOrderStatus.completed) {
      throw const AppFailure.forbidden('Chỉ đánh giá được sản phẩm trong đơn đã hoàn tất.');
    }
    if (_db.productReviews.any((r) => r.orderLineId == orderItemId)) {
      throw const AppFailure.conflict('Bạn đã đánh giá sản phẩm này trong đơn.', code: 'REVIEW_EXISTS');
    }
    if (rating < 1 || rating > 5) throw const AppFailure.validation('Đánh giá từ 1 đến 5 sao.');
    final line = o.lines.firstWhere((l) => l.id == orderItemId);
    final c = comment?.trim();
    _db.productReviews.add(
      ProductReviewRow(
        id: _db.nextId('rv'),
        productId: line.productId,
        userId: u.id,
        rating: rating,
        createdAt: _db.now(),
        comment: c == null || c.isEmpty ? null : c,
        orderLineId: orderItemId,
      ),
    );
  });

  // ── Manager ──────────────────────────────────────────────────────────

  @override
  Future<ShopSummary> managerSummary() => _server.run(() {
    _server.requireRole(UserRole.manager);
    int n(ShopOrderStatus s) => _db.shopOrders.where((o) => o.status == s).length;
    return ShopSummary(
      needsAction:
          n(ShopOrderStatus.paid) +
          n(ShopOrderStatus.processing) +
          n(ShopOrderStatus.shipping) +
          n(ShopOrderStatus.readyForPickup),
      toPrepare: n(ShopOrderStatus.paid) + n(ShopOrderStatus.processing),
      readyForPickup: n(ShopOrderStatus.readyForPickup),
      shipping: n(ShopOrderStatus.shipping),
      refundRequested: n(ShopOrderStatus.refundRequested),
      lowStockProducts: _db.products.where((p) => p.isActive && p.available <= p.lowStockThreshold).length,
    );
  });

  @override
  Future<Paged<ShopOrder>> managerOrders({
    OrderGroup? group,
    FulfillmentType? type,
    String search = '',
    int page = 1,
  }) => _server.run(() {
    _server.requireRole(UserRole.manager);
    final q = search.trim().toLowerCase();
    final list =
        _db.shopOrders
            .where((o) => group == null || _groups[group]!.contains(o.status))
            .where((o) => type == null || o.fulfillmentType == type)
            .where(
              (o) =>
                  q.isEmpty ||
                  o.code.toLowerCase().contains(q) ||
                  (o.recipientName ?? '').toLowerCase().contains(q) ||
                  (o.recipientPhone ?? '').contains(q) ||
                  (o.trackingCode ?? '').toLowerCase().contains(q),
            )
            .toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return Paged.slice(list.map((o) => _toOrder(o, owner: false, manager: true)).toList(), page: page, limit: 20);
  });

  ShopOrderRow _orderOr404(String id) {
    final o = _db.shopOrders.where((x) => x.id == id).firstOrNull;
    if (o == null) throw const AppFailure.notFound('Không tìm thấy đơn hàng.');
    return o;
  }

  @override
  Future<ShopOrder> managerOrder(String id) => _server.run(() {
    _server.requireRole(UserRole.manager);
    return _toOrder(_orderOr404(id), owner: false, manager: true);
  });

  @override
  Future<ShopOrder> transition(
    String id,
    ShopOrderStatus to, {
    String? reason,
    String? trackingCode,
    String? carrier,
  }) => _server.run(() {
    final m = _server.requireRole(UserRole.manager);
    final o = _orderOr404(id);
    final allowed = mockManagerTransitions[o.fulfillmentType]![o.status] ?? const [];
    if (!allowed.contains(to)) {
      throw const AppFailure.conflict('Không thể chuyển đơn sang trạng thái này.', code: 'ORDER_INVALID_TRANSITION');
    }
    switch (to) {
      case ShopOrderStatus.cancelled:
        _db.closePendingOrder(o, expired: false, actorId: m.id, note: reason ?? 'Quản lý hủy đơn');
      case ShopOrderStatus.readyForPickup:
        o
          ..pickupCode = _db.newPickupCode()
          ..pickupDeadline = _db.now().add(const Duration(days: MockShopConfig.pickupDays))
          ..pickupFailedAttempts = 0
          ..pickupLockedUntil = null;
        _db.transitionOrder(
          o,
          to,
          actorId: m.id,
          reason: reason,
          notice: 'Đơn ${o.code} đã sẵn sàng. Mang mã nhận hàng tới quầy để nhận.',
        );
      case ShopOrderStatus.shipping:
        if (trackingCode == null || trackingCode.trim().length < 3) {
          throw const AppFailure.business(
            'Vui lòng nhập mã vận đơn trước khi chuyển sang Đang giao.',
            code: 'TRACKING_CODE_REQUIRED',
          );
        }
        o
          ..trackingCode = trackingCode.trim()
          ..carrier = carrier?.trim();
        _db.transitionOrder(
          o,
          to,
          actorId: m.id,
          reason: reason,
          notice: 'Đơn ${o.code} đang được giao. Mã vận đơn: ${o.trackingCode}.',
        );
      case ShopOrderStatus.refundRequested:
        o.cancelNote = reason;
        _db.transitionOrder(
          o,
          to,
          actorId: m.id,
          reason: reason ?? 'Trung tâm hủy đơn',
          notice: 'Trung tâm đã hủy đơn ${o.code}. Bạn sẽ được hoàn tiền.',
        );
        _db.createOrderRefund(o, RefundReason.orderCancelled, o.total, note: reason ?? 'Trung tâm hủy đơn');
      case ShopOrderStatus.notPickedUp:
        _db.markNotPickedUp(o, actorId: m.id);
      default:
        _db.transitionOrder(o, to, actorId: m.id, reason: reason);
    }
    return _toOrder(o, owner: false, manager: true);
  });

  ({String? orderCode, String code}) _parse(String raw) {
    final parts = raw.trim().split(':');
    if (parts.length == 3 && parts.first.toUpperCase() == 'SCMS-PICKUP') {
      return (orderCode: parts[1].trim().toUpperCase(), code: parts[2].replaceAll(RegExp(r'[\s-]'), '').toUpperCase());
    }
    return (orderCode: null, code: raw.replaceAll(RegExp(r'[\s-]'), '').toUpperCase());
  }

  @override
  Future<PickupLookup> verifyPickup(String code) => _server.run(() {
    _server.requireRole(UserRole.manager);
    final p = _parse(code);
    final o = _db.shopOrders
        .where(
          (x) =>
              x.status == ShopOrderStatus.readyForPickup &&
              x.pickupCode == p.code &&
              (p.orderCode == null || p.orderCode == x.code),
        )
        .firstOrNull;
    if (o == null) {
      throw const AppFailure.business(
        'Mã nhận hàng không đúng hoặc đơn không ở trạng thái chờ nhận.',
        code: 'PICKUP_CODE_INVALID',
      );
    }
    return PickupLookup(order: _toOrder(o, owner: false, manager: true), lockedUntil: o.pickupLockedUntil);
  });

  @override
  Future<ShopOrder> confirmPickup(String orderId, String code, String phoneLast4) => _server.run(() {
    final m = _server.requireRole(UserRole.manager);
    final o = _orderOr404(orderId);
    if (o.status != ShopOrderStatus.readyForPickup) {
      throw AppFailure.conflict(
        o.status == ShopOrderStatus.completed
            ? 'Đơn đã được giao — mã nhận hàng đã dùng.'
            : 'Đơn không ở trạng thái chờ nhận.',
        code: o.status == ShopOrderStatus.completed ? 'PICKUP_CODE_USED' : 'ORDER_NOT_READY',
      );
    }
    final now = _db.now();
    if (o.pickupLockedUntil != null && now.isBefore(o.pickupLockedUntil!)) {
      throw const AppFailure.business('Nhập sai quá nhiều lần — tạm khóa xác nhận đơn này.', code: 'PICKUP_LOCKED');
    }
    final p = _parse(code);
    final codeOk = o.pickupCode != null && p.code == o.pickupCode && (p.orderCode == null || p.orderCode == o.code);
    final phone = (o.recipientPhone ?? '').replaceAll(RegExp(r'\D'), '');
    final phoneOk = phone.isEmpty || phone.endsWith(phoneLast4);
    if (!codeOk || !phoneOk) {
      o.pickupFailedAttempts++;
      if (o.pickupFailedAttempts >= MockShopConfig.pickupMaxAttempts) {
        o
          ..pickupFailedAttempts = 0
          ..pickupLockedUntil = now.add(const Duration(minutes: MockShopConfig.pickupLockMinutes));
        throw const AppFailure.business('Nhập sai quá nhiều lần — tạm khóa xác nhận đơn này.', code: 'PICKUP_LOCKED');
      }
      throw AppFailure.business(
        !codeOk ? 'Mã nhận hàng không đúng.' : '4 số cuối số điện thoại không khớp người nhận.',
        code: !codeOk ? 'PICKUP_CODE_INVALID' : 'PHONE_MISMATCH',
      );
    }
    o.pickupCode = null;
    _db.transitionOrder(
      o,
      ShopOrderStatus.completed,
      actorId: m.id,
      reason: 'Giao hàng tại quầy (đã đối chiếu mã + SĐT)',
      notice: 'Bạn đã nhận đơn ${o.code} tại quầy. Hãy đánh giá sản phẩm nhé!',
    );
    return _toOrder(o, owner: false, manager: true);
  });

  @override
  Future<List<InventoryItem>> inventory({bool lowStockOnly = false, String search = ''}) => _server.run(() {
    _server.requireRole(UserRole.manager);
    final q = search.trim().toLowerCase();
    final list =
        [
          for (final p in _db.products.where((p) => q.isEmpty || p.name.toLowerCase().contains(q)))
            InventoryItem(
              id: p.id,
              name: p.name,
              imageUrl: p.imageUrl,
              price: p.price,
              isActive: p.isActive,
              stockQuantity: p.stockQuantity,
              reservedStock: p.reservedStock,
              availableStock: p.available,
              lowStockThreshold: p.lowStockThreshold,
              lowStock: p.isActive && p.available <= p.lowStockThreshold,
              maxPerOrder: p.maxPerOrder,
              maxPerDay: p.maxPerDay,
            ),
        ].where((i) => !lowStockOnly || i.lowStock).toList()..sort(
          (a, b) => a.lowStock == b.lowStock ? a.availableStock.compareTo(b.availableStock) : (a.lowStock ? -1 : 1),
        );
    return list;
  });

  @override
  Future<void> changeInventory(
    String productId, {
    required bool inbound,
    required int quantity,
    required String note,
  }) => _server.run(() {
    _server.requireRole(UserRole.manager);
    final p = _productOr404(productId);
    if (note.trim().length < 3) {
      throw const AppFailure.validation(
        'Nhập ghi chú (tối thiểu 3 ký tự).',
        fieldErrors: {'note': 'Tối thiểu 3 ký tự'},
      );
    }
    if (quantity == 0 || (inbound && quantity < 0)) {
      throw const AppFailure.validation('Số lượng không hợp lệ.', fieldErrors: {'quantity': 'Số lượng không hợp lệ'});
    }
    final ok = _db.applyInventory(
      productId,
      inbound ? InventoryTxType.inbound : InventoryTxType.adjust,
      quantity,
      note: note.trim(),
    );
    if (!ok) {
      throw AppFailure.conflict(
        'Không thể giảm tồn xuống dưới số đang giữ cho đơn chờ thanh toán (${p.reservedStock}).',
        code: 'STOCK_BELOW_RESERVED',
      );
    }
  });

  @override
  Future<List<InventoryTx>> inventoryTransactions(String productId) => _server.run(() {
    _server.requireRole(UserRole.manager);
    return [
      for (final t in _db.inventoryTxs.where((t) => t.productId == productId).toList().reversed)
        InventoryTx(
          id: t.id,
          type: t.type,
          quantity: t.quantity,
          stockAfter: t.stockAfter,
          reservedAfter: t.reservedAfter,
          createdAt: t.createdAt,
          orderCode: t.orderId == null ? null : _db.shopOrders.where((o) => o.id == t.orderId).firstOrNull?.code,
          note: t.note,
        ),
    ];
  });

  @override
  Future<void> setReviewHidden(String reviewId, bool hidden, {String? reason}) => _server.run(() {
    _server.requireRole(UserRole.manager);
    final r = _db.productReviews.where((x) => x.id == reviewId).firstOrNull;
    if (r == null) throw const AppFailure.notFound('Không tìm thấy đánh giá.');
    r.isHidden = hidden;
  });
}
