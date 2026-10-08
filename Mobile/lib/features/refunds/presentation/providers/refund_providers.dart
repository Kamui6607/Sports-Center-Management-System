import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/refund_repository_provider.dart';
import '../../domain/entities/refund.dart';

final cancellationEligibilityProvider = FutureProvider.autoDispose.family<CancellationEligibility, String>((
  ref,
  classId,
) {
  ref.watch(dataRevisionProvider);
  return ref.watch(refundRepositoryProvider).eligibility(classId);
});

final myRefundsProvider = FutureProvider.autoDispose<List<Refund>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(refundRepositoryProvider).myRefunds();
});

final managerRefundsProvider = FutureProvider.autoDispose.family<List<Refund>, RefundStatus?>((ref, status) {
  ref.watch(dataRevisionProvider);
  return ref.watch(refundRepositoryProvider).all(status: status);
});

final refundProvider = FutureProvider.autoDispose.family<Refund, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(refundRepositoryProvider).refund(id);
});
