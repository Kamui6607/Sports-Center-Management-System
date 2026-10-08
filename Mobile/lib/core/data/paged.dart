/// Kết quả phân trang, tương ứng `pagination` của BE `{ page, limit, total, totalPages }`.
class Paged<T> {
  const Paged({required this.items, required this.page, required this.limit, required this.total});

  final List<T> items;
  final int page;
  final int limit;
  final int total;

  int get totalPages => total == 0 ? 1 : (total / limit).ceil();
  bool get hasMore => page < totalPages;

  static Paged<T> slice<T>(List<T> all, {int page = 1, int limit = 10}) {
    final start = (page - 1) * limit;
    final items = start >= all.length ? <T>[] : all.sublist(start, (start + limit).clamp(0, all.length));
    return Paged(items: items, page: page, limit: limit, total: all.length);
  }
}
