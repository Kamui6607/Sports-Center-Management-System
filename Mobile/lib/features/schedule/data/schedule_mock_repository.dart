import '../../../core/error/app_failure.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../../classes/domain/entities/course.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../domain/entities/session.dart';
import '../domain/repositories/schedule_repository.dart';
import 'session_cancel_mock_rules.dart';

/// Mock theo `BE/src/modules/class-schedules` + `enrollments` + `attendance`.
class ScheduleMockRepository implements ScheduleRepository {
  ScheduleMockRepository(this._server);

  final MockServer _server;

  // ── Member ─────────────────────────────────────────────────────────────

  bool _visibleInSchedule(EnrollmentRow e) {
    if (e.status != EnrollmentStatus.cancelled) return true;
    // Buổi bị hủy bởi HLV vẫn hiển thị (kèm thông tin dạy bù / hoàn tiền).
    final s = _server.db.session(e.sessionId);
    return s.status == ScheduleStatus.cancelled && s.resolution == CancelResolutionMode.refund;
  }

  MySession _toMySession(EnrollmentRow e) {
    final db = _server.db;
    final now = db.now();
    final s = db.session(e.sessionId);
    final att = db.attendance.where((a) => a.sessionId == s.id && a.memberProfileId == e.memberProfileId).firstOrNull;
    String? block;
    if (s.status == ScheduleStatus.cancelled) {
      block = 'Buổi học đã bị hủy.';
    } else if (e.status != EnrollmentStatus.booked) {
      block = 'Chỉ thao tác được với buổi đang giữ chỗ.';
    } else if (!now.isBefore(s.start)) {
      block = 'Buổi học đã bắt đầu hoặc đã kết thúc.';
    }
    String? transferBlock = block;
    if (transferBlock == null && _targets(e).every((t) => t.blockReason != null)) {
      transferBlock = 'Không còn buổi nào khác của khóa còn chỗ để đổi.';
    }
    final refund = db.refunds.where((r) => r.scheduleId == s.id && r.memberProfileId == e.memberProfileId).firstOrNull;
    return MySession(
      session: db.toSession(s),
      enrollmentId: e.id,
      enrollmentStatus: e.status,
      attendance: att?.status,
      cancelBlockReason: block,
      transferBlockReason: transferBlock,
      refundId: refund?.id,
    );
  }

  @override
  Future<List<MySession>> mySessions(DateTime from, DateTime to) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    return db.enrollments
        .where((e) => e.memberProfileId == member.id && _visibleInSchedule(e))
        .where((e) {
          final s = db.session(e.sessionId);
          return !s.start.isBefore(from) && s.start.isBefore(to);
        })
        .map(_toMySession)
        .toList()
      ..sort((a, b) => a.session.startTime.compareTo(b.session.startTime));
  });

  @override
  Future<MySession> mySession(String sessionId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    var e = db.enrollments.where((x) => x.memberProfileId == member.id && x.sessionId == sessionId).firstOrNull;
    // Buổi bị hủy có dạy bù: chỗ đã chuyển sang buổi bù.
    if (e == null) {
      final makeup = db.sessions.where((s) => s.makeupForId == sessionId).firstOrNull;
      if (makeup != null) {
        e = db.enrollments.where((x) => x.memberProfileId == member.id && x.sessionId == makeup.id).firstOrNull;
      }
    }
    if (e == null) throw const AppFailure.notFound('Bạn không có chỗ trong buổi học này.');
    return _toMySession(e);
  });

  @override
  Future<void> cancelEnrollment(String enrollmentId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final e = db.enrollments.where((x) => x.id == enrollmentId).firstOrNull;
    if (e == null) throw const AppFailure.notFound('Không tìm thấy chỗ đã giữ.');
    if (e.memberProfileId != member.id) throw const AppFailure.forbidden('Bạn chỉ hủy được chỗ của mình.');
    final reason = _toMySession(e).cancelBlockReason;
    if (reason != null) throw AppFailure.business(reason);
    e
      ..status = EnrollmentStatus.cancelled
      ..cancelledAt = db.now();
    final s = db.session(e.sessionId);
    db.notify(
      member.userId,
      NotificationType.enrollmentCancelled,
      'Đã hủy buổi học',
      'Bạn đã hủy buổi ${VnTime.sessionLabel(s.start, s.end)} của khóa "${db.classRow(s.classId).name}".',
      metadata: {'scheduleId': s.id, 'classId': s.classId},
    );
  });

  List<TransferOption> _targets(EnrollmentRow e) {
    final db = _server.db;
    final now = db.now();
    final current = db.session(e.sessionId);
    final mine = db.enrollments
        .where((x) => x.memberProfileId == e.memberProfileId && x.status == EnrollmentStatus.booked)
        .map((x) => db.session(x.sessionId))
        .toList();
    return db
        .sessionsOf(current.classId)
        .where((s) => s.id != current.id && s.status == ScheduleStatus.scheduled && s.start.isAfter(now))
        .map((s) {
          String? reason;
          if (mine.any((m) => m.id == s.id)) {
            reason = 'Bạn đã giữ chỗ buổi này';
          } else if (db.bookedCount(s.id) >= db.classRow(s.classId).capacity) {
            reason = 'Hết chỗ';
          } else {
            final clash = mine
                .where((m) => m.id != current.id && m.start.isBefore(s.end) && s.start.isBefore(m.end))
                .firstOrNull;
            if (clash != null) reason = 'Trùng giờ với "${db.classRow(clash.classId).name}"';
          }
          return TransferOption(session: db.toSession(s), blockReason: reason);
        })
        .toList();
  }

  @override
  Future<List<TransferOption>> transferOptions(String enrollmentId) => _server.run(() {
    final member = _server.requireMember();
    final e = _server.db.enrollments.firstWhere((x) => x.id == enrollmentId);
    if (e.memberProfileId != member.id) throw const AppFailure.forbidden();
    return _targets(e);
  });

  @override
  Future<void> transferEnrollment(String enrollmentId, String targetSessionId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final e = db.enrollments.firstWhere((x) => x.id == enrollmentId);
    if (e.memberProfileId != member.id) throw const AppFailure.forbidden('Bạn chỉ đổi được chỗ của mình.');
    final block = _toMySession(e).cancelBlockReason;
    if (block != null) throw AppFailure.business(block);
    final target = _targets(e).where((t) => t.session.id == targetSessionId).firstOrNull;
    if (target == null) throw const AppFailure.business('Buổi đích không hợp lệ (phải cùng khóa, chưa diễn ra).');
    if (target.blockReason != null) throw AppFailure.conflict(target.blockReason!);
    final from = db.session(e.sessionId);
    e.sessionId = targetSessionId;
    final to = db.session(targetSessionId);
    db.notify(
      member.userId,
      NotificationType.scheduleUpdated,
      'Đã đổi buổi học',
      'Chuyển từ ${VnTime.sessionLabel(from.start, from.end)} sang ${VnTime.sessionLabel(to.start, to.end)}.',
      metadata: {'scheduleId': to.id, 'classId': to.classId},
    );
  });

  // ── Coach ──────────────────────────────────────────────────────────────

  @override
  Future<List<ClassSession>> teachingSessions(DateTime from, DateTime to, {String? classId}) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final myClasses = db.classes
        .where(
          (c) =>
              c.coachProfileId == coach.id && (c.status == ClassStatus.approved || c.status == ClassStatus.completed),
        )
        .map((c) => c.id)
        .toSet();
    return db.sessions
        .where((s) => myClasses.contains(s.classId) && (classId == null || s.classId == classId))
        .where((s) => !s.start.isBefore(from) && s.start.isBefore(to))
        .map(db.toSession)
        .toList()
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
  });

  @override
  Future<TeachingSession> teachingSession(String sessionId) => _server.run(() {
    final db = _server.db;
    final s = _server.requireOwnedSession(sessionId);
    final roster =
        db.enrollments
            .where(
              (e) =>
                  e.sessionId == s.id &&
                  (e.status != EnrollmentStatus.cancelled || s.status == ScheduleStatus.cancelled),
            )
            .map((e) {
              final mp = db.memberProfile(e.memberProfileId);
              final u = db.user(mp.userId);
              final att = db.attendance.where((a) => a.sessionId == s.id && a.memberProfileId == mp.id).firstOrNull;
              return RosterEntry(
                memberProfileId: mp.id,
                userId: u.id,
                fullName: u.fullName,
                avatarUrl: u.avatarUrl,
                enrollmentStatus: e.status,
                attendance: att?.status,
                note: att?.note,
              );
            })
            .toList()
          ..sort((a, b) => a.fullName.compareTo(b.fullName));
    final makeup = db.sessions.where((x) => x.makeupForId == s.id).firstOrNull;
    return TeachingSession(
      session: db.toSession(s),
      roster: roster,
      makeupSession: makeup == null ? null : db.toSession(makeup),
    );
  });

  @override
  Future<void> completeSession(String sessionId) => _server.run(() {
    final db = _server.db;
    final s = _server.requireOwnedSession(sessionId);
    if (s.status != ScheduleStatus.scheduled) throw const AppFailure.business('Buổi học đã đóng.');
    if (db.now().isBefore(s.end)) throw const AppFailure.business('Chỉ hoàn tất được sau giờ kết thúc buổi học.');
    s.status = ScheduleStatus.completed;
    for (final e in db.enrollments.where((e) => e.sessionId == s.id && e.status == EnrollmentStatus.booked)) {
      e.status = EnrollmentStatus.completed;
    }
    // Mọi buổi đã đóng ⇒ khóa kết thúc.
    final cls = db.classRow(s.classId);
    if (db.sessionsOf(cls.id).every((x) => x.status != ScheduleStatus.scheduled)) cls.status = ClassStatus.completed;
  });

  @override
  Future<CancelPreview> cancelPreview(String sessionId) => _server.run(() {
    final db = _server.db;
    final s = _server.requireOwnedSession(sessionId);
    final cls = db.classRow(s.classId);
    final mainCount = db.mainSessionsOf(cls.id).length;
    return CancelPreview(
      bookedCount: db.enrollments.where((e) => e.sessionId == s.id && e.status == EnrollmentStatus.booked).length,
      perSessionRefund: mainCount == 0 ? 0 : cls.price ~/ mainCount,
    );
  });

  @override
  Future<CancelSessionResult> cancelSession(String sessionId, CancelSessionInput input) => _server.run(() {
    final db = _server.db;
    final s = _server.requireOwnedSession(sessionId);
    final now = db.now();
    if (s.status != ScheduleStatus.scheduled) throw const AppFailure.business('Buổi học đã đóng, không thể hủy.');
    if (!now.isBefore(s.start)) throw const AppFailure.business('Không thể hủy buổi đã bắt đầu.');
    final cls = db.classRow(s.classId);
    final booked = db.enrollments.where((e) => e.sessionId == s.id && e.status == EnrollmentStatus.booked).toList();
    final reason = input.reason?.trim();
    if (booked.isNotEmpty && input.mode == null) {
      throw const AppFailure.business(
        'Buổi đã có học viên đặt chỗ — bắt buộc chọn dạy bù hoặc hoàn tiền.',
        code: 'RESOLUTION_REQUIRED',
      );
    }
    ClassSession? makeupSession;
    var refundCount = 0;
    if (input.mode == CancelResolutionMode.makeup) {
      makeupSession = scheduleMakeupSession(db, s, cls, booked, input, reason);
    } else if (input.mode == CancelResolutionMode.refund) {
      refundCount = refundCancelledSession(db, s, cls, booked, reason);
    }
    s
      ..status = ScheduleStatus.cancelled
      ..cancelReason = reason
      ..resolution = input.mode;
    return CancelSessionResult(affectedMembers: booked.length, makeupSession: makeupSession, refundCount: refundCount);
  });

  @override
  Future<void> saveAttendance(String sessionId, Map<String, AttendanceStatus> statuses, Map<String, String> notes) =>
      _server.run(() {
        final db = _server.db;
        final s = _server.requireOwnedSession(sessionId);
        if (s.status == ScheduleStatus.cancelled) throw const AppFailure.business('Buổi học đã bị hủy.');
        if (db.now().isBefore(s.start)) throw const AppFailure.business('Chỉ điểm danh được khi buổi học đã bắt đầu.');
        statuses.forEach((memberId, status) {
          final note = notes[memberId]?.trim();
          final existing = db.attendance.where((a) => a.sessionId == s.id && a.memberProfileId == memberId).firstOrNull;
          if (existing != null) {
            existing
              ..status = status
              ..note = note == null || note.isEmpty ? null : note;
          } else {
            db.attendance.add(
              AttendanceRow(
                id: db.nextId('att'),
                sessionId: s.id,
                memberProfileId: memberId,
                status: status,
                note: note == null || note.isEmpty ? null : note,
              ),
            );
          }
        });
      });
}
