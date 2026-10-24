import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/coach_term_repository_provider.dart';
import '../../domain/entities/coach_term.dart';

/// Trạng thái của Coach trong kỳ hiện tại (`GET /terms/me`).
final coachTermStatusProvider = FutureProvider.autoDispose<CoachTermStatus>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachTermRepositoryProvider).myStatus();
});

/// Đơn nghỉ phép của tôi.
final myLeavesProvider = FutureProvider.autoDispose<List<CoachLeave>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachTermRepositoryProvider).myLeaves();
});
