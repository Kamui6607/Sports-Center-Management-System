import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../../classes/domain/entities/coach_class.dart';
import '../../classes/domain/entities/course.dart';
import '../../coach/domain/entities/wallet.dart';
import '../data/manager_repository_provider.dart';
import '../domain/entities/approvals.dart';

final approvalCountsProvider = FutureProvider.autoDispose<ApprovalCounts>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).counts();
});

final pendingCvsProvider = FutureProvider.autoDispose<List<CvApplication>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).pendingCvs();
});

final cvProvider = FutureProvider.autoDispose.family<CvApplication, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).cv(id);
});

final pendingClassesProvider = FutureProvider.autoDispose<List<CourseClass>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).pendingClasses();
});

final reviewClassProvider = FutureProvider.autoDispose.family<CoachClassDetail, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).classDetail(id);
});

final withdrawalsProvider = FutureProvider.autoDispose.family<List<WithdrawalRequest>, WalletTxStatus?>((ref, status) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).withdrawals(status: status);
});

final withdrawalProvider = FutureProvider.autoDispose.family<WithdrawalRequest, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(managerRepositoryProvider).withdrawal(id);
});
