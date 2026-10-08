import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/payment_repository.dart';
import 'payment_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [PaymentRepository].
final paymentRepositoryProvider = Provider<PaymentRepository>((ref) {
  if (Env.useMock) return PaymentMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: PaymentRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
