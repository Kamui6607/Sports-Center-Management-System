import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/feedback_repository.dart';
import 'feedback_api_repository.dart';
import 'feedback_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [FeedbackRepository].
final feedbackRepositoryProvider = Provider<FeedbackRepository>((ref) {
  if (Env.mock('feedbacks')) return FeedbackMockRepository(ref.watch(mockServerProvider));
  return FeedbackApiRepository(ref.watch(apiClientProvider));
});
