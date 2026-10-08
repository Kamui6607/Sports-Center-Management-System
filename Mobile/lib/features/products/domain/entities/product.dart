/// Sản phẩm phụ trợ do Trung tâm bán (`Product`).
class Product {
  const Product({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.stockQuantity,
    required this.rating,
    required this.reviewCount,
    this.imageUrl,
  });

  final String id;
  final String name;
  final String description;
  final int price;
  final int stockQuantity;
  final double rating;
  final int reviewCount;

  /// TODO BE-6: BE chưa có trường ảnh ⇒ luôn null, hiển thị placeholder.
  final String? imageUrl;

  bool get inStock => stockQuantity > 0;

  /// Ngưỡng hiển thị "Sắp hết hàng".
  bool get lowStock => stockQuantity > 0 && stockQuantity <= 5;
}

/// Đánh giá sản phẩm (`ProductReview`).
class ProductReview {
  const ProductReview({
    required this.id,
    required this.userName,
    required this.rating,
    required this.createdAt,
    this.comment,
    this.avatarUrl,
    this.isMine = false,
  });

  final String id;
  final String userName;
  final String? avatarUrl;
  final int rating;
  final String? comment;
  final DateTime createdAt;
  final bool isMine;
}

/// Trạng thái đơn hàng (`ProductOrderStatus`).
enum OrderStatus { pending, success, cancelled }

/// Lý do đơn bị hủy (suy từ BE: người mua hủy / quá hạn chờ thanh toán).
enum OrderCancelReason { byBuyer, expired }

/// Đơn mua sản phẩm (`ProductOrder`) — 1 sản phẩm / đơn, không có giỏ hàng.
class ProductOrder {
  const ProductOrder({
    required this.id,
    required this.productId,
    required this.productName,
    required this.unitPrice,
    required this.quantity,
    required this.totalPrice,
    required this.status,
    required this.createdAt,
    this.paymentId,
    this.expiresAt,
    this.cancelReason,
    this.invoiceId,
    this.reviewed = false,
  });

  final String id;
  final String productId;
  final String productName;
  final int unitPrice;
  final int quantity;
  final int totalPrice;
  final OrderStatus status;
  final DateTime createdAt;
  final String? paymentId;
  final DateTime? expiresAt;
  final OrderCancelReason? cancelReason;
  final String? invoiceId;

  /// Người mua đã đánh giá sản phẩm này.
  final bool reviewed;
}
