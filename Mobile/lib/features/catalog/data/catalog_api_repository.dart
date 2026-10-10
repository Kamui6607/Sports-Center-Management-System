import '../../../api/catalog_json.dart';
import '../../../core/network/api_client.dart';
import '../domain/entities/catalog.dart';
import '../domain/repositories/catalog_repository.dart';

/// [CatalogRepository] gọi BE thật — `GET /rooms`, `GET /classes/fitness`.
class CatalogApiRepository implements CatalogRepository {
  CatalogApiRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<Sport>> sports() async {
    // BE-11: danh mục bộ môn công khai (distinct `Class.fitness` của khóa đã duyệt).
    final data = (await _api.get('/classes/fitness', auth: false)).data;
    return [
      if (data is List)
        for (final name in data)
          if (name is String && name.trim().isNotEmpty) CatalogJson.sport(name.trim()),
    ];
  }

  @override
  Future<List<Room>> rooms({AreaType? areaType}) async {
    final rows = await _api.getAll('/rooms', query: {'isActive': 'true', 'areaType': areaType});
    return rows.map(CatalogJson.room).toList();
  }
}
