import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/refund_repository.dart';
import 'refund_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [RefundRepository].
final refundRepositoryProvider = Provider<RefundRepository>((ref) {
  if (Env.useMock) return RefundMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: RefundRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
