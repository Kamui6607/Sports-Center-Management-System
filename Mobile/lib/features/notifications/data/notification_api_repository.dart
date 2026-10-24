import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/network/realtime_client.dart';
import '../domain/entities/app_notification.dart';
import '../domain/repositories/notification_repository.dart';

/// [NotificationRepository] gọi BE thật — module `notifications` (REST + sự kiện Socket.IO `notification:new`).
class NotificationApiRepository implements NotificationRepository {
  NotificationApiRepository(this._api, this._realtime);

  final ApiClient _api;
  final RealtimeClient _realtime;

  /// Số thông báo tải tối đa (5 trang × 100) — màn thông báo không phân trang.
  static const _maxPages = 5;

  static AppNotification _notification(Json n) {
    final meta = n.objOrNull('metadata') ?? const <String, Object?>{};
    return AppNotification(
      id: n.str('id'),
      type: n.enumOr('type', NotificationType.values, NotificationType.general),
      title: n.str('title'),
      body: n.str('body'),
      reason: n.strOrNull('reason'),
      isRead: n.boolean('isRead'),
      createdAt: n.date('createdAt'),
      metadata: {
        for (final e in meta.entries)
          if (e.value != null) e.key: e.value.toString(),
      },
    );
  }

  @override
  Future<List<AppNotification>> notifications({bool unreadOnly = false}) async {
    final rows = await _api.getAll('/notifications', query: {if (unreadOnly) 'isRead': 'false'}, maxPages: _maxPages);
    return rows.map(_notification).toList();
  }

  @override
  Future<int> unreadCount() async {
    final data = (await _api.get('/notifications/unread-count')).data;
    return data is num ? data.toInt() : asJson(data).integer('unreadCount', asJson(data).integer('count'));
  }

  @override
  Future<void> markRead(String id) => _api.patch('/notifications/$id/read');

  @override
  Future<void> markAllRead() => _api.patch('/notifications/mark-all-read');

  @override
  Stream<void> changes() => _realtime.on('notification:new').map((_) {});
}
