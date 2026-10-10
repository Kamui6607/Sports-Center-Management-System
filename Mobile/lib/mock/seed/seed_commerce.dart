import '../../features/payments/domain/entities/payment.dart';
import '../../features/shop/domain/entities/shop.dart';
import '../mock_tables.dart';
import '../shop_operations.dart';
import 'seed_helpers.dart';

/// Sản phẩm, đánh giá, giỏ hàng, sổ địa chỉ, đơn hàng ở đủ trạng thái (Doc/SHOP_FLOW_DESIGN.md).
void seedCommerce(Seeder s) {
  final db = s.db;

  void product(String id, String name, String desc, int price, int stock, {int maxPerOrder = 10}) => db.products.add(
    ProductRow(id: id, name: name, description: desc, price: price, stockQuantity: stock, maxPerOrder: maxPerOrder),
  );

  product(
    'p-water',
    'Nước khoáng Lavie 500ml',
    'Nước khoáng thiên nhiên, bổ sung khoáng chất sau buổi tập.',
    10000,
    240,
  );
  product('p-electro', 'Nước điện giải Revive', 'Bù nước và chất điện giải nhanh sau khi vận động mạnh.', 15000, 120);
  product(
    'p-whey',
    'Whey Protein Gold 2.27kg',
    'Whey isolate 24g protein/lần dùng, vị chocolate. Hỗ trợ phục hồi và tăng cơ.',
    1650000,
    8,
    maxPerOrder: 2,
  );
  product(
    'p-bcaa',
    'BCAA 2:1:1 (30 lần dùng)',
    'Axit amin chuỗi nhánh giảm mỏi cơ trong lúc tập.',
    650000,
    3,
    maxPerOrder: 2,
  );
  product('p-bar', 'Thanh năng lượng yến mạch', 'Bổ sung năng lượng nhanh trước buổi tập, ít đường.', 35000, 60);
  product('p-mat', 'Thảm Yoga TPE 6mm', 'Thảm chống trơn hai mặt, nhẹ, kèm dây đeo.', 420000, 15);
  product('p-gloves', 'Găng tay Boxing 12oz', 'Găng da PU, đệm mút 3 lớp, phù hợp tập bao.', 550000, 0);
  product('p-goggles', 'Kính bơi chống mờ', 'Tròng chống tia UV, dây silicone điều chỉnh.', 180000, 25);
  product('p-cap', 'Mũ bơi silicone', 'Co giãn tốt, bảo vệ tóc khỏi clo.', 90000, 40);
  product('p-band', 'Dây kháng lực bộ 5 mức', 'Dây cao su latex, 5 mức lực từ nhẹ đến rất nặng.', 250000, 18);
  product('p-bottle', 'Bình nước thể thao 1L', 'Nhựa Tritan không BPA, có vạch chia giờ uống.', 120000, 35);
  product('p-towel', 'Khăn tập microfiber', 'Thấm hút nhanh, khô nhanh, kích thước 40×80cm.', 80000, 50);

  // ── Sổ địa chỉ + giỏ hàng (u-m1) ───────────────────────────────────────
  db.addresses.addAll([
    AddressRow(
      id: 'addr-m1-home',
      userId: 'u-m1',
      recipientName: 'Phạm Văn An',
      phone: '0901234567',
      province: 'Hồ Chí Minh',
      district: 'Quận 3',
      ward: 'Phường 6',
      street: '25 Võ Văn Tần',
      isDefault: true,
      createdAt: s.at(-30),
    ),
    AddressRow(
      id: 'addr-m1-hn',
      userId: 'u-m1',
      recipientName: 'Phạm Văn An',
      phone: '0901234567',
      province: 'Hà Nội',
      district: 'Ba Đình',
      street: '12 Kim Mã',
      createdAt: s.at(-20),
    ),
  ]);
  db.cartItems.addAll([
    CartItemRow(userId: 'u-m1', productId: 'p-water', quantity: 4, priceSnapshot: 10000),
    // Giá đã tăng sau khi thêm vào giỏ ⇒ cảnh báo "giá đã đổi".
    CartItemRow(userId: 'u-m1', productId: 'p-bar', quantity: 2, priceSnapshot: 30000),
  ]);

  // ── Đơn hàng ở các trạng thái ───────────────────────────────────────────
  ShopOrderRow order(
    String id,
    String userId,
    Map<String, int> items,
    FulfillmentType type,
    DateTime created,
    List<ShopOrderStatus> path, {
    String? member,
    String? tracking,
    String? pickupCode,
  }) {
    final lines = [
      for (final (i, e) in items.entries.indexed)
        OrderLineRow(
          id: 'l-$id-${i + 1}',
          productId: e.key,
          productName: db.product(e.key).name,
          quantity: e.value,
          unitPrice: db.product(e.key).price,
        ),
    ];
    final subtotal = lines.fold(0, (sum, l) => sum + l.total);
    final ship = type == FulfillmentType.pickup || subtotal >= MockShopConfig.freeShippingThreshold
        ? 0
        : MockShopConfig.shippingFee;
    final user = db.user(userId);
    final address = db.addresses.where((a) => a.userId == userId && a.isDefault).firstOrNull;
    final o = ShopOrderRow(
      id: id,
      code: 'DH${id.toUpperCase().replaceAll('-', '')}${created.day.toString().padLeft(2, '0')}',
      userId: userId,
      fulfillmentType: type,
      lines: lines,
      shippingFee: ship,
      createdAt: created,
      paymentExpiresAt: created.add(const Duration(minutes: MockShopConfig.holdMinutes)),
      recipientName: user.fullName,
      recipientPhone: user.phone ?? '0900000000',
      shippingAddress: type == FulfillmentType.delivery && address != null
          ? '${address.street}, ${address.ward}, ${address.district}, ${address.province}'
          : null,
    )..trackingCode = tracking;
    o.history.add(OrderHistoryRow(to: ShopOrderStatus.pendingPayment, at: created, actorId: userId, reason: 'Tạo đơn'));
    var t = created;
    var prev = ShopOrderStatus.pendingPayment;
    for (final st in path) {
      t = t.add(const Duration(hours: 3));
      o.history.add(OrderHistoryRow(from: prev, to: st, at: t));
      prev = st;
    }
    o.status = prev;
    if (prev == ShopOrderStatus.expired) o.expiredAt = t;
    if (prev == ShopOrderStatus.delivered) o.deliveredAt = db.now().subtract(const Duration(hours: 20));
    if (prev == ShopOrderStatus.readyForPickup) {
      o
        ..pickupCode = pickupCode
        ..pickupDeadline = db.now().add(const Duration(days: 2));
    }
    db.shopOrders.add(o);

    final paid = path.contains(ShopOrderStatus.paid);
    final pay = PaymentRow(
      id: 'pay-$id',
      userId: userId,
      memberProfileId: member,
      amount: o.total,
      status: paid
          ? (prev == ShopOrderStatus.refunded ? PaymentStatus.refunded : PaymentStatus.success)
          : (prev == ShopOrderStatus.pendingPayment ? PaymentStatus.pending : PaymentStatus.failed),
      orderCode: 'PULSESP${id.hashCode.abs() % 1000000}',
      createdAt: created,
      expiresAt: o.paymentExpiresAt,
      productOrderId: id,
      paidAt: paid ? created.add(const Duration(minutes: 2)) : null,
    );
    db.payments.add(pay);
    if (paid) {
      s.invoice(pay, lines.map((l) => l.productName).join(', '), CheckoutPurpose.product, quantity: o.itemCount);
    }
    // Tồn kho: đơn chờ thanh toán đang GIỮ hàng; đơn đã thanh toán đã trừ hẳn khi seed (không ghi nhật ký).
    if (prev == ShopOrderStatus.pendingPayment) {
      for (final l in lines) {
        db.product(l.productId).reservedStock += l.quantity;
      }
    }
    return o;
  }

  const done = [ShopOrderStatus.paid, ShopOrderStatus.readyForPickup, ShopOrderStatus.completed];
  order('o-1', 'u-m1', {'p-mat': 1}, FulfillmentType.pickup, s.at(-12, 19), done, member: 'mp-1');
  order(
    'o-2',
    'u-m1',
    {'p-bottle': 2},
    FulfillmentType.delivery,
    s.at(-5, 7),
    [ShopOrderStatus.paid, ShopOrderStatus.processing, ShopOrderStatus.shipping, ShopOrderStatus.delivered],
    member: 'mp-1',
    tracking: 'GHN8837261',
  );
  order(
    'o-3',
    'u-m1',
    {'p-whey': 1},
    FulfillmentType.pickup,
    s.now.subtract(const Duration(minutes: 3)),
    const [],
    member: 'mp-1',
  );
  order(
    'o-4',
    'u-m1',
    {'p-goggles': 1},
    FulfillmentType.pickup,
    s.at(-4, 21),
    [ShopOrderStatus.expired],
    member: 'mp-1',
  );
  order(
    'o-7',
    'u-m1',
    {'p-band': 1, 'p-towel': 2},
    FulfillmentType.pickup,
    s.at(-1, 9),
    [ShopOrderStatus.paid, ShopOrderStatus.readyForPickup],
    member: 'mp-1',
    pickupCode: 'K7M2Q9XA',
  );
  order('o-8', 'u-m1', {'p-electro': 3}, FulfillmentType.delivery, s.at(0, 8), [ShopOrderStatus.paid], member: 'mp-1');
  order('o-5', 'u-c1', {'p-towel': 2}, FulfillmentType.pickup, s.at(-7, 12), done);
  order('o-6', 'u-c1', {'p-electro': 6}, FulfillmentType.pickup, s.at(-2, 9), [ShopOrderStatus.cancelled]);

  // ── Đánh giá (2 đánh giá gắn dòng đơn COMPLETED, còn lại là dữ liệu cũ) ─
  void review(String productId, String userId, int rating, int day, [String? comment, String? line]) =>
      db.productReviews.add(
        ProductReviewRow(
          id: 'rv-$productId-$userId',
          productId: productId,
          userId: userId,
          rating: rating,
          createdAt: s.at(day, 20),
          comment: comment,
          orderLineId: line,
        ),
      );

  review('p-mat', 'u-m1', 5, -10, 'Thảm bám tốt, không bị trượt khi tập flow.', 'l-o-1-1');
  review('p-mat', 'u-m3', 4, -20, 'Hơi mỏng với người đau gối nhưng nhìn chung ổn.');
  review('p-mat', 'u-m5', 5, -25);
  review('p-whey', 'u-m4', 5, -15, 'Dễ tan, vị vừa phải.');
  review('p-whey', 'u-m8', 4, -30, 'Giá hơi cao nhưng chất lượng tốt.');
  review('p-electro', 'u-m6', 4, -3, 'Uống sau buổi bơi rất đã.');
  review('p-goggles', 'u-m6', 3, -12, 'Chống mờ được khoảng 1 tháng.');
  review('p-gloves', 'u-m2', 5, -40, 'Găng chắc tay, đệm tốt.');
  review('p-towel', 'u-c1', 5, -6, 'Khô nhanh, mang theo tiện.', 'l-o-5-1');
  review('p-bottle', 'u-m7', 4, -9);
}
