import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/refund_repository.dart';
import 'refund_api_repository.dart';
import 'refund_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [RefundRepository].
final refundRepositoryProvider = Provider<RefundRepository>((ref) {
  if (Env.mock('refunds')) return RefundMockRepository(ref.watch(mockServerProvider));
  return RefundApiRepository(ref.watch(apiClientProvider));
});
