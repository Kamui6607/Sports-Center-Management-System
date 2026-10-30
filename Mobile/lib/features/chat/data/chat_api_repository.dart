import 'dart:async';

import '../../../core/data/picked_file.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/network/realtime_client.dart';
import '../../../core/network/token_storage.dart';
import '../../auth/domain/entities/app_user.dart';
import '../domain/entities/chat.dart';
import '../domain/repositories/chat_repository.dart';

/// [ChatRepository] gọi BE thật — module `chat`. Hội thoại 1-1, id = userId người kia.
///
/// Realtime: Socket.IO của BE (`newMessage`, `typing`, `messagesRead`, `presenceChanged`) qua
/// [RealtimeClient]; khi socket mất kết nối ⇒ **polling** `GET /chat/conversations` mỗi [pollInterval]
/// làm dự phòng. Gửi tin vẫn qua REST (hỗ trợ đính kèm), BE phát `newMessage` cho người nhận.
class ChatApiRepository implements ChatRepository {
  ChatApiRepository(this._api, this._tokens, this._realtime);

  final ApiClient _api;
  final TokenStorage _tokens;
  final RealtimeClient _realtime;

  static const pollInterval = Duration(seconds: 5);

  /// Tệp đính kèm tối đa 10MB (BE `chatUpload`).
  static const maxFileBytes = 10 * 1024 * 1024;

  static ChatParticipant _participant(Json u) {
    final role = u.enumOr('role', UserRole.values, UserRole.member);
    return ChatParticipant(
      userId: u.str('id'),
      fullName: u.str('fullName'),
      role: role,
      avatarUrl: ApiClient.absoluteUrl(u.strOrNull('avatarUrl')),
      subtitle: switch (role) {
        UserRole.coach => 'Huấn luyện viên',
        UserRole.manager => 'Quản lý trung tâm',
        UserRole.member => 'Học viên',
      },
    );
  }

  static ChatMessage _message(Json m, String me) {
    final sender = m.str('senderId');
    final fileUrl = m.strOrNull('fileUrl');
    ChatAttachment? attachment;
    if (fileUrl != null) {
      // BE không kèm metadata tệp trong tin nhắn ⇒ lấy tên từ `?name=` của URL tải (có xác thực).
      final name = Uri.tryParse(fileUrl)?.queryParameters['name'] ?? fileUrl.split('/').last;
      attachment = ChatAttachment(
        name: name,
        sizeBytes: 0,
        isImage: PickedFile(name: name, sizeBytes: 0).isImage,
      );
    }
    return ChatMessage(
      id: m.str('id'),
      conversationId: sender == me ? m.str('receiverId') : sender,
      senderId: sender,
      content: m.strOrNull('content'),
      attachment: attachment,
      createdAt: m.date('createdAt'),
      isRead: m.boolean('isRead'),
    );
  }

  Future<String> _me() async => await _tokens.userId ?? '';

  @override
  Future<List<Conversation>> conversations() async {
    final me = await _me();
    final rows = (await _api.get('/chat/conversations')).list;
    return [
      for (final c in rows)
        Conversation(
          id: c.obj('user').str('id'),
          participants: [_participant(c.obj('user'))],
          lastMessage: c.objOrNull('latestMessage') == null ? null : _message(c.obj('latestMessage'), me),
          unreadCount: c.integer('unreadCount'),
          isOnline: _online.contains(c.obj('user').str('id')),
        ),
    ];
  }

  @override
  Future<List<ChatParticipant>> contacts() async {
    // L10: BE lọc theo khóa chung (Member ⇔ HLV các khóa đã mua; HLV ⇔ học viên của mình + Quản lý).
    final rows = (await _api.get('/chat/contacts')).list;
    return rows.map(_participant).toList();
  }

  @override
  Future<Conversation> conversationWith(String userId) async {
    final existing = (await conversations()).where((c) => c.id == userId).firstOrNull;
    if (existing != null) return existing;
    final contact = (await contacts()).where((p) => p.userId == userId).firstOrNull;
    if (contact == null) throw const AppFailure.forbidden('Bạn không thể nhắn tin với người dùng này.');
    return Conversation(id: userId, participants: [contact]);
  }

  @override
  Future<List<ChatMessage>> messages(String conversationId) async {
    final me = await _me();
    final rows = (await _api.get('/chat/messages', query: {'targetId': conversationId})).list;
    return rows.map((m) => _message(m, me)).toList();
  }

  @override
  Future<ChatMessage> send(String conversationId, {String? text, PickedFile? file}) async {
    final me = await _me();
    final content = text?.trim();
    final ApiResponse res;
    if (file != null) {
      if (file.sizeBytes > maxFileBytes) throw const AppFailure.validation('Tệp đính kèm tối đa 10MB.');
      res = await _api.upload(
        '/chat/messages',
        field: 'file',
        file: file,
        fields: {'receiverId': conversationId, if (content != null && content.isNotEmpty) 'content': content},
      );
    } else {
      res = await _api.post('/chat/messages', body: {'receiverId': conversationId, 'content': content});
    }
    final msg = _message(res.json, me);
    _known[conversationId] = msg.id;
    return msg;
  }

  @override
  void setTyping(String conversationId, bool isTyping) =>
      _realtime.emit('typing', {'receiverId': conversationId, 'isTyping': isTyping});

  @override
  Future<void> markRead(String conversationId) => _api.patch('/chat/messages/read', body: {'targetId': conversationId});

  @override
  Future<int> unreadCount() async => (await _api.get('/chat/messages/unread-count')).json.integer('unreadCount');

  // ── Realtime: Socket.IO + polling dự phòng ───────────────────────────

  StreamController<ChatEvent>? _events;
  StreamSubscription<RealtimeEvent>? _socketSub;
  Timer? _timer;

  /// Người dùng đang online (sự kiện `presenceChanged`).
  final _online = <String>{};

  /// Tin nhắn mới nhất đã biết của mỗi hội thoại / đã-đọc của tin cuối do tôi gửi (cho polling).
  final _known = <String, String>{};
  final _readKnown = <String, bool>{};
  bool _primed = false;

  @override
  Stream<ChatEvent> events() {
    _events ??= StreamController<ChatEvent>.broadcast(
      onListen: () {
        _socketSub = _realtime.stream.listen(_onSocket);
        _realtime.connected.addListener(_syncPolling);
        _syncPolling();
      },
      onCancel: () {
        _socketSub?.cancel();
        _socketSub = null;
        _realtime.connected.removeListener(_syncPolling);
        _timer?.cancel();
        _timer = null;
      },
    );
    return _events!.stream;
  }

  /// Polling chỉ chạy khi socket chưa/mất kết nối.
  void _syncPolling() {
    if (_realtime.connected.value) {
      _timer?.cancel();
      _timer = null;
    } else if (_timer == null) {
      _primed = false;
      _timer = Timer.periodic(pollInterval, (_) => _poll());
      _poll();
    }
  }

  Future<void> _onSocket(RealtimeEvent e) async {
    final sink = _events;
    if (sink == null) return;
    final me = await _me();
    switch (e.name) {
      case 'newMessage':
        final msg = _message(e.data, me);
        if (msg.senderId != me) {
          _known[msg.conversationId] = msg.id;
          sink.add(ChatMessageEvent(msg));
        }
      case 'typing':
        sink.add(ChatTypingEvent(e.data.str('userId'), e.data.boolean('isTyping')));
      case 'messagesRead':
        sink.add(ChatReadEvent(e.data.str('byUserId')));
      case 'presenceChanged':
        final id = e.data.str('userId');
        e.data.boolean('online') ? _online.add(id) : _online.remove(id);
    }
  }

  Future<void> _poll() async {
    final sink = _events;
    if (sink == null || !sink.hasListener) return;
    try {
      final me = await _me();
      for (final c in await conversations()) {
        final last = c.lastMessage;
        if (last == null) continue;
        final changed = _known[c.id] != last.id;
        if (_primed && changed && last.senderId != me) {
          // Có thể có nhiều tin mới ⇒ tải lại hội thoại, phát các tin sau tin đã biết.
          final list = await messages(c.id);
          final knownIndex = list.indexWhere((m) => m.id == _known[c.id]);
          for (final m in list.skip(knownIndex + 1).where((m) => m.senderId != me)) {
            sink.add(ChatMessageEvent(m));
          }
        }
        if (_primed && last.senderId == me && last.isRead && _readKnown[c.id] == false) {
          sink.add(ChatReadEvent(c.id));
        }
        _known[c.id] = last.id;
        _readKnown[c.id] = last.senderId == me ? last.isRead : true;
      }
      _primed = true;
    } on AppFailure {
      // Lỗi mạng tạm thời ⇒ thử lại ở lượt sau.
    }
  }
}
