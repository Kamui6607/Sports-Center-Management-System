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
    pickupMaxDaysAhead: j.integer('pickupMaxDaysAhead', 7),
    pickupMaxReschedules: j.integer('pickupMaxReschedules', 1),
    pickupRescheduleMaxDays: j.integer('pickupRescheduleMaxDays', 3),
    cashMaxOrderValue: j.money('cashMaxOrderValue'),
  );

  /// "YYYY-MM-DD" (ngày theo giờ VN) ⇒ DateTime chỉ phần ngày.
  static DateTime? day(String? raw) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw ?? '');
    return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  }

  static String dayString(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static Cart cart(Json j) => Cart(
    lines: [
      for (final i in j.objList('items'))
        CartLine(
          productId: i.str('productId'),
          productName: i.str('productName'),
          imageUrl: ApiClient.absoluteUrl(i.strOrNull('imageUrl') ?? i.strOrNull('productImageUrl')),
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
    provinceCode: j.intOrNull('provinceCode'),
    wardCode: j.intOrNull('wardCode'),
  );

  static LocationItem location(Json j) =>
      LocationItem(code: j.integer('code'), name: j.str('name'), deliverable: j.boolean('deliverable', true));

  static Map<String, Object?> addressBody(AddressInput a) => {
    'recipientName': a.recipientName.trim(),
    'phone': a.phone.trim(),
    'province': a.province.trim(),
    // Địa giới 2 cấp (từ 01/07/2025) không còn Quận/Huyện ⇒ chỉ gửi khi có.
    'district': a.district.trim().isEmpty ? null : a.district.trim(),
    if (a.ward != null && a.ward!.trim().isNotEmpty) 'ward': a.ward!.trim(),
    'provinceCode': a.provinceCode,
    'wardCode': a.wardCode,
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
    if (r.fulfillmentType == FulfillmentType.pickup) ...{
      'paymentMethod': r.paymentMethod == ShopPaymentMethod.cash ? 'CASH' : 'SEPAY',
      if (r.pickupDate != null) 'pickupDate': dayString(r.pickupDate!),
    },
    if (r.fulfillmentType == FulfillmentType.delivery && r.addressId != null) 'addressId': r.addressId,
    if (r.recipientName != null && r.recipientName!.trim().isNotEmpty) 'recipientName': r.recipientName!.trim(),
    if (r.recipientPhone != null && r.recipientPhone!.trim().isNotEmpty) 'recipientPhone': r.recipientPhone!.trim(),
    if (r.note != null && r.note!.trim().isNotEmpty) 'note': r.note!.trim(),
  };

  static CheckoutPreview preview(Json j) {
    final recipient = j.obj('recipient');
    final address = j.objOrNull('address');
    final range = j.objOrNull('pickupDateRange');
    final cash = j.objOrNull('cash');
    return CheckoutPreview(
      lines: [
        for (final l in j.objList('lines'))
          CheckoutLine(
            productId: l.str('productId'),
            productName: l.str('productName'),
            imageUrl: ApiClient.absoluteUrl(l.strOrNull('imageUrl') ?? l.strOrNull('productImageUrl')),
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
      pickupDateMin: day(range?.strOrNull('min')),
      pickupDateMax: day(range?.strOrNull('max')),
      pickupDays: j.integer('pickupDays', 3),
      cashAvailable: cash?.boolean('available') ?? false,
      cashUnavailableReason: cash?.strOrNull('reason'),
    );
  }

  static PlacedOrder placed(Json j) {
    final order = j.obj('order');
    // Đơn trả tại quầy: `checkout = null` (không có QR).
    final checkout = j.objOrNull('checkout');
    return PlacedOrder(
      orderId: order.str('id'),
      orderCode: order.str('code'),
      paymentId: checkout?.strOrNull('paymentId'),
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
            imageUrl: ApiClient.absoluteUrl(i.strOrNull('productImageUrl') ?? i.strOrNull('imageUrl')),
            quantity: i.integer('quantity'),
            unitPrice: i.money('unitPrice'),
            total: i.money('totalAmount'),
            canReview: i.boolean('canReview'),
            canEditReview: i.boolean('canEditReview'),
            isReviewExpired: i.boolean('isReviewExpired'),
            review: switch (i.objOrNull('review')) {
              final r? => OrderLineReview(
                id: r.str('id'),
                rating: r.integer('rating'),
                comment: r.strOrNull('comment'),
                isAnonymous: r.boolean('isAnonymous'),
                editCount: r.integer('editCount'),
                canEdit: r.boolean('canEdit'),
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
            grossAmount: r.intOrNull('grossAmount'),
            feePercent: r.intOrNull('feePercent'),
            bankName: r.strOrNull('bankName'),
            bankAccountNumber: r.strOrNull('bankAccountNumber'),
            bankAccountName: r.strOrNull('bankAccountName'),
            payoutMethod: r.strOrNull('payoutMethod'),
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
              latePickupUntil: pickup.dateOrNull('latePickupUntil'),
            ),
      canPay: actions.boolean('canPay'),
      canCancel: actions.boolean('canCancel'),
      canRequestRefund: actions.boolean('canRequestRefund'),
      canConfirmReceived: actions.boolean('canConfirmReceived'),
      buyerName: buyer?.strOrNull('fullName'),
      buyerPhone: buyer?.strOrNull('phone'),
      allowedTransitions: [for (final t in j.objList('allowedTransitions')) status(t.strOrNull('status'))],
      paymentRequiresReview: payment?.boolean('requiresReview') ?? false,
      paymentMethod: j.strOrNull('paymentMethod') == 'CASH' ? ShopPaymentMethod.cash : ShopPaymentMethod.sepay,
      isPaid: j.boolean('isPaid'),
      preferredPickupDate: day(j.strOrNull('preferredPickupDate')),
      pickupRescheduleCount: j.integer('pickupRescheduleCount'),
      amountDueAtCounter: j.money('amountDueAtCounter'),
      canReschedulePickup: actions.boolean('canReschedulePickup'),
      canUpdateRefundBank: actions.boolean('canUpdateRefundBank'),
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
