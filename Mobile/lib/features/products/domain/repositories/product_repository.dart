import '../../../../core/data/paged.dart';
import '../../../payments/domain/entities/payment.dart';
import '../entities/product.dart';

/// Cửa hàng — module `products`.
abstract interface class ProductRepository {
  /// `GET /products` (công khai).
  Future<Paged<Product>> products({String search = '', int page = 1});

  /// `GET /products/:id` (công khai).
  Future<Product> product(String id);

  /// Đánh giá của sản phẩm (kèm trong `GET /products/:id`).
  Future<List<ProductReview>> reviews(String productId);

  /// Người dùng hiện tại có được đánh giá (đã mua SUCCESS và chưa đánh giá).
  Future<bool> canReview(String productId);

  /// `POST /products/orders` ⇒ giữ hàng + trả QR thanh toán.
  Future<Checkout> createOrder(String productId, int quantity);

  /// `POST /products/orders/:id/cancel` ⇒ hoàn kho.
  Future<void> cancelOrder(String orderId);

  /// `GET /products/my/orders`.
  Future<List<ProductOrder>> myOrders();

  /// `POST /products/:id/reviews`.
  Future<void> addReview(String productId, int rating, String? comment);
}
