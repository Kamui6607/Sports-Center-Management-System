import '../../../auth/domain/entities/app_user.dart';

/// Thành viên hội thoại.
class ChatParticipant {
  const ChatParticipant({
    required this.userId,
    required this.fullName,
    required this.role,
    this.avatarUrl,
    this.subtitle,
  });

  final String userId;
  final String fullName;
  final UserRole role;
  final String? avatarUrl;

  /// VD tên khóa học chung.
  final String? subtitle;
}

/// Hội thoại. Hiện chỉ 1-1 (Q7) nhưng giữ danh sách [participants] để mở rộng
/// chat nhóm sau này.
class Conversation {
  const Conversation({
    required this.id,
    required this.participants,
    this.lastMessage,
    this.unreadCount = 0,
    this.isOnline = false,
  });

  final String id;

  /// Thành viên khác (không gồm người dùng hiện tại).
  final List<ChatParticipant> participants;
  final ChatMessage? lastMessage;
  final int unreadCount;
  final bool isOnline;

  bool get isGroup => participants.length > 1;

  String get title => participants.map((p) => p.fullName).join(', ');

  ChatParticipant get primary => participants.first;
}

/// Tệp đính kèm (riêng tư — tải qua `GET /chat/attachments/:id`).
class ChatAttachment {
  const ChatAttachment({required this.name, required this.sizeBytes, required this.isImage, this.localPath});

  final String name;
  final int sizeBytes;
  final bool isImage;
  final String? localPath;
}

enum MessageDelivery { sending, sent, failed }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.createdAt,
    this.content,
    this.attachment,
    this.isRead = false,
    this.delivery = MessageDelivery.sent,
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String? content;
  final ChatAttachment? attachment;
  final DateTime createdAt;
  final bool isRead;
  final MessageDelivery delivery;

  ChatMessage copyWith({MessageDelivery? delivery, bool? isRead}) => ChatMessage(
    id: id,
    conversationId: conversationId,
    senderId: senderId,
    content: content,
    attachment: attachment,
    createdAt: createdAt,
    isRead: isRead ?? this.isRead,
    delivery: delivery ?? this.delivery,
  );
}

/// Sự kiện realtime (Socket.IO: `newMessage`, `typing`, `messagesRead`).
sealed class ChatEvent {
  const ChatEvent(this.conversationId);

  final String conversationId;
}

class ChatTypingEvent extends ChatEvent {
  const ChatTypingEvent(super.conversationId, this.isTyping);

  final bool isTyping;
}

class ChatMessageEvent extends ChatEvent {
  ChatMessageEvent(this.message) : super(message.conversationId);

  final ChatMessage message;
}

class ChatReadEvent extends ChatEvent {
  const ChatReadEvent(super.conversationId);
}
