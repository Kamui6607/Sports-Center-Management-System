import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/manager_repository.dart';
import 'manager_api_repository.dart';
import 'manager_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [ManagerRepository].
final managerRepositoryProvider = Provider<ManagerRepository>((ref) {
  if (Env.mock('manager')) return ManagerMockRepository(ref.watch(mockServerProvider));
  return ManagerApiRepository(ref.watch(apiClientProvider));
});
