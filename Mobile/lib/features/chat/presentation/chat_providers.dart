import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../data/chat_repository_provider.dart';
import '../domain/entities/chat.dart';

final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(chatRepositoryProvider).conversations();
});

final chatContactsProvider = FutureProvider.autoDispose<List<ChatParticipant>>(
  (ref) => ref.watch(chatRepositoryProvider).contacts(),
);

final conversationProvider = FutureProvider.autoDispose.family<Conversation, String>(
  (ref, peerId) => ref.watch(chatRepositoryProvider).conversationWith(peerId),
);
