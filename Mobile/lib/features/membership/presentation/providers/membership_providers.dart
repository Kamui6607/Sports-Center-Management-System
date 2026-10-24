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
