import '../../../api/class_json.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../domain/entities/session.dart';
import '../domain/repositories/schedule_repository.dart';

/// [ScheduleRepository] gọi BE thật — `class-schedules`, `enrollments`, `attendance`.
class ScheduleApiRepository implements ScheduleRepository {
  ScheduleApiRepository(this._api, {DateTime Function()? clock}) : _now = clock ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;

  static String _iso(DateTime d) => d.toUtc().toIso8601String();

  // ── Member ─────────────────────────────────────────────────────────────

  /// Chỗ đã giữ ⇒ [MySession] (lý do chặn hủy/đổi buổi tính như mock; BE kiểm tra lại khi gửi).
  MySession _toMySession(Json e, Map<String, AttendanceStatus> attendance) {
    final s = e.obj('schedule');
    // BE-14: `schedule.class` kèm `coach.user` ⇒ không phải tra thêm khóa học.
    final session = ClassJson.session(s);
    final status = e.enumOr('status', EnrollmentStatus.values, EnrollmentStatus.booked);
    String? block;
    if (session.status == ScheduleStatus.cancelled) {
      block = 'Buổi học đã bị hủy.';
    } else if (status != EnrollmentStatus.booked) {
      block = 'Chỉ thao tác được với buổi đang giữ chỗ.';
    } else if (session.hasStarted(_now())) {
      block = 'Buổi học đã bắt đầu hoặc đã kết thúc.';
    }
    return MySession(
      session: session,
      enrollmentId: e.str('id'),
      enrollmentStatus: status,
      attendance: attendance[session.id],
      cancelBlockReason: block,
      transferBlockReason: block,
    );
  }

  Future<Map<String, AttendanceStatus>> _myAttendance() async {
    final rows = await _api.getAll('/attendance/my');
    return {
      for (final a in rows)
        a.str('scheduleId', a.obj('schedule').str('id')): ?parseBeEnum(a.strOrNull('status'), AttendanceStatus.values),
    };
  }

  /// Ẩn chỗ đã hủy, trừ buổi bị HLV hủy mà không có buổi bù (hoàn tiền / hủy thẳng).
  static List<Json> _visible(List<Json> enrollments) {
    final hasMakeup = {for (final e in enrollments) ?e.obj('schedule').strOrNull('makeupForId')};
    return enrollments.where((e) {
      if (e.str('status') != 'CANCELLED') return true;
      final s = e.obj('schedule');
      return s.str('status') == 'CANCELLED' && !hasMakeup.contains(s.str('id'));
    }).toList();
  }

  @override
  Future<List<MySession>> mySessions(DateTime from, DateTime to) async {
    // BE-14: lọc theo khoảng thời gian ở BE.
    final results = await Future.wait([
      _api.getAll('/enrollments/my', query: {'from': _iso(from), 'to': _iso(to)}),
      _myAttendance(),
    ]);
    final enrollments = _visible(results[0] as List<Json>).where((e) {
      final start = e.obj('schedule').date('startTime');
      return !start.isBefore(from) && start.isBefore(to);
    });
    final attendance = results[1] as Map<String, AttendanceStatus>;
    return enrollments.map((e) => _toMySession(e, attendance)).toList()
      ..sort((a, b) => a.session.startTime.compareTo(b.session.startTime));
  }

  @override
  Future<MySession> mySession(String sessionId) async {
    final results = await Future.wait([_api.getAll('/enrollments/my'), _myAttendance()]);
    final all = results[0] as List<Json>;
    var e = all.where((x) => x.obj('schedule').str('id') == sessionId).firstOrNull;
    // Buổi bị hủy có dạy bù: chỗ đã chuyển sang buổi bù.
    final makeup = all.where((x) => x.obj('schedule').strOrNull('makeupForId') == sessionId).firstOrNull;
    if (makeup != null && (e == null || e.str('status') == 'CANCELLED')) e = makeup;
    if (e == null) throw const AppFailure.notFound('Bạn không có chỗ trong buổi học này.');

    var mine = _toMySession(e, results[1] as Map<String, AttendanceStatus>);
    if (mine.canTransfer) {
      final targets = await _targets(e, all);
      if (targets.every((t) => t.blockReason != null)) {
        mine = _copy(mine, transferBlockReason: 'Không còn buổi nào khác của khóa còn chỗ để đổi.');
      }
    }
    if (mine.session.status == ScheduleStatus.cancelled) {
      final refunds = await _api.getAll('/refunds/my', query: {'reason': 'SESSION_CANCELLED'});
      final refund = refunds.where((r) => r.str('scheduleId') == mine.session.id).firstOrNull;
      if (refund != null) mine = _copy(mine, refundId: refund.str('id'));
    }
    return mine;
  }

  static MySession _copy(MySession m, {String? transferBlockReason, String? refundId}) => MySession(
    session: m.session,
    enrollmentId: m.enrollmentId,
    enrollmentStatus: m.enrollmentStatus,
    attendance: m.attendance,
    cancelBlockReason: m.cancelBlockReason,
    transferBlockReason: transferBlockReason ?? m.transferBlockReason,
    refundId: refundId ?? m.refundId,
  );

  @override
  Future<void> cancelEnrollment(String enrollmentId) => _api.delete('/enrollments/$enrollmentId');

  /// Buổi có thể đổi sang: cùng khóa, `SCHEDULED`, chưa bắt đầu (lý do chặn tính như mock;
  /// BE kiểm tra lại toàn bộ khi gửi).
  Future<List<TransferOption>> _targets(Json enrollment, List<Json> myEnrollments) async {
    final current = enrollment.obj('schedule');
    final now = _now();
    final rows = await _api.getAll(
      '/class-schedules',
      query: {'classId': current.str('classId'), 'status': 'SCHEDULED', 'from': _iso(now)},
    );
    final booked = myEnrollments
        .where((e) => e.str('status') == 'BOOKED')
        .map((e) => e.obj('schedule'))
        .where((s) => s.str('status') == 'SCHEDULED')
        .toList();
    final sessions = ClassJson.sessions(rows, classes: {current.str('classId'): current.obj('class')});
    return [
      for (final s in sessions)
        if (s.id != current.str('id') && s.startTime.isAfter(now))
          TransferOption(
            session: s,
            blockReason: () {
              if (booked.any((m) => m.str('id') == s.id)) return 'Bạn đã giữ chỗ buổi này';
              if (s.bookedCount >= s.capacity) return 'Hết chỗ';
              final clash = booked
                  .where(
                    (m) =>
                        m.str('id') != current.str('id') &&
                        m.date('startTime').isBefore(s.endTime) &&
                        s.startTime.isBefore(m.date('endTime')),
                  )
                  .firstOrNull;
              return clash == null ? null : 'Trùng giờ với "${clash.obj('class').str('name')}"';
            }(),
          ),
    ];
  }

  @override
  Future<List<TransferOption>> transferOptions(String enrollmentId) async {
    final all = await _api.getAll('/enrollments/my');
    final e = all.where((x) => x.str('id') == enrollmentId).firstOrNull;
    if (e == null) throw const AppFailure.notFound('Không tìm thấy chỗ đã giữ.');
    return _targets(e, all);
  }

  @override
  Future<void> transferEnrollment(String enrollmentId, String targetSessionId) =>
      _api.post('/enrollments/$enrollmentId/transfer', body: {'targetScheduleId': targetSessionId});

  // ── Coach ──────────────────────────────────────────────────────────────

  @override
  Future<List<ClassSession>> teachingSessions(DateTime from, DateTime to, {String? classId}) async {
    final results = await Future.wait([
      _api.getAll('/classes', query: {'createdByMe': 'true'}),
      // BE-15: chỉ buổi các khóa tôi phụ trách.
      _api.getAll('/class-schedules', query: {'mine': 'true', 'classId': classId, 'from': _iso(from), 'to': _iso(to)}),
    ]);
    final classes = {for (final c in results[0]) c.str('id'): c};
    final teachable = {
      for (final c in classes.values)
        if (const {'APPROVED', 'COMPLETED'}.contains(c.str('status'))) c.str('id'),
    };
    final rows = results[1].where((r) => teachable.contains(r.str('classId'))).toList();
    return ClassJson.sessions(
        rows,
        classes: classes,
      ).where((s) => !s.startTime.isBefore(from) && s.startTime.isBefore(to)).toList()
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
  }

  @override
  Future<TeachingSession> teachingSession(String sessionId) async {
    final results = await Future.wait([
      _api.get('/class-schedules/$sessionId'),
      _api.getAll('/enrollments/schedule/$sessionId'),
      _api.get('/attendance', query: {'scheduleId': sessionId}),
    ]);
    final s = (results[0] as ApiResponse).json;
    final enrollments = results[1] as List<Json>;
    final attendance = {for (final a in (results[2] as ApiResponse).list) a.str('memberId'): a};
    final cls = s.obj('class');
    final siblings = await _api.getAll('/class-schedules', query: {'classId': s.str('classId')});
    final makeupRow = siblings.where((x) => x.strOrNull('makeupForId') == sessionId).firstOrNull;
    final session = ClassJson.session(s, classJson: cls, makeupSessionId: makeupRow?.str('id'));
    final cancelled = session.status == ScheduleStatus.cancelled;
    final roster = [
      for (final e in enrollments)
        if (e.str('status') != 'CANCELLED' || cancelled)
          RosterEntry(
            memberProfileId: e.str('memberId'),
            userId: e.obj('member').str('userId'),
            fullName: e.obj('member').obj('user').str('fullName', 'Học viên'),
            enrollmentStatus: e.enumOr('status', EnrollmentStatus.values, EnrollmentStatus.booked),
            attendance: attendance[e.str('memberId')]?.enumOrNull('status', AttendanceStatus.values),
            note: attendance[e.str('memberId')]?.strOrNull('note'),
          ),
    ]..sort((a, b) => a.fullName.compareTo(b.fullName));
    return TeachingSession(
      session: session,
      roster: roster,
      makeupSession: makeupRow == null ? null : ClassJson.session(makeupRow, classJson: cls),
    );
  }

  @override
  Future<void> completeSession(String sessionId) => _api.patch('/class-schedules/$sessionId/complete');

  @override
  Future<CancelPreview> cancelPreview(String sessionId) async {
    final s = (await _api.get('/class-schedules/$sessionId')).json;
    final results = await Future.wait([
      _api.getAll('/enrollments/schedule/$sessionId', query: {'status': 'BOOKED'}),
      _api.get('/classes/${s.str('classId')}'),
    ]);
    final booked = results[0] as List<Json>;
    final course = ClassJson.course((results[1] as ApiResponse).json);
    return CancelPreview(
      bookedCount: booked.length,
      // Chỉ để tham khảo — BE tính chính thức (đã trả ÷ số buổi chính, tối đa phần còn hoàn được).
      perSessionRefund: course.mainSessionCount == 0 ? 0 : course.price ~/ course.mainSessionCount,
    );
  }

  @override
  Future<CancelSessionResult> cancelSession(String sessionId, CancelSessionInput input) async {
    final booked = await _api.getAll('/enrollments/schedule/$sessionId', query: {'status': 'BOOKED'});
    final reason = input.reason?.trim();
    final res = await _api.post(
      '/class-schedules/$sessionId/cancel',
      body: {
        if (reason != null && reason.isNotEmpty) 'reason': reason,
        if (input.mode == CancelResolutionMode.makeup)
          'resolution': {
            'mode': 'MAKEUP',
            'startTime': input.makeupStart!.toUtc().toIso8601String(),
            'endTime': input.makeupEnd!.toUtc().toIso8601String(),
            'roomId': ?input.makeupRoomId,
          }
        else if (input.mode == CancelResolutionMode.refund)
          'resolution': {'mode': 'REFUND'},
      },
    );
    final data = res.json;
    final makeup = data.objOrNull('makeup');
    return CancelSessionResult(
      affectedMembers: booked.length,
      makeupSession: makeup == null ? null : ClassJson.session(makeup, classJson: data.obj('schedule').obj('class')),
      refundCount: data.objList('refunds').length,
    );
  }

  @override
  Future<void> saveAttendance(
    String sessionId,
    Map<String, AttendanceStatus> statuses,
    Map<String, String> notes,
  ) async {
    // BE-18: ghi cả danh sách trong MỘT giao dịch. L5: HLV phụ trách được ghi "Vắng có phép".
    await _api.put(
      '/attendance/schedule/$sessionId',
      body: {
        'items': [
          for (final e in statuses.entries)
            {
              'memberId': e.key,
              'status': beName(e.value),
              if (notes[e.key]?.trim().isNotEmpty ?? false) 'note': notes[e.key]!.trim(),
            },
        ],
      },
    );
  }
}
