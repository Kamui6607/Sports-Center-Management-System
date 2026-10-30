import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/attendance_repository.dart';
import 'attendance_api_repository.dart';
import 'attendance_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [AttendanceRepository].
final attendanceRepositoryProvider = Provider<AttendanceRepository>((ref) {
  if (Env.mock('attendance')) return AttendanceMockRepository(ref.watch(mockServerProvider));
  return AttendanceApiRepository(ref.watch(apiClientProvider));
});
