import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/attendance_repository.dart';
import 'attendance_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [AttendanceRepository].
final attendanceRepositoryProvider = Provider<AttendanceRepository>((ref) {
  if (Env.useMock) return AttendanceMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: AttendanceRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
