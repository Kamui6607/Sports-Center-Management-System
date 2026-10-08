import '../../core/config/env.dart';
import '../../features/payments/domain/entities/payment.dart';
import '../../features/products/domain/entities/product.dart';
import '../mock_tables.dart';
import 'seed_helpers.dart';

/// Sản phẩm, đánh giá, đơn hàng.
void seedCommerce(Seeder s) {
  final db = s.db;

  void product(String id, String name, String desc, int price, int stock) =>
      db.products.add(ProductRow(id: id, name: name, description: desc, price: price, stockQuantity: stock));

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
  );
  product('p-bcaa', 'BCAA 2:1:1 (30 lần dùng)', 'Axit amin chuỗi nhánh giảm mỏi cơ trong lúc tập.', 650000, 3);
  product('p-bar', 'Thanh năng lượng yến mạch', 'Bổ sung năng lượng nhanh trước buổi tập, ít đường.', 35000, 60);
  product('p-mat', 'Thảm Yoga TPE 6mm', 'Thảm chống trơn hai mặt, nhẹ, kèm dây đeo.', 420000, 15);
  product('p-gloves', 'Găng tay Boxing 12oz', 'Găng da PU, đệm mút 3 lớp, phù hợp tập bao.', 550000, 0);
  product('p-goggles', 'Kính bơi chống mờ', 'Tròng chống tia UV, dây silicone điều chỉnh.', 180000, 25);
  product('p-cap', 'Mũ bơi silicone', 'Co giãn tốt, bảo vệ tóc khỏi clo.', 90000, 40);
  product('p-band', 'Dây kháng lực bộ 5 mức', 'Dây cao su latex, 5 mức lực từ nhẹ đến rất nặng.', 250000, 18);
  product('p-bottle', 'Bình nước thể thao 1L', 'Nhựa Tritan không BPA, có vạch chia giờ uống.', 120000, 35);
  product('p-towel', 'Khăn tập microfiber', 'Thấm hút nhanh, khô nhanh, kích thước 40×80cm.', 80000, 50);

  void review(String productId, String userId, int rating, int day, [String? comment]) => db.productReviews.add(
    ProductReviewRow(
      id: 'rv-$productId-$userId',
      productId: productId,
      userId: userId,
      rating: rating,
      createdAt: s.at(day, 20),
      comment: comment,
    ),
  );

  review('p-mat', 'u-m1', 5, -10, 'Thảm bám tốt, không bị trượt khi tập flow.');
  review('p-mat', 'u-m3', 4, -20, 'Hơi mỏng với người đau gối nhưng nhìn chung ổn.');
  review('p-mat', 'u-m5', 5, -25);
  review('p-whey', 'u-m4', 5, -15, 'Dễ tan, vị vừa phải.');
  review('p-whey', 'u-m8', 4, -30, 'Giá hơi cao nhưng chất lượng tốt.');
  review('p-electro', 'u-m6', 4, -3, 'Uống sau buổi bơi rất đã.');
  review('p-goggles', 'u-m6', 3, -12, 'Chống mờ được khoảng 1 tháng.');
  review('p-gloves', 'u-m2', 5, -40, 'Găng chắc tay, đệm tốt.');
  review('p-towel', 'u-c1', 5, -6, 'Khô nhanh, mang theo tiện.');
  review('p-bottle', 'u-m7', 4, -9);

  void order(
    String id,
    String productId,
    String userId,
    int qty,
    OrderStatus status,
    DateTime created, {
    OrderCancelReason? cancel,
    String? member,
  }) {
    final p = db.products.firstWhere((x) => x.id == productId);
    final o = ProductOrderRow(
      id: id,
      productId: productId,
      userId: userId,
      quantity: qty,
      totalPrice: p.price * qty,
      createdAt: created,
      status: status,
    )..cancelReason = cancel;
    db.productOrders.add(o);
    final pending = status == OrderStatus.pending;
    final pay = PaymentRow(
      id: 'pay-$id',
      userId: userId,
      memberProfileId: member,
      amount: o.totalPrice,
      status: switch (status) {
        OrderStatus.success => PaymentStatus.success,
        OrderStatus.cancelled => PaymentStatus.failed,
        OrderStatus.pending => PaymentStatus.pending,
      },
      orderCode: 'PULSESP${id.hashCode.abs() % 1000000}',
      createdAt: created,
      expiresAt: created.add(const Duration(minutes: Env.sepayTtlMinutes)),
      productOrderId: id,
      paidAt: status == OrderStatus.success ? created.add(const Duration(minutes: 2)) : null,
    );
    db.payments.add(pay);
    if (status == OrderStatus.success) s.invoice(pay, p.name, CheckoutPurpose.product, quantity: qty);
    // Đơn PENDING đang giữ hàng ⇒ đã trừ tồn kho.
    if (pending) p.stockQuantity -= qty;
  }

  order('o-1', 'p-mat', 'u-m1', 1, OrderStatus.success, s.at(-12, 19), member: 'mp-1');
  order('o-2', 'p-bottle', 'u-m1', 2, OrderStatus.success, s.at(-5, 7), member: 'mp-1');
  order('o-3', 'p-whey', 'u-m1', 1, OrderStatus.pending, s.now.subtract(const Duration(minutes: 3)), member: 'mp-1');
  order(
    'o-4',
    'p-goggles',
    'u-m1',
    1,
    OrderStatus.cancelled,
    s.at(-4, 21),
    cancel: OrderCancelReason.expired,
    member: 'mp-1',
  );
  order('o-5', 'p-towel', 'u-c1', 2, OrderStatus.success, s.at(-7, 12));
  order('o-6', 'p-electro', 'u-c1', 6, OrderStatus.cancelled, s.at(-2, 9), cancel: OrderCancelReason.byBuyer);
}
