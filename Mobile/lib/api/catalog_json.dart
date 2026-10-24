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
    floor: j.strOrNull('floor'),
    directions: j.strOrNull('directions'),
  );

  /// BE đã bỏ bảng bộ môn: `Class.fitness` là chuỗi tự do ⇒ dùng chính chuỗi làm id.
  static Sport sport(String fitness) => Sport(id: fitness, name: fitness);

  static GoalOption goal(Json j) => GoalOption(j.str('code'), j.str('label'), j.strOrNull('description'));

  static CenterInfo center(Json j) => CenterInfo(
    name: j.str('name', 'Trung tâm Gym'),
    address: j.str('address'),
    mapLink: j.str('mapLink', j.str('mapUrl')),
    hotline: j.strOrNull('hotline'),
    email: j.strOrNull('email'),
    openingHours: j.strOrNull('openingHours'),
    parkingNote: j.strOrNull('parkingNote'),
    description: j.strOrNull('description'),
  );
}
