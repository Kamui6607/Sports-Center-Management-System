import 'dart:math';

import '../../../core/error/app_failure.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/attendance.dart';
import '../domain/repositories/attendance_repository.dart';

/// Mock theo `BE/src/modules/attendance`.
class AttendanceMockRepository implements AttendanceRepository {
  AttendanceMockRepository(this._server);

  final MockServer _server;
  final _random = Random();

  /// TTL mã dự phòng (BE: 90 giây).
  static const codeTtl = Duration(seconds: 90);

  /// Muộn hơn mốc này sau giờ bắt đầu ⇒ ghi nhận "Đi trễ".
  static const lateAfter = Duration(minutes: 15);

  /// Hạn khiếu nại phạt (BE `APPEAL_WINDOW_HOURS`).
  static const appealWindow = Duration(hours: 72);

  static const _alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  CheckInResult _checkIn(QrTicketRow? ticket, {required bool byCode}) {
    final db = _server.db;
    final member = _server.requireMember();
    final now = db.now();
    if (ticket == null) {
      throw AppFailure.business(byCode ? 'Mã điểm danh không đúng.' : 'Mã QR không hợp lệ.', code: 'INVALID_CODE');
    }
    if (!now.isBefore(ticket.expiresAt)) {
      throw AppFailure.business(
        byCode ? 'Mã điểm danh đã hết hạn. Nhờ HLV tạo mã mới.' : 'Mã QR đã hết hạn. Vui lòng quét lại mã mới.',
        code: 'CODE_EXPIRED',
      );
    }
    final s = db.session(ticket.sessionId);
    final enrolled = db.enrollments.any(
      (e) => e.sessionId == s.id && e.memberProfileId == member.id && e.status != EnrollmentStatus.cancelled,
    );
    if (!enrolled) throw const AppFailure.forbidden('Bạn không có chỗ trong buổi học này.');
    final existing = db.attendance.where((a) => a.sessionId == s.id && a.memberProfileId == member.id).firstOrNull;
    if (existing != null) {
      throw const AppFailure.conflict('Bạn đã điểm danh buổi học này rồi.', code: 'ALREADY_CHECKED_IN');
    }
    final status = now.isAfter(s.start.add(lateAfter)) ? AttendanceStatus.late : AttendanceStatus.present;
    db.attendance.add(AttendanceRow(id: db.nextId('att'), sessionId: s.id, memberProfileId: member.id, status: status));
    return CheckInResult(
      className: db.classRow(s.classId).name,
      startTime: s.start,
      endTime: s.end,
      roomName: db.room(s.roomId).name,
      status: status,
    );
  }

  @override
  Future<CheckInResult> scanQr(String qrToken) => _server.run(
    () => _checkIn(_server.db.qrTickets.values.where((t) => t.token == qrToken).firstOrNull, byCode: false),
  );

  @override
  Future<CheckInResult> submitCode(String code) => _server.run(
    () => _checkIn(
      _server.db.qrTickets.values.where((t) => t.code == code.trim().toUpperCase()).firstOrNull,
      byCode: true,
    ),
  );

  @override
  Future<List<AttendanceRecord>> myRecords() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    return db.attendance.where((a) => a.memberProfileId == member.id).map((a) {
      final s = db.session(a.sessionId);
      return AttendanceRecord(
        id: a.id,
        sessionId: s.id,
        classId: s.classId,
        className: db.classRow(s.classId).name,
        startTime: s.start,
        endTime: s.end,
        status: a.status,
        note: a.note,
      );
    }).toList()..sort((a, b) => b.startTime.compareTo(a.startTime));
  });

  @override
  Future<List<ClassAttendanceStat>> mySummary() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final byClass = <String, List<AttendanceRow>>{};
    for (final a in db.attendance.where((a) => a.memberProfileId == member.id)) {
      byClass.putIfAbsent(db.session(a.sessionId).classId, () => []).add(a);
    }
    int count(List<AttendanceRow> l, AttendanceStatus s) => l.where((a) => a.status == s).length;
    return [
      for (final entry in byClass.entries)
        ClassAttendanceStat(
          classId: entry.key,
          className: db.classRow(entry.key).name,
          present: count(entry.value, AttendanceStatus.present),
          late: count(entry.value, AttendanceStatus.late),
          absent: count(entry.value, AttendanceStatus.absent),
          excused: count(entry.value, AttendanceStatus.excused),
        ),
    ]..sort((a, b) => a.rate.compareTo(b.rate));
  });

  @override
  Future<List<AttendancePenalty>> myPenalties() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    return db.penalties.where((p) => p.memberProfileId == member.id).map((p) {
      return AttendancePenalty(
        id: p.id,
        classId: p.classId,
        className: db.classRow(p.classId).name,
        reason: p.reason,
        attendanceRate: p.attendanceRate,
        releasedCount: p.releasedCount,
        status: p.status,
        createdAt: p.createdAt,
        blockedUntil: p.blockedUntil,
        appealReason: p.appealReason,
        appealedAt: p.appealedAt,
        appealDeadline: p.createdAt.add(appealWindow),
      );
    }).toList();
  });

  @override
  Future<void> appeal(String penaltyId, String reason) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final p = db.penalties.where((x) => x.id == penaltyId && x.memberProfileId == member.id).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Không tìm thấy quyết định phạt.');
    if (reason.trim().length < 5) {
      throw const AppFailure.validation(
        'Lý do khiếu nại tối thiểu 5 ký tự.',
        fieldErrors: {'reason': 'Tối thiểu 5 ký tự'},
      );
    }
    if (p.appealedAt != null) throw const AppFailure.conflict('Bạn đã gửi khiếu nại cho quyết định này.');
    if (!db.now().isBefore(p.createdAt.add(appealWindow))) {
      throw const AppFailure.business('Đã quá thời hạn khiếu nại (72 giờ).');
    }
    p
      ..appealReason = reason.trim()
      ..appealedAt = db.now();
    db.notifyManagers(
      'Khiếu nại phạt chuyên cần',
      '${db.userOfMember(member.id).fullName} khiếu nại phạt ở khóa "${db.classRow(p.classId).name}".',
      metadata: {'penaltyId': p.id},
    );
  });

  @override
  Future<QrTicket> generateQr(String sessionId) => _server.run(() {
    final db = _server.db;
    final s = _server.requireOwnedSession(sessionId);
    if (s.status != ScheduleStatus.scheduled) throw const AppFailure.business('Chỉ mở QR cho buổi học đang diễn ra.');
    final now = db.now();
    if (now.isBefore(s.start.subtract(const Duration(minutes: 30))) || now.isAfter(s.end)) {
      throw const AppFailure.business('Chỉ mở QR trong khoảng 30 phút trước giờ học đến khi kết thúc buổi.');
    }
    final code = List.generate(6, (_) => _alphabet[_random.nextInt(_alphabet.length)]).join();
    final ticket = QrTicketRow(
      sessionId: s.id,
      token: 'att.${s.id}.${now.millisecondsSinceEpoch}.${_random.nextInt(1 << 32)}',
      code: code,
      expiresAt: now.add(codeTtl),
    );
    db.qrTickets[s.id] = ticket;
    return QrTicket(sessionId: s.id, qrToken: ticket.token, manualCode: ticket.code, expiresAt: ticket.expiresAt);
  });

  @override
  Future<void> stopQr(String sessionId) async {
    _server.db.qrTickets.remove(sessionId);
  }

  @override
  Future<int> checkedInCount(String sessionId) => _server.run(
    () => _server.db.attendance
        .where(
          (a) =>
              a.sessionId == sessionId && (a.status == AttendanceStatus.present || a.status == AttendanceStatus.late),
        )
        .length,
  );
}
