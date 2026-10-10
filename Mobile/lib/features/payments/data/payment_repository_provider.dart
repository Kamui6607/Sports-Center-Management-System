import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/payment_repository.dart';
import 'payment_api_repository.dart';
import 'payment_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [PaymentRepository].
final paymentRepositoryProvider = Provider<PaymentRepository>((ref) {
  if (Env.mock('payments')) return PaymentMockRepository(ref.watch(mockServerProvider));
  return PaymentApiRepository(ref.watch(apiClientProvider));
});
