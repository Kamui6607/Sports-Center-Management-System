import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/auth_repository.dart';
import 'auth_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [AuthRepository].
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  if (Env.useMock) return AuthMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: AuthRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
