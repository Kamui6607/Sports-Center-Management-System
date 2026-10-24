import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/env.dart';
import 'api_client.dart';
import 'json.dart';
import 'token_storage.dart';

/// Một sự kiện realtime từ BE (Socket.IO): tên + dữ liệu JSON.
class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);

  final String name;
  final Json data;
}

/// Kết nối Socket.IO dùng chung (chat + thông báo). REST vẫn là nguồn dữ liệu chính; socket chỉ
/// báo "có thay đổi" để màn hình cập nhật ngay.
///
/// - Xác thực bằng access token ở MỖI lần (kết nối lại) — token lấy mới từ [TokenStorage].
/// - Tự kết nối lại (backoff của socket.io); bị từ chối vì token hết hạn ⇒ gọi 1 request REST nhẹ để
///   interceptor tự refresh token rồi thử lại.
/// - [connected] cho phép nơi dùng bật polling dự phòng khi socket mất kết nối.
class RealtimeClient {
  RealtimeClient(this._tokens, this._api);

  final TokenStorage _tokens;
  final ApiClient _api;

  /// Sự kiện BE phát ra mà app quan tâm.
  static const events = ['newMessage', 'typing', 'messagesRead', 'presenceChanged', 'notification:new'];

  io.Socket? _socket;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final connected = ValueNotifier<bool>(false);
  Timer? _retry;
  bool _wanted = false;

  Stream<RealtimeEvent> get stream {
    unawaited(ensureConnected());
    return _events.stream;
  }

  Stream<RealtimeEvent> on(String name) => stream.where((e) => e.name == name);

  /// Mở kết nối nếu đang có phiên đăng nhập (gọi nhiều lần không sao).
  Future<void> ensureConnected() async {
    _wanted = true;
    if (_socket != null || !await _tokens.hasSession) return;
    final options = io.OptionBuilder()
        .setTransports(['websocket'])
        .disableAutoConnect()
        .enableReconnection()
        .setReconnectionDelay(2000)
        .setReconnectionDelayMax(15000)
        .build();
    // Token mới ở mỗi lần bắt tay (kể cả khi tự kết nối lại).
    options['auth'] = (void Function(Map<String, dynamic>) send) async {
      send({'token': await _tokens.accessToken ?? ''});
    };
    final socket = io.io(Env.apiBaseUrl, options);
    socket
      ..onConnect((_) {
        connected.value = true;
        _retry?.cancel();
      })
      ..onDisconnect((_) => connected.value = false)
      ..onConnectError((_) {
        connected.value = false;
        _scheduleRetry();
      });
    for (final name in events) {
      socket.on(name, (data) => _events.add(RealtimeEvent(name, asJson(data))));
    }
    _socket = socket..connect();
  }

  /// Middleware BE từ chối (token hết hạn) ⇒ socket.io KHÔNG tự thử lại: làm mới token qua REST rồi nối lại.
  void _scheduleRetry() {
    _retry?.cancel();
    _retry = Timer(const Duration(seconds: 5), () async {
      if (!_wanted || _socket == null || connected.value) return;
      try {
        await _api.get('/notifications/unread-count');
      } on Object {
        // Mất mạng / hết phiên ⇒ lần sau thử tiếp (phiên hết hạn sẽ gọi [disconnect]).
      }
      if (_wanted && !connected.value) _socket?.connect();
    });
  }

  void emit(String name, Map<String, Object?> data) {
    if (connected.value) _socket?.emit(name, data);
  }

  /// Đăng xuất / hết phiên.
  void disconnect() {
    _wanted = false;
    _retry?.cancel();
    _socket?.dispose();
    _socket = null;
    connected.value = false;
  }

  void dispose() {
    disconnect();
    unawaited(_events.close());
    connected.dispose();
  }
}

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(ref.watch(tokenStorageProvider), ref.watch(apiClientProvider));
  // Hết phiên (refresh thất bại) ⇒ đóng socket.
  ref.listen(sessionExpiredProvider, (_, _) => client.disconnect());
  ref.onDispose(client.dispose);
  return client;
});
