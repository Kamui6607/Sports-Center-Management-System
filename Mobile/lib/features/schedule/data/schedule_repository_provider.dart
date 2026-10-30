import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/schedule_repository.dart';
import 'schedule_api_repository.dart';
import 'schedule_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [ScheduleRepository].
final scheduleRepositoryProvider = Provider<ScheduleRepository>((ref) {
  if (Env.mock('schedule')) return ScheduleMockRepository(ref.watch(mockServerProvider));
  return ScheduleApiRepository(ref.watch(apiClientProvider));
});
