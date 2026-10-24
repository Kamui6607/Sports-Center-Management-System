import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/coach_term_repository.dart';
import 'coach_term_api_repository.dart';
import 'coach_term_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES=term`) hoặc API thật.
/// UI chỉ phụ thuộc interface [CoachTermRepository].
final coachTermRepositoryProvider = Provider<CoachTermRepository>((ref) {
  if (Env.mock('term')) return CoachTermMockRepository(ref.watch(mockServerProvider));
  return CoachTermApiRepository(ref.watch(apiClientProvider));
});
