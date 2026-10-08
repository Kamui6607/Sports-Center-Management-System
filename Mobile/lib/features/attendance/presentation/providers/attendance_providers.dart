import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/attendance_repository_provider.dart';
import '../../domain/entities/attendance.dart';

final myAttendanceSummaryProvider = FutureProvider.autoDispose<List<ClassAttendanceStat>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(attendanceRepositoryProvider).mySummary();
});

final myAttendanceRecordsProvider = FutureProvider.autoDispose<List<AttendanceRecord>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(attendanceRepositoryProvider).myRecords();
});

final myPenaltiesProvider = FutureProvider.autoDispose<List<AttendancePenalty>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(attendanceRepositoryProvider).myPenalties();
});
