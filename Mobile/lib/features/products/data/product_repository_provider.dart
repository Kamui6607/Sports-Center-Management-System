import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/token_storage.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/product_repository.dart';
import 'product_api_repository.dart';
import 'product_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [ProductRepository].
final productRepositoryProvider = Provider<ProductRepository>((ref) {
  if (Env.mock('products')) return ProductMockRepository(ref.watch(mockServerProvider));
  return ProductApiRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider));
});
