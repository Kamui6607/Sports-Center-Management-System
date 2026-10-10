import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/coach_repository.dart';
import 'coach_api_repository.dart';
import 'coach_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [CoachRepository].
final coachRepositoryProvider = Provider<CoachRepository>((ref) {
  if (Env.mock('coach')) return CoachMockRepository(ref.watch(mockServerProvider));
  return CoachApiRepository(ref.watch(apiClientProvider));
});
