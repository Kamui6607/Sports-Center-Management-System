import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/schedule_repository.dart';
import 'schedule_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [ScheduleRepository].
final scheduleRepositoryProvider = Provider<ScheduleRepository>((ref) {
  if (Env.useMock) return ScheduleMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: ScheduleRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
