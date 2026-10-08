import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/notification_repository.dart';
import 'notification_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [NotificationRepository].
final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  if (Env.useMock) return NotificationMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: NotificationRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
