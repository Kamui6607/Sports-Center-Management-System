import '../../../../core/data/paged.dart';
import '../entities/product.dart';

/// Danh mục sản phẩm — module `products`. Giỏ hàng, đặt hàng, đơn hàng, đánh giá: `ShopRepository`.
abstract interface class ProductRepository {
  /// `GET /products` (công khai).
  Future<Paged<Product>> products({String search = '', int page = 1});

  /// `GET /products/:id` (công khai).
  Future<Product> product(String id);

  /// Đánh giá của sản phẩm (kèm trong `GET /products/:id`; Quản lý thấy cả đánh giá đã ẩn).
  Future<List<ProductReview>> reviews(String productId);
}
