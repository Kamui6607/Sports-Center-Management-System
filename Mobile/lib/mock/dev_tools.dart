import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/error/app_failure.dart';
import '../features/schedule/domain/entities/session.dart';
import 'mock_server.dart';
import 'mock_tables.dart';

/// Công cụ chỉ có ở chế độ mock — giúp demo các luồng cần 2 thiết bị
/// (HLV mở QR ⇔ học viên quét). KHÔNG dùng khi nối API.
class MockDevTools {
  MockDevTools(this._server);

  final MockServer _server;

  MockSettings get settings => _server.settings;

  /// Tạo vé QR cho buổi đang (sắp) diễn ra của Member hiện tại, trả token để
  /// mô phỏng việc quét mã HLV đang chiếu.
  String demoQrTokenForCurrentMember() {
    final db = _server.db;
    final member = _server.requireMember();
    final now = db.now();
    final session = db.enrollments
        .where((e) => e.memberProfileId == member.id && e.status == EnrollmentStatus.booked)
        .map((e) => db.session(e.sessionId))
        .where(
          (s) =>
              s.status == ScheduleStatus.scheduled &&
              !now.isBefore(s.start.subtract(const Duration(minutes: 30))) &&
              now.isBefore(s.end),
        )
        .firstOrNull;
    if (session == null) throw const AppFailure.business('Bạn không có buổi học nào đang diễn ra để điểm danh.');
    final existing = db.qrTickets[session.id];
    if (existing != null && now.isBefore(existing.expiresAt)) return existing.token;
    final ticket = QrTicketRow(
      sessionId: session.id,
      token: 'att.${session.id}.demo.${now.millisecondsSinceEpoch}',
      code: 'DEMK42',
      expiresAt: now.add(const Duration(seconds: 90)),
    );
    db.qrTickets[session.id] = ticket;
    return ticket.token;
  }
}

final mockDevToolsProvider = Provider<MockDevTools>((ref) => MockDevTools(ref.watch(mockServerProvider)));
