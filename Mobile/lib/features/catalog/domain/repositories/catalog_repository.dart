import '../entities/catalog.dart';

/// Danh mục dùng chung — phòng tập, mục tiêu tập luyện, thông tin trung tâm.
abstract interface class CatalogRepository {
  Future<List<Sport>> sports();

  Future<List<Room>> rooms({AreaType? areaType});

  /// `GET /classes/goal-options` — danh mục mục tiêu (công khai).
  Future<List<GoalOption>> goalOptions();

  /// `GET /center` — địa chỉ, giờ mở cửa, hotline của trung tâm (công khai).
  Future<CenterInfo> centerInfo();
}
