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
    int? availableStock,
    this.maxPerOrder = 10,
    this.maxPerDay = 20,
    this.imageUrl,
    this.isActive = true,
  }) : availableStock = availableStock ?? stockQuantity;

  final String id;
  final String name;
  final String description;
  final int price;

  /// Tồn thực tế trên kệ.
  final int stockQuantity;

  /// Có thể bán = tồn − đang giữ cho đơn chờ thanh toán.
  final int availableStock;

  /// Tối đa mỗi đơn / mỗi người mỗi ngày (chống gom hàng).
  final int maxPerOrder;
  final int maxPerDay;
  final double rating;
  final int reviewCount;
  final bool isActive;

  /// Ảnh sản phẩm (BE-6); null ⇒ hiển thị placeholder.
  final String? imageUrl;

  bool get inStock => isActive && availableStock > 0;

  /// Ngưỡng hiển thị "Sắp hết hàng".
  bool get lowStock => availableStock > 0 && availableStock <= 5;

  /// Số lượng tối đa chọn được trong một đơn.
  int get maxSelectable => availableStock < maxPerOrder ? availableStock : maxPerOrder;
}

/// Đánh giá sản phẩm (`ProductReview`) — viết từ dòng đơn đã hoàn tất.
class ProductReview {
  const ProductReview({
    required this.id,
    required this.userName,
    required this.rating,
    required this.createdAt,
    this.comment,
    this.avatarUrl,
    this.isMine = false,
    this.isHidden = false,
  });

  final String id;
  final String userName;
  final String? avatarUrl;
  final int rating;
  final String? comment;
  final DateTime createdAt;
  final bool isMine;

  /// Quản lý đã ẩn (chỉ Quản lý thấy).
  final bool isHidden;
}
