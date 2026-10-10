import '../core/network/api_client.dart';
import '../core/network/json.dart';
import '../features/shop/domain/entities/shop.dart';

/// Ánh xạ JSON module `shop` của BE ⇒ entity (Doc/SHOP_FLOW_DESIGN.md §6).
abstract final class ShopJson {
  static ShopWarning warning(Json j) => ShopWarning(
    code: j.str('code'),
    message: j.str('message'),
    available: j.intOrNull('available'),
    oldPrice: j.intOrNull('oldPrice'),
    newPrice: j.intOrNull('newPrice'),
    maxPerOrder: j.intOrNull('maxPerOrder'),
    remainingToday: j.intOrNull('remainingToday'),
  );

  static ShopConfig config(Json j) => ShopConfig(
    holdMinutes: j.integer('holdMinutes', 15),
    maxPendingOrders: j.integer('maxPendingOrders', 2),
    pickupDays: j.integer('pickupDays', 3),
    shippingFee: j.money('shippingFee'),
    freeShippingThreshold: j.money('freeShippingThreshold'),
    deliveryProvinces: j.strList('deliveryProvinces'),
  );

  static Cart cart(Json j) => Cart(
    lines: [
      for (final i in j.objList('items'))
        CartLine(
          productId: i.str('productId'),
          productName: i.str('productName'),
          imageUrl: ApiClient.absoluteUrl(i.strOrNull('imageUrl')),
          unitPrice: i.money('unitPrice'),
          quantity: i.integer('quantity', 1),
          availableStock: i.integer('availableStock'),
          maxPerOrder: i.integer('maxPerOrder', 10),
          warnings: i.objList('warnings').map(warning).toList(),
          purchasable: i.boolean('purchasable', true),
          isActive: i.boolean('isActive', true),
        ),
    ],
  );

  static ShopAddress address(Json j) => ShopAddress(
    id: j.str('id'),
    recipientName: j.str('recipientName'),
    phone: j.str('phone'),
    province: j.str('province'),
    district: j.str('district'),
    ward: j.strOrNull('ward'),
    street: j.str('street'),
    isDefault: j.boolean('isDefault'),
    deliverable: j.boolean('deliverable', true),
  );

  static Map<String, Object?> addressBody(AddressInput a) => {
    'recipientName': a.recipientName.trim(),
    'phone': a.phone.trim(),
    'province': a.province.trim(),
    'district': a.district.trim(),
    if (a.ward != null && a.ward!.trim().isNotEmpty) 'ward': a.ward!.trim(),
    'street': a.street.trim(),
    if (a.isDefault) 'isDefault': true,
  };

  static Map<String, Object?> checkoutBody(CheckoutRequest r) => {
    'mode': r.mode == CheckoutMode.cart ? 'CART' : 'BUY_NOW',
    if (r.mode == CheckoutMode.cart && r.productIds.isNotEmpty) 'productIds': r.productIds,
    if (r.mode == CheckoutMode.buyNow)
      'items': [
        for (final e in r.items.entries) {'productId': e.key, 'quantity': e.value},
      ],
    'fulfillmentType': r.fulfillmentType == FulfillmentType.pickup ? 'PICKUP' : 'DELIVERY',
    if (r.fulfillmentType == FulfillmentType.delivery && r.addressId != null) 'addressId': r.addressId,
    if (r.recipientName != null && r.recipientName!.trim().isNotEmpty) 'recipientName': r.recipientName!.trim(),
    if (r.recipientPhone != null && r.recipientPhone!.trim().isNotEmpty) 'recipientPhone': r.recipientPhone!.trim(),
    if (r.note != null && r.note!.trim().isNotEmpty) 'note': r.note!.trim(),
  };

  static CheckoutPreview preview(Json j) {
    final recipient = j.obj('recipient');
    final address = j.objOrNull('address');
    return CheckoutPreview(
      lines: [
        for (final l in j.objList('lines'))
          CheckoutLine(
            productId: l.str('productId'),
            productName: l.str('productName'),
            imageUrl: ApiClient.absoluteUrl(l.strOrNull('imageUrl')),
            unitPrice: l.money('unitPrice'),
            quantity: l.integer('quantity'),
            lineTotal: l.money('lineTotal'),
            warnings: l.objList('warnings').map(warning).toList(),
          ),
      ],
      subtotal: j.money('subtotal'),
      shippingFee: j.money('shippingFee'),
      total: j.money('total'),
      canCheckout: j.boolean('canCheckout'),
      warnings: j.objList('warnings').map(warning).toList(),
      recipientName: recipient.strOrNull('recipientName'),
      recipientPhone: recipient.strOrNull('recipientPhone'),
      addressText: address?.strOrNull('fullAddress') ?? recipient.strOrNull('shippingAddress'),
      deliverable: address?.boolean('deliverable', true) ?? true,
      lockedUntil: j.dateOrNull('lockedUntil'),
      pendingOrders: j.integer('pendingOrders'),
      maxPendingOrders: j.integer('maxPendingOrders', 2),
      holdMinutes: j.integer('holdMinutes', 15),
      freeShippingThreshold: j.money('freeShippingThreshold'),
    );
  }

  static PlacedOrder placed(Json j) {
    final order = j.obj('order');
    final checkout = j.obj('checkout');
    return PlacedOrder(
      orderId: order.str('id'),
      orderCode: order.str('code'),
      paymentId: checkout.str('paymentId'),
      replayed: j.boolean('replayed'),
    );
  }

  static ShopOrderStatus status(String? raw) =>
      parseBeEnum(raw, ShopOrderStatus.values) ?? ShopOrderStatus.pendingPayment;

  static ShopOrder order(Json j) {
    final actions = j.obj('actions');
    final pickup = j.objOrNull('pickup');
    final payment = j.objOrNull('payment');
    final buyer = j.objOrNull('buyer');
    return ShopOrder(
      id: j.str('id'),
      code: j.str('code'),
      status: status(j.strOrNull('status')),
      fulfillmentType: j.str('fulfillmentType') == 'DELIVERY' ? FulfillmentType.delivery : FulfillmentType.pickup,
      subtotal: j.money('subtotal'),
      shippingFee: j.money('shippingFee'),
      total: j.money('total'),
      createdAt: j.date('createdAt'),
      lines: [
        for (final i in j.objList('items'))
          ShopOrderLine(
            id: i.str('id'),
            productId: i.str('productId'),
            productName: i.str('productName'),
            imageUrl: ApiClient.absoluteUrl(i.strOrNull('productImageUrl')),
            quantity: i.integer('quantity'),
            unitPrice: i.money('unitPrice'),
            total: i.money('totalAmount'),
            canReview: i.boolean('canReview'),
            review: switch (i.objOrNull('review')) {
              final r? => OrderLineReview(
                id: r.str('id'),
                rating: r.integer('rating'),
                comment: r.strOrNull('comment'),
                isHidden: r.boolean('isHidden'),
              ),
              null => null,
            },
          ),
      ],
      recipientName: j.strOrNull('recipientName'),
      recipientPhone: j.strOrNull('recipientPhone'),
      recipientPhoneMasked: j.strOrNull('recipientPhoneMasked'),
      shippingAddress: j.strOrNull('shippingAddress'),
      note: j.strOrNull('note'),
      trackingCode: j.strOrNull('trackingCode'),
      carrier: j.strOrNull('carrier'),
      paymentExpiresAt: j.dateOrNull('paymentExpiresAt'),
      pickupDeadline: j.dateOrNull('pickupDeadline'),
      paymentId: j.strOrNull('paymentId') ?? payment?.strOrNull('id'),
      cancelNote: j.strOrNull('cancelNote'),
      history: [
        for (final h in j.objList('history'))
          OrderHistoryEntry(
            toStatus: status(h.strOrNull('toStatus')),
            fromStatus: h.strOrNull('fromStatus') == null ? null : status(h.strOrNull('fromStatus')),
            at: h.date('createdAt'),
            reason: h.strOrNull('reason'),
            byCustomer: h.boolean('byCustomer'),
            bySystem: h.boolean('bySystem'),
          ),
      ],
      refunds: [
        for (final r in j.objList('refunds'))
          OrderRefundInfo(
            id: r.str('id'),
            status: r.str('status'),
            amount: r.money('amount'),
            reason: r.str('reason'),
            rejectReason: r.strOrNull('rejectReason'),
          ),
      ],
      pickup: pickup == null
          ? null
          : PickupInfo(
              code: pickup.strOrNull('code'),
              qrPayload: pickup.strOrNull('qrPayload'),
              deadline: pickup.dateOrNull('deadline'),
              failedAttempts: pickup.integer('failedAttempts'),
              lockedUntil: pickup.dateOrNull('lockedUntil'),
            ),
      canPay: actions.boolean('canPay'),
      canCancel: actions.boolean('canCancel'),
      canRequestRefund: actions.boolean('canRequestRefund'),
      canConfirmReceived: actions.boolean('canConfirmReceived'),
      buyerName: buyer?.strOrNull('fullName'),
      buyerPhone: buyer?.strOrNull('phone'),
      allowedTransitions: [for (final t in j.objList('allowedTransitions')) status(t.strOrNull('status'))],
      paymentRequiresReview: payment?.boolean('requiresReview') ?? false,
    );
  }

  static OrderCounts counts(Json j) => OrderCounts(
    pending: j.integer('PENDING'),
    active: j.integer('ACTIVE'),
    completed: j.integer('COMPLETED'),
    closed: j.integer('CLOSED'),
  );

  static String group(OrderGroup g) => switch (g) {
    OrderGroup.pending => 'PENDING',
    OrderGroup.active => 'ACTIVE',
    OrderGroup.completed => 'COMPLETED',
    OrderGroup.closed => 'CLOSED',
  };

  static ShopSummary summary(Json j) => ShopSummary(
    needsAction: j.integer('needsAction'),
    toPrepare: j.integer('toPrepare'),
    readyForPickup: j.integer('readyForPickup'),
    shipping: j.integer('shipping'),
    refundRequested: j.integer('refundRequested'),
    lowStockProducts: j.integer('lowStockProducts'),
  );

  static InventoryItem inventory(Json j) => InventoryItem(
    id: j.str('id'),
    name: j.str('name'),
    imageUrl: ApiClient.absoluteUrl(j.strOrNull('imageUrl')),
    price: j.money('price'),
    isActive: j.boolean('isActive', true),
    stockQuantity: j.integer('stockQuantity'),
    reservedStock: j.integer('reservedStock'),
    availableStock: j.integer('availableStock'),
    lowStockThreshold: j.integer('lowStockThreshold', 5),
    lowStock: j.boolean('lowStock'),
    maxPerOrder: j.integer('maxPerOrder', 10),
    maxPerDay: j.integer('maxPerDay', 20),
  );

  static InventoryTx inventoryTx(Json j) => InventoryTx(
    id: j.str('id'),
    type: switch (j.str('type')) {
      'IN' => InventoryTxType.inbound,
      'RESERVE' => InventoryTxType.reserve,
      'RELEASE' => InventoryTxType.release,
      'SALE' => InventoryTxType.sale,
      'RETURN' => InventoryTxType.returned,
      _ => InventoryTxType.adjust,
    },
    quantity: j.integer('quantity'),
    stockAfter: j.integer('stockAfter'),
    reservedAfter: j.integer('reservedAfter'),
    createdAt: j.date('createdAt'),
    orderCode: j.objOrNull('order')?.strOrNull('code'),
    note: j.strOrNull('note'),
  );
}
