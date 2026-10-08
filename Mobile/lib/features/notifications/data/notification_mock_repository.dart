import '../../../mock/mock_server.dart';
import '../domain/entities/app_notification.dart';
import '../domain/repositories/notification_repository.dart';

/// Mock theo `BE/src/modules/notifications`.
class NotificationMockRepository implements NotificationRepository {
  NotificationMockRepository(this._server);

  final MockServer _server;

  @override
  Future<List<AppNotification>> notifications({bool unreadOnly = false}) => _server.run(() {
    final u = _server.requireUser();
    return _server.db.notifications
        .where((n) => n.userId == u.id && (!unreadOnly || !n.isRead))
        .map(
          (n) => AppNotification(
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            createdAt: n.createdAt,
            isRead: n.isRead,
            reason: n.reason,
            metadata: n.metadata,
          ),
        )
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  @override
  Future<int> unreadCount() => _server.run(() {
    final u = _server.currentUser;
    if (u == null) return 0;
    return _server.db.notifications.where((n) => n.userId == u.id && !n.isRead).length;
  });

  @override
  Future<void> markRead(String id) => _server.run(() {
    final u = _server.requireUser();
    for (final n in _server.db.notifications.where((n) => n.id == id && n.userId == u.id)) {
      n.isRead = true;
    }
  });

  @override
  Future<void> markAllRead() => _server.run(() {
    final u = _server.requireUser();
    for (final n in _server.db.notifications.where((n) => n.userId == u.id)) {
      n.isRead = true;
    }
  });
}
