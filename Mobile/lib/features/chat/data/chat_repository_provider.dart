import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/realtime_client.dart';
import '../../../core/network/token_storage.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/chat_repository.dart';
import 'chat_api_repository.dart';
import 'chat_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [ChatRepository].
final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  if (Env.mock('chat')) return ChatMockRepository(ref.watch(mockServerProvider));
  return ChatApiRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStorageProvider),
    ref.watch(realtimeClientProvider),
  );
});
