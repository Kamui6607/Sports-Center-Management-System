import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/coach_repository.dart';
import 'coach_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [CoachRepository].
final coachRepositoryProvider = Provider<CoachRepository>((ref) {
  if (Env.useMock) return CoachMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: CoachRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
