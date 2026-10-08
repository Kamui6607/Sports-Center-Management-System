import '../../../attendance/domain/entities/attendance.dart';
import '../entities/session.dart';

/// Lịch học / lịch dạy — module `class-schedules` + `enrollments`.
abstract interface class ScheduleRepository {
  /// Buổi Member đã giữ chỗ trong khoảng thời gian (`GET /enrollments/my`).
  Future<List<MySession>> mySessions(DateTime from, DateTime to);

  /// Chi tiết một buổi của Member.
  Future<MySession> mySession(String sessionId);

  /// `DELETE /enrollments/:id` — chỉ `BOOKED`, buổi chưa bắt đầu.
  Future<void> cancelEnrollment(String enrollmentId);

  /// Buổi có thể đổi sang (cùng khóa, `SCHEDULED`, chưa bắt đầu).
  Future<List<TransferOption>> transferOptions(String enrollmentId);

  /// `POST /enrollments/:id/transfer`.
  Future<void> transferEnrollment(String enrollmentId, String targetSessionId);

  /// Buổi dạy của HLV (`GET /class-schedules`).
  Future<List<ClassSession>> teachingSessions(DateTime from, DateTime to, {String? classId});

  /// Chi tiết buổi dạy + danh sách học viên (`GET /enrollments/schedule/:id`, `GET /attendance`).
  Future<TeachingSession> teachingSession(String sessionId);

  /// `PATCH /class-schedules/:id/complete` — chỉ sau giờ kết thúc.
  Future<void> completeSession(String sessionId);

  Future<CancelPreview> cancelPreview(String sessionId);

  /// `POST /class-schedules/:id/cancel` với `resolution` MAKEUP / REFUND.
  Future<CancelSessionResult> cancelSession(String sessionId, CancelSessionInput input);

  /// `POST /attendance` / `PATCH /attendance/:id` cho cả danh sách.
  Future<void> saveAttendance(String sessionId, Map<String, AttendanceStatus> statuses, Map<String, String> notes);
}
