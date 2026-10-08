import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/coach_repository_provider.dart';
import '../../domain/entities/coach_dashboard.dart';
import '../../domain/entities/wallet.dart';

final coachDashboardProvider = FutureProvider.autoDispose<CoachDashboard>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachRepositoryProvider).dashboard();
});

final coachWalletProvider = FutureProvider.autoDispose<CoachWallet>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachRepositoryProvider).wallet();
});

final walletTransactionsProvider = FutureProvider.autoDispose<List<WalletTransaction>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachRepositoryProvider).transactions();
});

final studentProfileProvider = FutureProvider.autoDispose.family<StudentProfile, String>((ref, memberId) {
  ref.watch(dataRevisionProvider);
  return ref.watch(coachRepositoryProvider).student(memberId);
});
