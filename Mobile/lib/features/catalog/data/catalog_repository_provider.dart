import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/catalog_repository.dart';
import 'catalog_api_repository.dart';
import 'catalog_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [CatalogRepository].
final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  if (Env.mock('catalog')) return CatalogMockRepository(ref.watch(mockServerProvider));
  return CatalogApiRepository(ref.watch(apiClientProvider));
});
