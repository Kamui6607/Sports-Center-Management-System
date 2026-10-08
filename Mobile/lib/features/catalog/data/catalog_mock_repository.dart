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
}
