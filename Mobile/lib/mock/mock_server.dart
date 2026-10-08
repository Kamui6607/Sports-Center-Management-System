import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/error/app_failure.dart';
import '../features/auth/domain/entities/app_user.dart';
import 'mock_database.dart';
import 'mock_tables.dart';
import 'seed/seed.dart';

/// Repository mock truy cập `db` qua server ⇒ cần các extension nghiệp vụ / ánh xạ.
export 'mock_database.dart';

/// Cấu hình giả lập mạng (màn "Công cụ phát triển").
class MockSettings {
  bool networkError = false;
  bool serverError = false;
  bool slowNetwork = false;

  /// Tự xác nhận thanh toán sau ~20s (mô phỏng người dùng chuyển khoản).
  bool autoConfirmPayments = true;

  /// Bỏ độ trễ giả lập (dùng trong test).
  bool noLatency = false;
}

/// "Máy chủ" giả lập: giữ [MockDatabase], phiên đăng nhập (thay JWT), độ trễ và
/// lỗi mạng giả lập. Mọi mock repository gọi qua [run].
class MockServer {
  MockServer(this.db);

  final MockDatabase db;
  final settings = MockSettings();
  final _random = Random();

  /// Người dùng đang đăng nhập (tương đương token).
  String? currentUserId;

  /// Sự kiện realtime (chat) — phát cho repository chat.
  final realtime = StreamController<Object>.broadcast();

  /// Thực thi một "request": trễ 300–800ms (hoặc 1.5–2.5s khi mạng chậm),
  /// có thể ném lỗi mạng / 500 theo [settings].
  Future<T> run<T>(FutureOr<T> Function() handler) async {
    if (!settings.noLatency) {
      final base = settings.slowNetwork ? 1500 : 300;
      await Future<void>.delayed(Duration(milliseconds: base + _random.nextInt(settings.slowNetwork ? 1000 : 500)));
    }
    if (settings.networkError) throw const AppFailure.network();
    if (settings.serverError) throw const AppFailure.server();
    db.expireStalePayments();
    return handler();
  }

  /// Người dùng hiện tại (ném 401 nếu chưa đăng nhập).
  UserRow requireUser() {
    final id = currentUserId;
    if (id == null) throw const AppFailure.unauthorized();
    return db.user(id);
  }

  UserRow requireRole(UserRole role) {
    final u = requireUser();
    if (u.role != role) throw const AppFailure.forbidden();
    if (!u.isActive) throw const AppFailure.forbidden('Tài khoản chưa được kích hoạt.');
    return u;
  }

  MemberProfileRow requireMember() => db.memberOfUser(requireRole(UserRole.member).id)!;

  CoachProfileRow requireCoach() => db.coachOfUser(requireRole(UserRole.coach).id)!;

  /// Buổi học thuộc khóa của HLV đang đăng nhập (404 / 403 như BE).
  SessionRow requireOwnedSession(String sessionId) {
    final coach = requireCoach();
    final s = db.sessions.where((x) => x.id == sessionId).firstOrNull;
    if (s == null) throw const AppFailure.notFound('Không tìm thấy buổi học.');
    if (db.classRow(s.classId).coachProfileId != coach.id) throw const AppFailure.forbidden();
    return s;
  }

  /// Người dùng hiện tại nếu có (Guest ⇒ null).
  UserRow? get currentUser => currentUserId == null ? null : db.user(currentUserId!);
}

/// Máy chủ giả lập dùng chung toàn app (seed theo thời điểm khởi động).
final mockServerProvider = Provider<MockServer>((ref) {
  final server = MockServer(seedDatabase(DateTime.now));
  ref.onDispose(server.realtime.close);
  return server;
});
