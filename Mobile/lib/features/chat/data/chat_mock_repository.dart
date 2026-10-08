import 'dart:async';

import '../../../core/data/picked_file.dart';
import '../../../core/error/app_failure.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../../payments/domain/entities/payment.dart';
import '../domain/entities/chat.dart';
import '../domain/repositories/chat_repository.dart';

/// Mock theo `BE/src/modules/chat` (REST + Socket.IO). Hội thoại 1-1, id = userId
/// của người kia. Mô phỏng realtime: "đang soạn tin" và tin trả lời tự động.
class ChatMockRepository implements ChatRepository {
  ChatMockRepository(this._server);

  final MockServer _server;

  /// Tệp đính kèm tối đa 10MB.
  static const maxFileBytes = 10 * 1024 * 1024;

  static const _autoReplies = [
    'Mình đã nhận được tin nhắn, cảm ơn bạn nhé!',
    'Ok bạn, hẹn gặp ở buổi tập tới.',
    'Bạn nhớ khởi động kỹ trước buổi học nhé.',
  ];
  var _replyIndex = 0;

  ChatParticipant _participant(MockDatabase db, String userId) {
    final u = db.user(userId);
    final coach = db.coachOfUser(u.id);
    return ChatParticipant(
      userId: u.id,
      fullName: u.fullName,
      role: u.role,
      avatarUrl: u.avatarUrl,
      subtitle: switch (u.role) {
        UserRole.coach => 'HLV · ${coach?.specialization ?? ''}',
        UserRole.manager => 'Quản lý trung tâm',
        UserRole.member => 'Học viên',
      },
    );
  }

  ChatMessage _toMessage(ChatMessageRow r, String me) => ChatMessage(
    id: r.id,
    conversationId: r.senderId == me ? r.receiverId : r.senderId,
    senderId: r.senderId,
    content: r.content,
    attachment: r.attachmentName == null
        ? null
        : ChatAttachment(name: r.attachmentName!, sizeBytes: r.attachmentSize ?? 0, isImage: r.attachmentIsImage),
    createdAt: r.createdAt,
    isRead: r.isRead,
  );

  Iterable<ChatMessageRow> _between(String a, String b) => _server.db.chatMessages.where(
    (m) => (m.senderId == a && m.receiverId == b) || (m.senderId == b && m.receiverId == a),
  );

  @override
  Future<List<Conversation>> conversations() => _server.run(() {
    final db = _server.db;
    final me = _server.requireUser().id;
    final peers = <String>{
      for (final m in db.chatMessages)
        if (m.senderId == me) m.receiverId else if (m.receiverId == me) m.senderId,
    };
    return peers.map((peer) {
        final msgs = _between(me, peer).toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));
        return Conversation(
          id: peer,
          participants: [_participant(db, peer)],
          lastMessage: msgs.isEmpty ? null : _toMessage(msgs.last, me),
          unreadCount: msgs.where((m) => m.receiverId == me && !m.isRead).length,
          isOnline: db.user(peer).online,
        );
      }).toList()
      ..sort((a, b) => (b.lastMessage?.createdAt ?? DateTime(0)).compareTo(a.lastMessage?.createdAt ?? DateTime(0)));
  });

  @override
  Future<List<ChatParticipant>> contacts() => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final ids = <String>{};
    final member = db.memberOfUser(u.id);
    final coach = db.coachOfUser(u.id);
    if (member != null) {
      for (final p in db.payments.where(
        (p) => p.memberProfileId == member.id && p.classId != null && p.status == PaymentStatus.success,
      )) {
        ids.add(db.userOfCoach(db.classRow(p.classId!).coachProfileId).id);
      }
    }
    if (coach != null) {
      for (final c in db.classes.where((c) => c.coachProfileId == coach.id)) {
        ids.addAll(db.studentsOf(c.id).map((m) => db.userOfMember(m).id));
      }
    }
    if (u.role == UserRole.manager) {
      ids.addAll(db.users.where((x) => x.role == UserRole.coach && x.isActive).map((x) => x.id));
    }
    return ids.map((id) => _participant(db, id)).toList()..sort((a, b) => a.fullName.compareTo(b.fullName));
  });

  @override
  Future<Conversation> conversationWith(String userId) => _server.run(() {
    final db = _server.db;
    final me = _server.requireUser().id;
    if (!db.users.any((u) => u.id == userId)) throw const AppFailure.notFound('Không tìm thấy người nhận.');
    final msgs = _between(me, userId).toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return Conversation(
      id: userId,
      participants: [_participant(db, userId)],
      lastMessage: msgs.isEmpty ? null : _toMessage(msgs.last, me),
      isOnline: db.user(userId).online,
    );
  });

  @override
  Future<List<ChatMessage>> messages(String conversationId) => _server.run(() {
    final me = _server.requireUser().id;
    return _between(me, conversationId).map((m) => _toMessage(m, me)).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  });

  @override
  Future<ChatMessage> send(String conversationId, {String? text, PickedFile? file}) => _server.run(() {
    final db = _server.db;
    final me = _server.requireUser();
    final content = text?.trim();
    if ((content == null || content.isEmpty) && file == null) {
      throw const AppFailure.validation('Nhập nội dung hoặc chọn tệp đính kèm.');
    }
    if (file != null && file.sizeBytes > maxFileBytes) throw const AppFailure.validation('Tệp tối đa 10 MB.');
    final row = ChatMessageRow(
      id: db.nextId('msg'),
      senderId: me.id,
      receiverId: conversationId,
      createdAt: db.now(),
      content: content == null || content.isEmpty ? null : content,
      attachmentName: file?.name,
      attachmentSize: file?.sizeBytes,
      attachmentIsImage: file?.isImage ?? false,
    );
    db.chatMessages.add(row);
    _scheduleReply(me.id, conversationId);
    return _toMessage(row, me.id);
  });

  /// Mô phỏng người kia đang soạn tin rồi trả lời (Socket `typing`, `newMessage`).
  void _scheduleReply(String me, String peer) {
    final db = _server.db;
    if (!db.user(peer).online) return;
    Timer(const Duration(milliseconds: 900), () {
      if (_server.realtime.isClosed) return;
      _server.realtime.add(ChatTypingEvent(peer, true));
      Timer(const Duration(milliseconds: 1800), () {
        if (_server.realtime.isClosed) return;
        final reply = ChatMessageRow(
          id: db.nextId('msg'),
          senderId: peer,
          receiverId: me,
          createdAt: db.now(),
          content: _autoReplies[_replyIndex++ % _autoReplies.length],
        );
        db.chatMessages.add(reply);
        db.notify(
          me,
          NotificationType.chatMessage,
          'Tin nhắn mới từ ${db.user(peer).fullName}',
          reply.content!,
          metadata: {'senderId': peer},
        );
        _server.realtime
          ..add(ChatTypingEvent(peer, false))
          ..add(ChatMessageEvent(_toMessage(reply, me)));
      });
    });
  }

  @override
  void setTyping(String conversationId, bool isTyping) {
    // Mock: không gửi đi đâu. API: emit socket `typing { receiverId, isTyping }`.
  }

  @override
  Future<void> markRead(String conversationId) => _server.run(() {
    final me = _server.requireUser().id;
    for (final m in _server.db.chatMessages.where((m) => m.senderId == conversationId && m.receiverId == me)) {
      m.isRead = true;
    }
  });

  @override
  Future<int> unreadCount() => _server.run(() {
    final me = _server.currentUserId;
    if (me == null) return 0;
    return _server.db.chatMessages.where((m) => m.receiverId == me && !m.isRead).length;
  });

  @override
  Stream<ChatEvent> events() => _server.realtime.stream.where((e) => e is ChatEvent).cast<ChatEvent>();
}
