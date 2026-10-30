import '../../../core/data/paged.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/utils/vn_text.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../domain/entities/product.dart';
import '../domain/repositories/product_repository.dart';

/// Mock theo `BE/src/modules/products` (đặt hàng: `ShopMockRepository`).
class ProductMockRepository implements ProductRepository {
  ProductMockRepository(this._server);

  final MockServer _server;
  static const _pageSize = 10;

  Product _toProduct(ProductRow p) {
    final reviews = _server.db.productReviews.where((r) => r.productId == p.id && !r.isHidden).toList();
    final avg = reviews.isEmpty ? 0.0 : reviews.fold(0, (s, r) => s + r.rating) / reviews.length;
    return Product(
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      stockQuantity: p.stockQuantity,
      availableStock: p.available,
      maxPerOrder: p.maxPerOrder,
      maxPerDay: p.maxPerDay,
      rating: avg,
      reviewCount: reviews.length,
      isActive: p.isActive,
      imageUrl: p.imageUrl,
    );
  }

  @override
  Future<Paged<Product>> products({String search = '', int page = 1}) => _server.run(() {
    final list = _server.db.products
        .where((p) => p.isActive)
        .where((p) => search.trim().isEmpty || VnText.matches(p.name, search) || (p.description.isNotEmpty && VnText.matches(p.description, search)))
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
    final isManager = _server.currentUser?.role == UserRole.manager;
    return db.productReviews.where((r) => r.productId == productId && (isManager || !r.isHidden)).map((r) {
      final u = db.user(r.userId);
      final anon = r.isAnonymous;
      return ProductReview(
        id: r.id,
        userName: anon && r.userId != me
            ? 'Người dùng ẩn danh'
            : (anon ? '${u.fullName} (Ẩn danh)' : u.fullName),
        avatarUrl: anon ? null : u.avatarUrl,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        isMine: r.userId == me,
        isHidden: r.isHidden,
        isAnonymous: anon,
      );
    }).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });
}
