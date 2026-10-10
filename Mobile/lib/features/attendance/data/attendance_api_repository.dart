import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/attendance.dart';
import '../domain/repositories/attendance_repository.dart';

/// [AttendanceRepository] gọi BE thật — module `attendance`.
class AttendanceApiRepository implements AttendanceRepository {
  AttendanceApiRepository(this._api, {DateTime Function()? clock}) : _now = clock ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;

  /// BE chỉ trả bản ghi điểm danh ⇒ tra buổi học (`GET /class-schedules/:id`) để hiện tên khóa, phòng.
  Future<CheckInResult> _checkIn(Map<String, Object?> body) async {
    final record = (await _api.post('/attendance/scan-qr', body: body)).json;
    final s = (await _api.get('/class-schedules/${record.str('scheduleId')}')).json;
    return CheckInResult(
      className: s.obj('class').str('name'),
      startTime: s.date('startTime'),
      endTime: s.date('endTime'),
      roomName: s.obj('room').str('name'),
      status: record.enumOr('status', AttendanceStatus.values, AttendanceStatus.present),
    );
  }

  @override
  Future<CheckInResult> scanQr(String qrToken) => _checkIn({'qrToken': qrToken});

  @override
  Future<CheckInResult> submitCode(String code) => _checkIn({'code': code.trim().toUpperCase()});

  @override
  Future<List<AttendanceRecord>> myRecords() async {
    final rows = await _api.getAll('/attendance/my');
    return [
      for (final a in rows)
        AttendanceRecord(
          id: a.str('id'),
          sessionId: a.str('scheduleId', a.obj('schedule').str('id')),
          classId: a.obj('schedule').obj('class').str('id'),
          className: a.obj('schedule').obj('class').str('name'),
          startTime: a.obj('schedule').date('startTime'),
          endTime: a.obj('schedule').date('endTime'),
          status: a.enumOr('status', AttendanceStatus.values, AttendanceStatus.present),
          note: a.strOrNull('note'),
        ),
    ];
  }

  Future<Json> _summary() async => (await _api.get('/attendance/my/summary')).json;

  @override
  Future<List<ClassAttendanceStat>> mySummary() async => [
    // BE tính trên cửa sổ các buổi gần nhất; "không điểm danh" (noShow) gộp vào vắng.
    for (final b in (await _summary()).objList('buckets'))
      ClassAttendanceStat(
        classId: b.str('classId'),
        className: b.str('className'),
        present: b.integer('presentCount'),
        late: b.integer('lateCount'),
        absent: b.integer('absentCount') + b.integer('noShowCount'),
        excused: b.integer('excusedCount'),
      ),
  ];

  @override
  Future<List<AttendancePenalty>> myPenalties() async => [
    // Phạt nằm trong `GET /attendance/my/summary`; L13: gồm cả phạt PENDING (chỉ xem).
    for (final p in (await _summary()).objList('penalties'))
      if (p.enumOrNull('status', PenaltyStatus.values) case final status?)
        AttendancePenalty(
          id: p.str('id'),
          classId: p.str('classId'),
          className: p.str('className'),
          reason: p.str('reason'),
          attendanceRate: p.dbl('attendanceRate') / 100,
          releasedCount: p.integer('releasedCount'),
          status: status,
          createdAt: p.dateOrNull('decidedAt') ?? p.date('appealDeadline').subtract(const Duration(hours: 72)),
          blockedUntil: p.dateOrNull('blockedUntil'),
          appealReason: p.strOrNull('appealReason'),
          appealedAt: p.dateOrNull('appealedAt'),
          appealDeadline: p.dateOrNull('appealDeadline'),
        ),
  ];

  @override
  Future<void> appeal(String penaltyId, String reason) =>
      _api.post('/attendance/penalties/$penaltyId/appeal', body: {'reason': reason.trim()});

  @override
  Future<QrTicket> generateQr(String sessionId) async {
    final j = (await _api.post('/attendance/generate-qr', body: {'scheduleId': sessionId})).json;
    return QrTicket(
      sessionId: sessionId,
      qrToken: j.str('qrToken'),
      manualCode: j.str('manualCode'),
      expiresAt: _now().add(Duration(seconds: j.integer('expiresIn', 600))),
    );
  }

  @override
  Future<void> stopQr(String sessionId) async {
    // BE-18: thu hồi mã dự phòng còn hiệu lực (QR JWT tự hết hạn theo TTL ở BE).
    try {
      await _api.delete('/attendance/qr/$sessionId');
    } on AppFailure {
      // Rời màn hình — không chặn người dùng nếu thu hồi lỗi (mã vẫn tự hết hạn sau 90 giây).
    }
  }

  @override
  Future<int> checkedInCount(String sessionId) async {
    try {
      final rows = (await _api.get('/attendance', query: {'scheduleId': sessionId})).list;
      return rows.where((a) => const {'PRESENT', 'LATE'}.contains(a.str('status'))).length;
    } on AppFailure {
      return 0; // Đếm phụ trợ trên màn QR — không chặn màn hình.
    }
  }
}
