import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/membership_repository_provider.dart';
import '../../domain/entities/membership.dart';

final membershipPlansProvider = FutureProvider.autoDispose<List<MembershipPlan>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(membershipRepositoryProvider).listPlans();
});

final myMembershipProvider = FutureProvider.autoDispose<Membership?>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(membershipRepositoryProvider).myMembership();
});

/// Tổng quan thẻ: gói đang dùng + gói xếp hàng + hạn cuối cùng.
final membershipOverviewProvider = FutureProvider.autoDispose<MembershipOverview>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(membershipRepositoryProvider).overview();
});

final membershipHistoryProvider = FutureProvider.autoDispose<List<Membership>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(membershipRepositoryProvider).history();
});

/// Mã QR động (~60 giây) — màn thẻ tự `invalidate` trước khi hết hạn để làm mới.
final memberPassProvider = FutureProvider.autoDispose<MemberPass>(
  (ref) => ref.watch(membershipRepositoryProvider).pass(),
);
