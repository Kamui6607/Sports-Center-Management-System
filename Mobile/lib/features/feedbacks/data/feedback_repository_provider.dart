import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/feedback_repository.dart';
import 'feedback_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [FeedbackRepository].
final feedbackRepositoryProvider = Provider<FeedbackRepository>((ref) {
  if (Env.useMock) return FeedbackMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: FeedbackRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
