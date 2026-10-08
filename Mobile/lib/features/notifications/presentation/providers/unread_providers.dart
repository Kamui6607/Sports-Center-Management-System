import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../chat/data/chat_repository_provider.dart';
import '../../../chat/domain/entities/chat.dart';
import '../../data/notification_repository_provider.dart';

/// Số thông báo chưa đọc (badge chuông).
final unreadNotificationsProvider = FutureProvider.autoDispose<int>((ref) {
  ref.watch(dataRevisionProvider);
  if (ref.watch(currentUserProvider) == null) return 0;
  return ref.watch(notificationRepositoryProvider).unreadCount();
});

/// Số tin nhắn chưa đọc (badge chat).
final unreadMessagesProvider = FutureProvider.autoDispose<int>((ref) {
  ref.watch(dataRevisionProvider);
  if (ref.watch(currentUserProvider) == null) return 0;
  return ref.watch(chatRepositoryProvider).unreadCount();
});

/// Nối sự kiện realtime (tin nhắn mới) ⇒ làm mới badge & danh sách.
final realtimeBridgeProvider = Provider.autoDispose<void>((ref) {
  final sub = ref.watch(chatRepositoryProvider).events().listen((e) {
    if (e is ChatMessageEvent) ref.read(dataRevisionProvider.notifier).bump();
  });
  ref.onDispose(sub.cancel);
});
