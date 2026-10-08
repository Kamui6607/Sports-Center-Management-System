import '../entities/attendance.dart';

/// Điểm danh & chuyên cần — module `attendance`.
abstract interface class AttendanceRepository {
  /// Member quét QR (`POST /attendance/scan-qr` với `qrToken`).
  Future<CheckInResult> scanQr(String qrToken);

  /// Member nhập mã dự phòng (`POST /attendance/scan-qr` với `code`).
  Future<CheckInResult> submitCode(String code);

  /// `GET /attendance/my`.
  Future<List<AttendanceRecord>> myRecords();

  /// `GET /attendance/my/summary`.
  Future<List<ClassAttendanceStat>> mySummary();

  /// Phạt chuyên cần của tôi (TODO BE: endpoint đọc phạt cho Member).
  Future<List<AttendancePenalty>> myPenalties();

  /// `POST /attendance/penalties/:id/appeal`.
  Future<void> appeal(String penaltyId, String reason);

  /// HLV mở QR (`POST /attendance/generate-qr`). Gọi lại để đổi mã.
  Future<QrTicket> generateQr(String sessionId);

  /// HLV dừng mã QR khi rời màn hình.
  Future<void> stopQr(String sessionId);

  /// Số học viên đã check-in của buổi (`GET /attendance?scheduleId=`).
  Future<int> checkedInCount(String sessionId);
}
