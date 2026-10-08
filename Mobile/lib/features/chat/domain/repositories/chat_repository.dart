import '../../../../core/data/picked_file.dart';
import '../entities/chat.dart';

/// Chat 1-1 — module `chat` (REST + Socket.IO).
abstract interface class ChatRepository {
  /// `GET /chat/conversations`.
  Future<List<Conversation>> conversations();

  /// `GET /chat/contacts` — người có thể nhắn (HLV ↔ học viên chung khóa).
  Future<List<ChatParticipant>> contacts();

  /// Mở (hoặc tạo) hội thoại 1-1 với [userId].
  Future<Conversation> conversationWith(String userId);

  /// `GET /chat/messages`.
  Future<List<ChatMessage>> messages(String conversationId);

  /// Socket `sendMessage` (text) hoặc `POST /chat/messages` (kèm tệp ≤ 10MB).
  Future<ChatMessage> send(String conversationId, {String? text, PickedFile? file});

  /// Socket `typing`.
  void setTyping(String conversationId, bool isTyping);

  /// `PATCH /chat/messages/read`.
  Future<void> markRead(String conversationId);

  /// `GET /chat/messages/unread-count`.
  Future<int> unreadCount();

  /// Luồng sự kiện realtime.
  Stream<ChatEvent> events();
}
