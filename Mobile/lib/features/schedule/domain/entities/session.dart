import '../../../attendance/domain/entities/attendance.dart';
import '../../../catalog/domain/entities/catalog.dart';

/// Trạng thái buổi học (`ScheduleStatus`).
enum ScheduleStatus { scheduled, cancelled, completed }

/// Trạng thái giữ chỗ (`EnrollmentStatus`).
enum EnrollmentStatus { booked, cancelled, completed }

/// Phương án xử lý khi hủy buổi đã có học viên.
enum CancelResolutionMode { makeup, refund }

/// Một buổi học (`ClassSchedule`).
class ClassSession {
  const ClassSession({
    required this.id,
    required this.classId,
    required this.className,
    required this.coachName,
    required this.coachUserId,
    required this.room,
    required this.startTime,
    required this.endTime,
    required this.status,
    required this.bookedCount,
    required this.capacity,
    this.makeupForId,
    this.makeupSessionId,
    this.cancelReason,
    this.cancelResolution,
  });

  final String id;
  final String classId;
  final String className;
  final String coachName;
  final String coachUserId;
  final Room room;
  final DateTime startTime;
  final DateTime endTime;
  final ScheduleStatus status;
  final int bookedCount;
  final int capacity;

  /// Buổi này là buổi dạy bù cho buổi [makeupForId].
  final String? makeupForId;

  /// Buổi bị hủy này đã có buổi dạy bù [makeupSessionId].
  final String? makeupSessionId;
  final String? cancelReason;
  final CancelResolutionMode? cancelResolution;

  bool get isMakeup => makeupForId != null;

  bool isOngoing(DateTime now) =>
      status == ScheduleStatus.scheduled && !now.isBefore(startTime) && now.isBefore(endTime);

  bool hasStarted(DateTime now) => !now.isBefore(startTime);

  bool hasEnded(DateTime now) => !now.isBefore(endTime);
}

/// Buổi trong lịch của Member, kèm tình trạng giữ chỗ / điểm danh và quyền
/// hủy/đổi buổi (lý do do repository trả về — Q3).
class MySession {
  const MySession({
    required this.session,
    required this.enrollmentId,
    required this.enrollmentStatus,
    this.attendance,
    this.cancelBlockReason,
    this.transferBlockReason,
    this.refundId,
  });

  final ClassSession session;
  final String enrollmentId;
  final EnrollmentStatus enrollmentStatus;
  final AttendanceStatus? attendance;

  /// `null` ⇒ được hủy buổi.
  final String? cancelBlockReason;

  /// `null` ⇒ được đổi buổi.
  final String? transferBlockReason;

  /// Yêu cầu hoàn tiền phát sinh khi buổi bị hủy (REFUND).
  final String? refundId;

  bool get canCancel => cancelBlockReason == null;
  bool get canTransfer => transferBlockReason == null;
}

/// Buổi đích khi đổi buổi.
class TransferOption {
  const TransferOption({required this.session, this.blockReason});

  final ClassSession session;
  final String? blockReason;

  int get remaining => (session.capacity - session.bookedCount).clamp(0, session.capacity);
}

/// Một học viên trong buổi dạy.
class RosterEntry {
  const RosterEntry({
    required this.memberProfileId,
    required this.userId,
    required this.fullName,
    required this.enrollmentStatus,
    this.avatarUrl,
    this.attendance,
    this.note,
  });

  final String memberProfileId;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final EnrollmentStatus enrollmentStatus;
  final AttendanceStatus? attendance;
  final String? note;
}

/// Buổi dạy (góc nhìn HLV) + danh sách học viên.
class TeachingSession {
  const TeachingSession({required this.session, required this.roster, this.makeupSession});

  final ClassSession session;
  final List<RosterEntry> roster;
  final ClassSession? makeupSession;

  int get checkedIn =>
      roster.where((r) => r.attendance == AttendanceStatus.present || r.attendance == AttendanceStatus.late).length;
}

/// Thông tin trước khi hủy buổi.
class CancelPreview {
  const CancelPreview({required this.bookedCount, required this.perSessionRefund});

  final int bookedCount;

  /// Ước tính tiền hoàn 1 buổi = giá ÷ số buổi chính (BE tính chính thức).
  final int perSessionRefund;

  bool get requiresResolution => bookedCount > 0;
}

class CancelSessionInput {
  const CancelSessionInput({this.reason, this.mode, this.makeupStart, this.makeupEnd, this.makeupRoomId});

  final String? reason;
  final CancelResolutionMode? mode;
  final DateTime? makeupStart;
  final DateTime? makeupEnd;
  final String? makeupRoomId;
}

class CancelSessionResult {
  const CancelSessionResult({required this.affectedMembers, this.makeupSession, this.refundCount = 0});

  final int affectedMembers;
  final ClassSession? makeupSession;
  final int refundCount;
}
