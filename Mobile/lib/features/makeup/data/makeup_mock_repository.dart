import '../../../core/error/app_failure.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../classes/domain/entities/course.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../../schedule/data/absence_mock_rules.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/makeup.dart';
import '../domain/repositories/makeup_repository.dart';

/// BE `MAKEUP.*` (mock).
const _expireAfterCourse = Duration(days: 14);
const _assignLead = Duration(minutes: 30);
const _slotLead = Duration(hours: 2);

/// Tạo yêu cầu học bù cho chỗ [e] (đã báo vắng) — như BE `createMakeupRequestTx`.
MakeupRequestRow createMockMakeupRequest(MockDatabase db, EnrollmentRow e, String reason) {
  final s = db.session(e.sessionId);
  final active = db.makeupRequests.any(
    (r) => r.missedEnrollmentId == e.id && (r.status == MakeupStatus.pending || r.status == MakeupStatus.scheduled),
  );
  if (active) throw const AppFailure.conflict('Buổi này đã có yêu cầu học bù.', code: 'MAKEUP_ALREADY_REQUESTED');
  final cls = db.classRow(s.classId);
  final courseEnd = db.mainSessionsOf(cls.id).map((x) => x.end).fold(s.end, (a, b) => b.isAfter(a) ? b : a);
  final now = db.now();
  final row = MakeupRequestRow(
    id: db.nextId('mkr'),
    memberProfileId: e.memberProfileId,
    missedEnrollmentId: e.id,
    missedSessionId: s.id,
    paidClassId: cls.id,
    coachProfileId: cls.coachProfileId,
    reason: reason,
    requestedAt: now,
    expiresAt: courseEnd.add(_expireAfterCourse),
    refundEligible: s.start.difference(now) >= const Duration(hours: 24),
  );
  db.makeupRequests.add(row);
  db.notify(
    db.userOfCoach(cls.coachProfileId).id,
    NotificationType.makeupRequested,
    'Xin học bù: ${cls.name}',
    '${db.user(db.memberProfile(e.memberProfileId).userId).fullName} báo vắng buổi '
        '${VnTime.sessionLabel(s.start, s.end)} và xin một buổi học bù.',
    metadata: {'makeupRequestId': row.id},
  );
  return row;
}

/// Chỗ ở buổi vắng sắp bị hủy / đổi / hủy báo vắng — như BE `releaseMakeupForMissedTx`.
void releaseMockMakeup(MockDatabase db, String memberProfileId, String sessionId) {
  final active = db.makeupRequests.where(
    (r) =>
        r.memberProfileId == memberProfileId &&
        r.missedSessionId == sessionId &&
        (r.status == MakeupStatus.pending || r.status == MakeupStatus.scheduled),
  );
  if (active.any((r) => r.status == MakeupStatus.scheduled)) {
    throw const AppFailure.conflict(
      'Buổi này đã được xếp học bù — hủy buổi học bù trước.',
      code: 'MAKEUP_ALREADY_SCHEDULED',
    );
  }
  for (final r in active) {
    r.status = MakeupStatus.cancelled;
  }
}

/// Yêu cầu đang hoạt động (hoặc bị từ chối / hết hạn gần nhất) của chỗ [enrollmentId].
MakeupRequestRow? mockRequestOfEnrollment(MockDatabase db, String enrollmentId) {
  final rows = db.makeupRequests.where((r) => r.missedEnrollmentId == enrollmentId).toList()
    ..sort((a, b) => b.requestedAt.compareTo(a.requestedAt));
  return rows.where((r) => r.status == MakeupStatus.pending || r.status == MakeupStatus.scheduled).firstOrNull ??
      rows.where((r) => r.status == MakeupStatus.rejected || r.status == MakeupStatus.expired).firstOrNull;
}

MakeupSession mockMakeupSession(MockDatabase db, SessionRow s) => MakeupSession(
  id: s.id,
  classId: s.classId,
  className: db.classRow(s.classId).name,
  startTime: s.start,
  endTime: s.end,
  roomName: db.room(s.roomId).name,
  isMakeupSlot: s.isMakeupSlot,
);

MakeupRequest mockMakeupRequest(MockDatabase db, MakeupRequestRow r) {
  final member = db.memberProfile(r.memberProfileId);
  final user = db.user(member.userId);
  return MakeupRequest(
    id: r.id,
    status: r.status,
    reason: r.reason,
    requestedAt: r.requestedAt,
    expiresAt: r.expiresAt,
    memberProfileId: member.id,
    memberName: user.fullName,
    memberAvatarUrl: user.avatarUrl,
    paidClassId: r.paidClassId,
    missedEnrollmentId: r.missedEnrollmentId,
    missed: mockMakeupSession(db, db.session(r.missedSessionId)),
    target: r.targetSessionId == null ? null : mockMakeupSession(db, db.session(r.targetSessionId!)),
    rejectReason: r.rejectReason,
    refundEligible: r.refundEligible,
  );
}

/// Mock theo `BE/src/modules/makeup-requests`.
class MakeupMockRepository implements MakeupRepository {
  MakeupMockRepository(this._server);

  final MockServer _server;

  MakeupRequestRow _row(String id) {
    final r = _server.db.makeupRequests.where((x) => x.id == id).firstOrNull;
    if (r == null) throw const AppFailure.notFound('Không tìm thấy yêu cầu học bù.');
    return r;
  }

  /// Học viên chủ yêu cầu ⇒ `true`; HLV phụ trách ⇒ `false`; còn lại ⇒ 403.
  bool _authorize(MakeupRequestRow r) {
    final me = _server.requireUser();
    final db = _server.db;
    if (me.role == UserRole.member && db.memberOfUser(me.id)?.id == r.memberProfileId) return true;
    if (me.role == UserRole.coach && db.coachOfUser(me.id)?.id == r.coachProfileId) return false;
    throw const AppFailure.forbidden('Bạn không phụ trách yêu cầu này.');
  }

  @override
  Future<List<MakeupRequest>> myRequests() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final rows = db.makeupRequests.where((r) => r.memberProfileId == member.id).toList()
      ..sort((a, b) => b.requestedAt.compareTo(a.requestedAt));
    return [for (final r in rows) mockMakeupRequest(db, r)];
  });

  @override
  Future<MakeupRequest> requestForAbsence(String enrollmentId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final e = db.enrollments.where((x) => x.id == enrollmentId && x.memberProfileId == member.id).firstOrNull;
    if (e == null) throw const AppFailure.notFound('Không tìm thấy chỗ đã giữ.');
    final att = db.attendance.where((a) => a.sessionId == e.sessionId && a.memberProfileId == member.id).firstOrNull;
    final reason = memberAbsenceReason(att);
    if (reason == null) {
      throw const AppFailure.business('Hãy báo vắng buổi này trước khi xin học bù.', code: 'ABSENCE_REQUIRED');
    }
    return mockMakeupRequest(db, createMockMakeupRequest(db, e, reason));
  });

  @override
  Future<void> cancel(String requestId) => _server.run(() {
    final r = _row(requestId);
    if (!_authorize(r)) throw const AppFailure.forbidden();
    if (r.status != MakeupStatus.pending) throw const AppFailure.conflict('Chỉ rút được yêu cầu đang chờ xử lý.');
    r.status = MakeupStatus.cancelled;
  });

  @override
  Future<List<MakeupRequest>> coachRequests({MakeupStatus? status}) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final rows =
        db.makeupRequests.where((r) => r.coachProfileId == coach.id && (status == null || r.status == status)).toList()
          ..sort((a, b) => a.requestedAt.compareTo(b.requestedAt));
    return [for (final r in rows) mockMakeupRequest(db, r)];
  });

  List<MakeupOption> _options(MakeupRequestRow r, {required bool forMember}) {
    final db = _server.db;
    final now = db.now();
    final paid = db.classRow(r.paidClassId);
    final mine = db.enrollments
        .where(
          (e) =>
              e.memberProfileId == r.memberProfileId &&
              e.status != EnrollmentStatus.cancelled &&
              e.id != r.missedEnrollmentId,
        )
        .map((e) => db.session(e.sessionId))
        .toList();
    return db.sessions
        .where((s) {
          if (s.status != ScheduleStatus.scheduled || s.id == r.missedSessionId) return false;
          if (!s.start.isAfter(now.add(_assignLead))) return false;
          if (mine.any((m) => m.id == s.id)) return false;
          if (forMember) return s.classId == paid.id && s.isMakeupSlot;
          final cls = db.classRow(s.classId);
          return s.classId == paid.id ||
              (cls.coachProfileId == paid.coachProfileId &&
                  cls.classType == paid.classType &&
                  cls.status == ClassStatus.approved);
        })
        .map((s) {
          final cls = db.classRow(s.classId);
          final capacity = s.isMakeupSlot ? (s.slotCapacity ?? cls.capacity) : cls.capacity;
          final booked = db.bookedCount(s.id);
          final cross = s.classId != paid.id;
          final guests = db.enrollments
              .where((e) => e.sessionId == s.id && e.makeupRequestId != null && e.status != EnrollmentStatus.cancelled)
              .length;
          final guestFull = cross && !s.isMakeupSlot && guests >= (capacity ~/ 10).clamp(1, capacity);
          final clash = mine.where((m) => m.start.isBefore(s.end) && s.start.isBefore(m.end)).firstOrNull;
          return MakeupOption(
            session: mockMakeupSession(db, s),
            capacity: capacity,
            bookedCount: booked,
            isSameClass: !cross,
            isFull: booked >= capacity,
            guestSeatsFull: guestFull,
            conflictWith: clash == null ? null : db.classRow(clash.classId).name,
            canSelect: r.status == MakeupStatus.pending && booked < capacity && !guestFull && clash == null,
          );
        })
        .toList()
      ..sort((a, b) => a.session.startTime.compareTo(b.session.startTime));
  }

  @override
  Future<({MakeupRequest request, List<MakeupOption> options})> options(String requestId) => _server.run(() {
    final r = _row(requestId);
    final forMember = _authorize(r);
    return (request: mockMakeupRequest(_server.db, r), options: _options(r, forMember: forMember));
  });

  void _assign(MakeupRequestRow r, String sessionId, {required bool byMember}) {
    final db = _server.db;
    if (r.status != MakeupStatus.pending) throw const AppFailure.conflict('Yêu cầu không còn chờ xử lý.');
    final option = _options(r, forMember: byMember).where((o) => o.session.id == sessionId).firstOrNull;
    if (option == null) {
      throw const AppFailure.business('Buổi này không xếp học bù được.', code: 'MAKEUP_TARGET_NOT_ELIGIBLE');
    }
    if (option.blockReason != null) throw AppFailure.conflict(option.blockReason!);
    db.enrollments.add(
      EnrollmentRow(
        id: db.nextId('enr'),
        memberProfileId: r.memberProfileId,
        sessionId: sessionId,
        bookedAt: db.now(),
        makeupRequestId: r.id,
      ),
    );
    r
      ..status = MakeupStatus.scheduled
      ..targetSessionId = sessionId;
    final s = db.session(sessionId);
    db.notify(
      byMember ? db.userOfCoach(r.coachProfileId).id : db.memberProfile(r.memberProfileId).userId,
      NotificationType.makeupScheduled,
      byMember ? 'Học viên chọn buổi học bù' : 'Đã xếp buổi học bù: ${db.classRow(s.classId).name}',
      'Buổi học bù ${VnTime.sessionLabel(s.start, s.end)}.',
      metadata: {'makeupRequestId': r.id, 'scheduleId': s.id},
    );
  }

  @override
  Future<void> assign(String requestId, String sessionId) => _server.run(() {
    final r = _row(requestId);
    _assign(r, sessionId, byMember: _authorize(r));
  });

  @override
  Future<void> reject(String requestId, String reason) => _server.run(() {
    final db = _server.db;
    final r = _row(requestId);
    if (_authorize(r)) throw const AppFailure.forbidden();
    if (r.status != MakeupStatus.pending) throw const AppFailure.conflict('Yêu cầu không còn chờ xử lý.');
    r
      ..status = MakeupStatus.rejected
      ..rejectReason = reason.trim();
    db.notify(
      db.memberProfile(r.memberProfileId).userId,
      NotificationType.makeupRejected,
      'HLV chưa xếp được buổi học bù',
      'Lý do: ${reason.trim()}.${r.refundEligible ? ' Bạn được hoàn 80% tiền buổi (chờ Quản lý duyệt).' : ''}',
      metadata: {'makeupRequestId': r.id},
    );
  });

  @override
  Future<OpenMakeupSlotResult> openSlot(OpenMakeupSlotInput input) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final cls = db.classes.where((c) => c.id == input.classId).firstOrNull;
    if (cls == null || cls.coachProfileId != coach.id) throw const AppFailure.forbidden();
    if (!input.end.isAfter(input.start)) throw const AppFailure.validation('Giờ buổi bù không hợp lệ.');
    if (input.start.isBefore(db.now().add(_slotLead))) {
      throw const AppFailure.validation('Buổi bù phải cách hiện tại ít nhất 2 giờ.');
    }
    final capacity = input.capacity ?? cls.capacity;
    if (capacity < 1 || capacity > cls.capacity) {
      throw AppFailure.validation('Sức chứa buổi bù từ 1 đến ${cls.capacity}.');
    }
    final roomId = input.roomId ?? db.sessionsOf(cls.id).last.roomId;
    final clash = db.sessions.where(
      (s) =>
          s.status == ScheduleStatus.scheduled &&
          s.start.isBefore(input.end) &&
          input.start.isBefore(s.end) &&
          (s.roomId == roomId || db.classRow(s.classId).coachProfileId == coach.id),
    );
    if (clash.isNotEmpty) throw const AppFailure.conflict('Trùng phòng hoặc trùng lịch dạy.', code: 'ROOM_CONFLICT');
    final slot = SessionRow(
      id: db.nextId('slot'),
      classId: cls.id,
      roomId: roomId,
      start: input.start,
      end: input.end,
      isMakeupSlot: true,
      slotCapacity: capacity,
    );
    db.sessions.add(slot);
    var assigned = 0;
    var failed = 0;
    for (final id in input.assignRequestIds.toSet()) {
      try {
        _assign(_row(id), slot.id, byMember: false);
        assigned++;
      } on AppFailure {
        failed++;
      }
    }
    for (final w in db.makeupRequests.where((r) => r.paidClassId == cls.id && r.status == MakeupStatus.pending)) {
      db.notify(
        db.memberProfile(w.memberProfileId).userId,
        NotificationType.makeupSlotOpened,
        'HLV mở buổi bù: ${cls.name}',
        'Có buổi bù ${VnTime.sessionLabel(slot.start, slot.end)}. Mở yêu cầu học bù để chọn buổi này.',
        metadata: {'makeupRequestId': w.id, 'scheduleId': slot.id},
      );
    }
    return OpenMakeupSlotResult(slot: mockMakeupSession(db, slot), assignedCount: assigned, failedCount: failed);
  });
}
