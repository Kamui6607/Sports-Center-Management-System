import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/shop_repository.dart';
import 'shop_api_repository.dart';
import 'shop_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES=shop`) hoặc API thật.
final shopRepositoryProvider = Provider<ShopRepository>((ref) {
  if (Env.mock('shop')) return ShopMockRepository(ref.watch(mockServerProvider));
  return ShopApiRepository(ref.watch(apiClientProvider));
});
