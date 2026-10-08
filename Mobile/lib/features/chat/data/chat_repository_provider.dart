import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/chat_repository.dart';
import 'chat_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [ChatRepository].
final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  if (Env.useMock) return ChatMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: ChatRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
