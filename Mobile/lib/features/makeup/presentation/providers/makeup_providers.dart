import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/makeup_repository_provider.dart';
import '../../domain/entities/makeup.dart';

/// HLV: yêu cầu học bù theo trạng thái (`null` = tất cả).
final coachMakeupRequestsProvider = FutureProvider.autoDispose.family<List<MakeupRequest>, MakeupStatus?>((
  ref,
  status,
) {
  ref.watch(dataRevisionProvider);
  return ref.watch(makeupRepositoryProvider).coachRequests(status: status);
});

/// Học viên: yêu cầu học bù của tôi.
final myMakeupRequestsProvider = FutureProvider.autoDispose<List<MakeupRequest>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(makeupRepositoryProvider).myRequests();
});

/// Yêu cầu + buổi có thể xếp (học viên: buổi bù mở; HLV: mọi buổi hợp lệ).
final makeupOptionsProvider = FutureProvider.autoDispose
    .family<({MakeupRequest request, List<MakeupOption> options}), String>((ref, id) {
      ref.watch(dataRevisionProvider);
      return ref.watch(makeupRepositoryProvider).options(id);
    });
