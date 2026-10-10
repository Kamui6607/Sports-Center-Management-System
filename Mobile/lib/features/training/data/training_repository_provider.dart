import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/training_repository.dart';
import 'training_api_repository.dart';
import 'training_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [TrainingRepository].
final trainingRepositoryProvider = Provider<TrainingRepository>((ref) {
  if (Env.mock('training')) return TrainingMockRepository(ref.watch(mockServerProvider));
  return TrainingApiRepository(ref.watch(apiClientProvider));
});
