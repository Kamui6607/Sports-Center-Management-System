import '../entities/app_notification.dart';

/// Thông báo — module `notifications`.
abstract interface class NotificationRepository {
  /// `GET /notifications`.
  Future<List<AppNotification>> notifications({bool unreadOnly = false});

  /// `GET /notifications/unread-count`.
  Future<int> unreadCount();

  /// `PATCH /notifications/:id/read`.
  Future<void> markRead(String id);

  /// `PATCH /notifications/mark-all-read`.
  Future<void> markAllRead();
}
