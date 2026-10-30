import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/notification_repository_provider.dart';
import '../../domain/entities/app_notification.dart';

final notificationsProvider = FutureProvider.autoDispose.family<List<AppNotification>, bool>((ref, unreadOnly) {
  ref.watch(dataRevisionProvider);
  return ref.watch(notificationRepositoryProvider).notifications(unreadOnly: unreadOnly);
});
