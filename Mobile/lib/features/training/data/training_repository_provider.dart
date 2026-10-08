import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/training_repository.dart';
import 'training_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [TrainingRepository].
final trainingRepositoryProvider = Provider<TrainingRepository>((ref) {
  if (Env.useMock) return TrainingMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: TrainingRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
