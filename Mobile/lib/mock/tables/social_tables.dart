// Bảng giao tiếp: Notification, ChatMessage.
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import '../../features/notifications/domain/entities/app_notification.dart';

class NotificationRow {
  NotificationRow({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.reason,
    this.metadata = const {},
    this.isRead = false,
  });

  final String id;
  final String userId;
  final NotificationType type;
  final String title;
  final String body;
  final String? reason;
  final Map<String, String> metadata;
  final DateTime createdAt;
  bool isRead;
}

class ChatMessageRow {
  ChatMessageRow({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.createdAt,
    this.content,
    this.attachmentName,
    this.attachmentSize,
    this.attachmentIsImage = false,
    this.isRead = false,
  });

  final String id;
  final String senderId;
  final String receiverId;
  final String? content;
  final String? attachmentName;
  final int? attachmentSize;
  final bool attachmentIsImage;
  final DateTime createdAt;
  bool isRead;
}
