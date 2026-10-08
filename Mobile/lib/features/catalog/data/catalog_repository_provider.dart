import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/catalog_repository.dart';
import 'catalog_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [CatalogRepository].
final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  if (Env.useMock) return CatalogMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: CatalogRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
