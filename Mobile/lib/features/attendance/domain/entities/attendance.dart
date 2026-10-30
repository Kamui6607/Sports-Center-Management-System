/// Trạng thái điểm danh (`AttendanceStatus`).
enum AttendanceStatus { present, absent, late, excused }

/// Trạng thái phạt chuyên cần (`AttendancePenaltyStatus`).
/// `pending` = Quản lý đã xem trước nhưng chưa áp dụng (L13: Member chỉ xem).
enum PenaltyStatus { pending, applied, revoked, expired }

/// Bản ghi điểm danh của Member (`GET /attendance/my`).
class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.startTime,
    required this.endTime,
    required this.status,
    this.note,
  });

  final String id;
  final String sessionId;
  final String classId;
  final String className;
  final DateTime startTime;
  final DateTime endTime;
  final AttendanceStatus status;
  final String? note;
}

/// Thống kê chuyên cần theo khóa (`GET /attendance/my/summary`).
class ClassAttendanceStat {
  const ClassAttendanceStat({
    required this.classId,
    required this.className,
    required this.present,
    required this.late,
    required this.absent,
    required this.excused,
  });

  /// Ngưỡng cảnh báo chuyên cần (BE: `ATTENDANCE.WARN_THRESHOLD` = 80%).
  static const warningThreshold = 0.8;

  /// Mẫu tối thiểu để xét cảnh báo/phạt (BE: `ATTENDANCE.MIN_SAMPLE`); ít hơn thì luôn là bình thường.
  static const minSample = 5;

  /// BE chỉ xét số buổi đã kết thúc gần nhất này của mỗi khóa (`ATTENDANCE.SAMPLE_WINDOW`).
  static const sampleWindow = 10;

  final String classId;
  final String className;
  final int present;
  final int late;
  final int absent;
  final int excused;

  /// Số buổi được tính tỷ lệ: vắng có phép KHÔNG tính (giống BE), "không điểm danh" đã gộp vào vắng.
  int get counted => present + late + absent;

  /// Có mặt + đi trễ được tính là tham gia.
  double get rate => counted == 0 ? 1 : (present + late) / counted;

  bool get isWarning => counted >= minSample && rate < warningThreshold;
}

/// Phạt chuyên cần (`AttendancePenalty`).
class AttendancePenalty {
  const AttendancePenalty({
    required this.id,
    required this.classId,
    required this.className,
    required this.reason,
    required this.attendanceRate,
    required this.releasedCount,
    required this.status,
    required this.createdAt,
    this.blockedUntil,
    this.appealReason,
    this.appealedAt,
    this.appealDeadline,
    this.revokedReason,
  });

  final String id;
  final String classId;
  final String className;
  final String reason;
  final double attendanceRate;

  /// Số buổi tương lai bị thu hồi chỗ.
  final int releasedCount;
  final PenaltyStatus status;
  final DateTime createdAt;
  final DateTime? blockedUntil;
  final String? appealReason;
  final DateTime? appealedAt;

  /// Hạn khiếu nại (BE: 72 giờ).
  final DateTime? appealDeadline;
  final String? revokedReason;

  /// `attendanceRate` là tỷ lệ 0–1 (BE trả phần trăm, repository đã chia 100) ⇒ số phần trăm để hiển thị.
  int get ratePercent => (attendanceRate * 100).round();

  bool canAppeal(DateTime now) =>
      status == PenaltyStatus.applied && appealedAt == null && appealDeadline != null && now.isBefore(appealDeadline!);
}

/// Vé QR điểm danh do HLV mở (`POST /attendance/generate-qr`).
class QrTicket {
  const QrTicket({required this.sessionId, required this.qrToken, required this.manualCode, required this.expiresAt});

  /// Thời gian tự đổi mã QR (web: 55 giây).
  static const refreshEvery = Duration(seconds: 55);

  final String sessionId;
  final String qrToken;

  /// Mã dự phòng 6 ký tự (TTL 90s ở BE).
  final String manualCode;
  final DateTime expiresAt;
}

/// Kết quả Member check-in (`POST /attendance/scan-qr`).
class CheckInResult {
  const CheckInResult({
    required this.className,
    required this.startTime,
    required this.endTime,
    required this.status,
    required this.roomName,
  });

  final String className;
  final DateTime startTime;
  final DateTime endTime;
  final String roomName;
  final AttendanceStatus status;
}

/// Trạng thái một buổi trong bảng chuyên cần RIÊNG của một khóa.
enum CourseSessionMark { present, late, absent, excused, notMarked, upcoming, cancelled }

/// Một buổi của khóa (đã qua hoặc sắp tới) kèm kết quả điểm danh của học viên.
class CourseAttendanceSession {
  const CourseAttendanceSession({
    required this.scheduleId,
    required this.startTime,
    required this.endTime,
    required this.mark,
    this.roomName,
    this.isMakeup = false,
    this.note,
  });

  final String scheduleId;
  final DateTime startTime;
  final DateTime endTime;
  final CourseSessionMark mark;
  final String? roomName;
  final bool isMakeup;
  final String? note;
}

/// Chuyên cần của học viên trong MỘT khóa: có mặt / đi trễ / vắng / có phép / chưa điểm danh / sắp tới.
class CourseAttendance {
  const CourseAttendance(this.sessions);

  static const empty = CourseAttendance([]);

  /// Sắp theo thời gian tăng dần.
  final List<CourseAttendanceSession> sessions;

  int _count(CourseSessionMark m) => sessions.where((s) => s.mark == m).length;

  int get present => _count(CourseSessionMark.present);
  int get late => _count(CourseSessionMark.late);
  int get absent => _count(CourseSessionMark.absent);
  int get excused => _count(CourseSessionMark.excused);
  int get notMarked => _count(CourseSessionMark.notMarked);
  int get upcoming => _count(CourseSessionMark.upcoming);

  /// Có mặt + đi trễ được tính là tham gia.
  int get attended => present + late;

  /// Buổi đã qua được tính tỷ lệ (vắng có phép không tính — giống BE).
  int get counted => present + late + absent + notMarked;

  double get rate => counted == 0 ? 1 : attended / counted;

  /// Các buổi đã qua (không tính sắp tới / bị hủy), mới nhất trước, tối đa [ClassAttendanceStat.sampleWindow] buổi
  /// — đúng cửa sổ mà BE dùng để xét cảnh báo và phạt.
  List<CourseAttendanceSession> get recentPast {
    final past = [
      for (final s in sessions)
        if (s.mark != CourseSessionMark.upcoming && s.mark != CourseSessionMark.cancelled) s,
    ]..sort((a, b) => b.startTime.compareTo(a.startTime));
    return past.take(ClassAttendanceStat.sampleWindow).toList();
  }

  /// Cảnh báo giống BE: tính trên [recentPast] (bỏ vắng có phép), cần từ [ClassAttendanceStat.minSample] buổi
  /// và tỷ lệ dưới [ClassAttendanceStat.warningThreshold].
  bool get isWarning {
    final recent = recentPast.where((s) => s.mark != CourseSessionMark.excused).toList();
    if (recent.length < ClassAttendanceStat.minSample) return false;
    final attended = recent.where((s) => s.mark == CourseSessionMark.present || s.mark == CourseSessionMark.late).length;
    return attended / recent.length < ClassAttendanceStat.warningThreshold;
  }
}
