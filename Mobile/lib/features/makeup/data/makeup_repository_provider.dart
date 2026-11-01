import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/makeup_repository.dart';
import 'makeup_api_repository.dart';
import 'makeup_mock_repository.dart';

/// Nguồn dữ liệu học bù: mock (cùng cờ với `schedule`) hoặc API thật.
final makeupRepositoryProvider = Provider<MakeupRepository>((ref) {
  if (Env.mock('schedule')) return MakeupMockRepository(ref.watch(mockServerProvider));
  return MakeupApiRepository(ref.watch(apiClientProvider));
});
