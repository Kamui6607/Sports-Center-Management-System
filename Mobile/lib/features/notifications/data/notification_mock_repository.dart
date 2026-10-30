import '../../../mock/mock_server.dart';
import '../../classes/domain/entities/course.dart';
import '../domain/entities/app_notification.dart';
import '../domain/repositories/notification_repository.dart';

/// Mock theo `BE/src/modules/notifications`.
class NotificationMockRepository implements NotificationRepository {
  NotificationMockRepository(this._server);

  final MockServer _server;

  @override
  Future<List<AppNotification>> notifications({bool unreadOnly = false}) => _server.run(() {
    final u = _server.requireUser();
    final activeClassIds = _server.db.classes.where((c) => c.status == ClassStatus.approved).map((c) => c.id).toSet();
    final scheduleToClass = {for (final s in _server.db.sessions) s.id: s.classId};

    return _server.db.notifications
        .where((n) {
          if (n.userId != u.id) return false;
          if (unreadOnly && n.isRead) return false;
          final classId = n.metadata['classId']?.toString() ?? scheduleToClass[n.metadata['scheduleId']?.toString()];
          if (classId != null && !activeClassIds.contains(classId)) {
            return false;
          }
          return true;
        })
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
    final activeClassIds = _server.db.classes.where((c) => c.status == ClassStatus.approved).map((c) => c.id).toSet();
    final scheduleToClass = {for (final s in _server.db.sessions) s.id: s.classId};

    return _server.db.notifications.where((n) {
      if (n.userId != u.id || n.isRead) return false;
      final classId = n.metadata['classId']?.toString() ?? scheduleToClass[n.metadata['scheduleId']?.toString()];
      if (classId != null && !activeClassIds.contains(classId)) return false;
      return true;
    }).length;
  });

  @override
  Future<void> markRead(String id) => _server.run(() {
    final u = _server.requireUser();
    for (final n in _server.db.notifications.where((n) => n.id == id && n.userId == u.id)) {
      n.isRead = true;
    }
  });

  /// Mock: thông báo mới đã đi kèm `dataRevision` sau mỗi thao tác ⇒ không cần luồng riêng.
  @override
  Stream<void> changes() => const Stream.empty();

  @override
  Future<void> markAllRead() => _server.run(() {
    final u = _server.requireUser();
    for (final n in _server.db.notifications.where((n) => n.userId == u.id)) {
      n.isRead = true;
    }
  });
}
