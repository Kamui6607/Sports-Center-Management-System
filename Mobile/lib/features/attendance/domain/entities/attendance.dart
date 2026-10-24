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

  /// Ngưỡng cảnh báo chuyên cần (BE: `ATTENDANCE_WARNING` dưới 80%).
  static const warningThreshold = 0.8;

  final String classId;
  final String className;
  final int present;
  final int late;
  final int absent;
  final int excused;

  int get total => present + late + absent + excused;

  /// Có mặt + đi trễ được tính là tham gia.
  double get rate => total == 0 ? 1 : (present + late) / total;

  bool get isWarning => total > 0 && rate < warningThreshold;
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
