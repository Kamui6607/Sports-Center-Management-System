import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/coach_term_repository_provider.dart';
import '../../domain/entities/coach_term.dart';

/// Mức dùng phòng gym tháng này + các ngày gần đây (`GET /terms/me/check-ins`).
final myCheckInsProvider = FutureProvider.autoDispose<MyCheckIns>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachTermRepositoryProvider).myCheckIns();
});
