import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/realtime_client.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/notification_repository.dart';
import 'notification_api_repository.dart';
import 'notification_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [NotificationRepository].
final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  if (Env.mock('notifications')) return NotificationMockRepository(ref.watch(mockServerProvider));
  return NotificationApiRepository(ref.watch(apiClientProvider), ref.watch(realtimeClientProvider));
});
