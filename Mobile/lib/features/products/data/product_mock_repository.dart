import '../../../core/data/paged.dart';
import '../../../core/error/app_failure.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../payments/data/payment_mock_repository.dart';
import '../../payments/domain/entities/payment.dart';
import '../domain/entities/product.dart';
import '../domain/repositories/product_repository.dart';

/// Mock theo `BE/src/modules/products` (đơn hàng giữ kho + SePay).
class ProductMockRepository implements ProductRepository {
  ProductMockRepository(this._server);

  final MockServer _server;
  static const _pageSize = 10;

  Product _toProduct(ProductRow p) {
    final reviews = _server.db.productReviews.where((r) => r.productId == p.id).toList();
    final avg = reviews.isEmpty ? 0.0 : reviews.fold(0, (s, r) => s + r.rating) / reviews.length;
    return Product(
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      stockQuantity: p.stockQuantity,
      rating: avg,
      reviewCount: reviews.length,
    );
  }

  @override
  Future<Paged<Product>> products({String search = '', int page = 1}) => _server.run(() {
    final q = search.toLowerCase();
    final list = _server.db.products
        .where((p) => q.isEmpty || p.name.toLowerCase().contains(q) || p.description.toLowerCase().contains(q))
        .map(_toProduct)
        .toList();
    return Paged.slice(list, page: page, limit: _pageSize);
  });

  @override
  Future<Product> product(String id) => _server.run(() {
    final p = _server.db.products.where((x) => x.id == id).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Sản phẩm không tồn tại.');
    return _toProduct(p);
  });

  @override
  Future<List<ProductReview>> reviews(String productId) => _server.run(() {
    final db = _server.db;
    final me = _server.currentUserId;
    return db.productReviews.where((r) => r.productId == productId).map((r) {
      final u = db.user(r.userId);
      return ProductReview(
        id: r.id,
        userName: u.fullName,
        avatarUrl: u.avatarUrl,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        isMine: r.userId == me,
      );
    }).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  bool _canReview(String userId, String productId) {
    final db = _server.db;
    final bought = db.productOrders.any(
      (o) => o.userId == userId && o.productId == productId && o.status == OrderStatus.success,
    );
    final reviewed = db.productReviews.any((r) => r.userId == userId && r.productId == productId);
    return bought && !reviewed;
  }

  @override
  Future<bool> canReview(String productId) => _server.run(() {
    final me = _server.currentUserId;
    return me != null && _canReview(me, productId);
  });

  @override
  Future<Checkout> createOrder(String productId, int quantity) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    if (u.role == UserRole.manager) throw const AppFailure.forbidden('Quản lý không đặt mua sản phẩm.');
    final p = db.products.where((x) => x.id == productId).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Sản phẩm không tồn tại.');
    if (quantity < 1) throw const AppFailure.validation('Số lượng tối thiểu là 1.');
    if (p.stockQuantity < quantity) {
      throw AppFailure.conflict('Chỉ còn ${p.stockQuantity} sản phẩm trong kho.', code: 'OUT_OF_STOCK');
    }
    // Giữ hàng ngay khi tạo đơn.
    p.stockQuantity -= quantity;
    final order = ProductOrderRow(
      id: db.nextId('ord'),
      productId: p.id,
      userId: u.id,
      quantity: quantity,
      totalPrice: p.price * quantity,
      createdAt: db.now(),
    );
    db.productOrders.add(order);
    final payment = db.createPendingPayment(
      userId: u.id,
      memberProfileId: db.memberOfUser(u.id)?.id,
      amount: order.totalPrice,
      productOrderId: order.id,
    );
    return PaymentMockRepository.toCheckout(db, payment);
  });

  @override
  Future<void> cancelOrder(String orderId) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final o = db.productOrders.where((x) => x.id == orderId).firstOrNull;
    if (o == null) throw const AppFailure.notFound('Không tìm thấy đơn hàng.');
    if (o.userId != u.id && u.role != UserRole.manager) throw const AppFailure.forbidden();
    if (o.status != OrderStatus.pending) throw const AppFailure.business('Chỉ hủy được đơn đang chờ thanh toán.');
    o
      ..status = OrderStatus.cancelled
      ..cancelReason = OrderCancelReason.byBuyer;
    db.products.firstWhere((x) => x.id == o.productId).stockQuantity += o.quantity;
    final pay = db.payments.where((x) => x.productOrderId == o.id).firstOrNull;
    if (pay != null && pay.status == PaymentStatus.pending) pay.status = PaymentStatus.failed;
  });

  @override
  Future<List<ProductOrder>> myOrders() => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    return db.productOrders.where((o) => o.userId == u.id).map((o) {
      final p = db.products.firstWhere((x) => x.id == o.productId);
      final pay = db.payments.where((x) => x.productOrderId == o.id).firstOrNull;
      return ProductOrder(
        id: o.id,
        productId: p.id,
        productName: p.name,
        unitPrice: p.price,
        quantity: o.quantity,
        totalPrice: o.totalPrice,
        status: o.status,
        createdAt: o.createdAt,
        paymentId: pay?.id,
        expiresAt: pay?.expiresAt,
        cancelReason: o.cancelReason,
        invoiceId: pay == null ? null : db.invoices.where((i) => i.paymentId == pay.id).firstOrNull?.id,
        reviewed: db.productReviews.any((r) => r.userId == u.id && r.productId == p.id),
      );
    }).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  @override
  Future<void> addReview(String productId, int rating, String? comment) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    if (rating < 1 || rating > 5) throw const AppFailure.validation('Đánh giá từ 1 đến 5 sao.');
    if (db.productReviews.any((r) => r.userId == u.id && r.productId == productId)) {
      throw const AppFailure.conflict('Bạn đã đánh giá sản phẩm này.');
    }
    if (!_canReview(u.id, productId)) {
      throw const AppFailure.forbidden('Chỉ người đã mua thành công mới được đánh giá.');
    }
    final c = comment?.trim();
    db.productReviews.add(
      ProductReviewRow(
        id: db.nextId('rv'),
        productId: productId,
        userId: u.id,
        rating: rating,
        createdAt: db.now(),
        comment: c == null || c.isEmpty ? null : c,
      ),
    );
  });
}
