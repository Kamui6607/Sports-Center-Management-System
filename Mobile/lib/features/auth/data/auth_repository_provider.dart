import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/token_storage.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/auth_repository.dart';
import 'auth_api_repository.dart';
import 'auth_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK=true`) hoặc API thật.
/// UI chỉ phụ thuộc interface [AuthRepository].
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  if (Env.mock('auth')) return AuthMockRepository(ref.watch(mockServerProvider));
  return AuthApiRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider));
});
