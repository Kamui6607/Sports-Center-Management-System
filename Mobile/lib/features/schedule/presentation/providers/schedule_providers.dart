import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/schedule_repository_provider.dart';
import '../../domain/entities/session.dart';

/// Khoảng thời gian rất rộng để lấy toàn bộ lịch (mock); API sẽ phân trang.
final _allFrom = DateTime.utc(2000);
final _allTo = DateTime.utc(2100);

final mySessionsRangeProvider = FutureProvider.autoDispose.family<List<MySession>, ({DateTime from, DateTime to})>((
  ref,
  r,
) {
  ref.watch(dataRevisionProvider);
  return ref.watch(scheduleRepositoryProvider).mySessions(r.from, r.to);
});

/// Toàn bộ buổi của Member (đánh dấu ngày có buổi, buổi tiếp theo, theo khóa).
final myAllSessionsProvider = FutureProvider.autoDispose<List<MySession>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(scheduleRepositoryProvider).mySessions(_allFrom, _allTo);
});

final mySessionProvider = FutureProvider.autoDispose.family<MySession, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(scheduleRepositoryProvider).mySession(id);
});

final transferOptionsProvider = FutureProvider.autoDispose.family<List<TransferOption>, String>(
  (ref, enrollmentId) => ref.watch(scheduleRepositoryProvider).transferOptions(enrollmentId),
);

typedef TeachingQuery = ({DateTime from, DateTime to, String? classId});

final teachingSessionsProvider = FutureProvider.autoDispose.family<List<ClassSession>, TeachingQuery>((ref, q) {
  ref.watch(dataRevisionProvider);
  return ref.watch(scheduleRepositoryProvider).teachingSessions(q.from, q.to, classId: q.classId);
});

final allTeachingSessionsProvider = FutureProvider.autoDispose<List<ClassSession>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(scheduleRepositoryProvider).teachingSessions(_allFrom, _allTo);
});

final teachingSessionProvider = FutureProvider.autoDispose.family<TeachingSession, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(scheduleRepositoryProvider).teachingSession(id);
});

final cancelPreviewProvider = FutureProvider.autoDispose.family<CancelPreview, String>(
  (ref, id) => ref.watch(scheduleRepositoryProvider).cancelPreview(id),
);
