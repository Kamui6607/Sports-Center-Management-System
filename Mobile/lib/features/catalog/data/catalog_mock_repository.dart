import '../../../mock/mock_server.dart';
import '../domain/entities/catalog.dart';
import '../domain/repositories/catalog_repository.dart';

class CatalogMockRepository implements CatalogRepository {
  CatalogMockRepository(this._server);

  final MockServer _server;

  @override
  Future<List<Sport>> sports() => _server.run(() => List.of(_server.db.sports));

  @override
  Future<List<Room>> rooms({AreaType? areaType}) =>
      _server.run(() => _server.db.rooms.where((r) => areaType == null || r.areaType == areaType).toList());

  @override
  Future<List<GoalOption>> goalOptions() => _server.run(() => kFitnessGoals);

  @override
  Future<CenterInfo> centerInfo() => _server.run(
    () => const CenterInfo(
      name: 'Pulse Gym Center',
      address: '7 Đường D1, Khu Công nghệ cao, Phường Tăng Nhơn Phú, TP. Hồ Chí Minh',
      mapLink: 'https://www.google.com/maps/search/?api=1&query=Pulse+Gym+Center',
      hotline: '0900000001',
      openingHours: '05:30 – 22:00 hằng ngày',
      parkingNote: 'Gửi xe máy miễn phí tại tầng hầm B1.',
    ),
  );
}
