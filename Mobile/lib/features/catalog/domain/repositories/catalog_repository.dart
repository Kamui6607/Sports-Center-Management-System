import '../entities/catalog.dart';

/// Danh mục dùng chung — `GET /sports`, `GET /rooms`.
abstract interface class CatalogRepository {
  Future<List<Sport>> sports();

  Future<List<Room>> rooms({AreaType? areaType});
}
