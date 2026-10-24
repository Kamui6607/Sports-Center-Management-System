import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/membership_repository.dart';
import 'membership_api_repository.dart';
import 'membership_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [MembershipRepository].
final membershipRepositoryProvider = Provider<MembershipRepository>((ref) {
  if (Env.mock('membership')) return MembershipMockRepository(ref.watch(mockServerProvider));
  return MembershipApiRepository(ref.watch(apiClientProvider));
});
