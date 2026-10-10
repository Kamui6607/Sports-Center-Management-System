import '../core/network/json.dart';
import '../features/catalog/domain/entities/catalog.dart';

/// Ánh xạ JSON danh mục của BE ⇒ entity.
abstract final class CatalogJson {
  static Room room(Json j) => Room(
    id: j.str('id'),
    name: j.str('name'),
    capacity: j.integer('capacity'),
    areaType: j.enumOr('areaType', AreaType.values, AreaType.indoor),
    location: j.strOrNull('location'),
  );

  /// BE đã bỏ bảng bộ môn: `Class.fitness` là chuỗi tự do ⇒ dùng chính chuỗi làm id.
  static Sport sport(String fitness) => Sport(id: fitness, name: fitness);
}
