import '../../../attendance/domain/entities/attendance.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../makeup/domain/entities/makeup.dart';

/// Trạng thái buổi học (`ScheduleStatus`).
enum ScheduleStatus { scheduled, cancelled, completed }

/// Trạng thái giữ chỗ (`EnrollmentStatus`).
enum EnrollmentStatus { booked, cancelled, completed }

/// Phương án xử lý khi hủy buổi đã có học viên.
enum CancelResolutionMode { makeup, refund }

/// Luật dời lịch (BE `RESCHEDULE_*`): buổi còn ≥ 24h, giờ mới cách hiện tại ≥ 24h, tối đa 2 lần/buổi.
const kRescheduleMinNoticeHours = 24;
const kMaxReschedules = 2;

/// Luật đổi buổi của học viên (BE `MAX_TRANSFERS_PER_COURSE`).
const kMaxTransfersPerCourse = 2;

/// Số lần báo vắng còn hiệu lực tối đa / khóa (BE `ATTENDANCE.MEMBER_ABSENCE_MAX_PER_COURSE`).
const kMaxAbsencesPerCourse = 2;

/// Vì sao không chọn được buổi nào để đổi (BE `transfer-options.emptyReason`).
enum TransferEmptyReason {
  /// Buổi hiện tại còn < 24h.
  tooLate,

  /// Đã dùng hết lượt đổi của khóa.
  limit,

  /// Chỗ không còn giữ / buổi đã bắt đầu.
  notAvailable,

  /// Khóa chưa có buổi bù, HLV không có khóa tương đương.
  noMakeupOrEquivalent,
  allFull,
  allConflict,
  allUnavailable,
}

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
    this.isMakeupSlot = false,
    this.cancelReason,
    this.cancelResolution,
    this.originalStartTime,
    this.rescheduleReason,
    this.rescheduleCount = 0,
    this.rescheduledAt,
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

  /// Buổi bù MỞ do HLV tạo cho học viên xin học bù (không phải buổi chính, không bán).
  final bool isMakeupSlot;

  /// Buổi bị hủy này đã có buổi dạy bù [makeupSessionId].
  final String? makeupSessionId;
  final String? cancelReason;
  final CancelResolutionMode? cancelResolution;

  /// Buổi bị HLV dời lịch: giờ ban đầu, lý do, số lần đã dời (tối đa [kMaxReschedules]).
  final DateTime? originalStartTime;
  final String? rescheduleReason;
  final int rescheduleCount;
  final DateTime? rescheduledAt;

  bool get isMakeup => makeupForId != null;

  bool get isRescheduled => rescheduledAt != null || originalStartTime != null;

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
    this.absenceReason,
    this.absencesLeft = kMaxAbsencesPerCourse,
    this.transferEmptyReason,
    this.makeupRequest,
    this.isMakeupEnrollment = false,
  });

  final ClassSession session;
  final String enrollmentId;
  final EnrollmentStatus enrollmentStatus;
  final AttendanceStatus? attendance;

  /// Học viên đã tự báo vắng buổi này (lý do); `null` ⇒ chưa báo.
  final String? absenceReason;

  /// Lượt báo vắng còn lại của khóa.
  final int absencesLeft;

  /// Có giá trị ⇒ không có buổi nào chọn được để đổi (app giải thích + chỉ lối ra).
  final TransferEmptyReason? transferEmptyReason;

  /// Yêu cầu học bù của buổi này (đang chờ / đã xếp / bị từ chối gần nhất).
  final MakeupRequest? makeupRequest;

  /// Chỗ này là chỗ HỌC BÙ (không đổi buổi được).
  final bool isMakeupEnrollment;

  bool get hasReportedAbsence => absenceReason != null;

  /// `null` ⇒ được hủy buổi.
  final String? cancelBlockReason;

  /// `null` ⇒ được đổi buổi.
  final String? transferBlockReason;

  /// Yêu cầu hoàn tiền phát sinh khi buổi bị hủy (REFUND).
  final String? refundId;

  bool get canCancel => cancelBlockReason == null;
  bool get canTransfer => transferBlockReason == null;
}

/// Buổi đích khi đổi buổi (cùng khóa hoặc khóa tương đương cùng HLV).
class TransferOption {
  const TransferOption({required this.session, this.blockReason, this.isSameClass = true});

  final ClassSession session;
  final String? blockReason;

  /// false ⇒ buổi của khóa tương đương (cùng HLV, cùng hạng).
  final bool isSameClass;

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
    this.absenceReason,
  });

  final String memberProfileId;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final EnrollmentStatus enrollmentStatus;
  final AttendanceStatus? attendance;
  final String? note;

  /// Học viên tự báo vắng (lý do) — HLV thấy tag "Báo vắng".
  final String? absenceReason;
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

/// Danh sách buổi đổi được + số lần đổi còn lại (`GET /enrollments/:id/transfer-options`).
class TransferOptions {
  const TransferOptions({
    required this.options,
    this.transfersLeft = kMaxTransfersPerCourse,
    this.maxTransfers = kMaxTransfersPerCourse,
    this.blockReason,
    this.emptyReason,
    this.absencesLeft = kMaxAbsencesPerCourse,
    this.makeupRequest,
  });

  final List<TransferOption> options;
  final int transfersLeft;
  final int maxTransfers;

  /// `null` ⇒ có buổi chọn được.
  final TransferEmptyReason? emptyReason;

  /// Lượt báo vắng còn lại của khóa.
  final int absencesLeft;

  /// Lý do không đổi được (null ⇒ được chọn buổi).
  final String? blockReason;

  /// Yêu cầu học bù của chỗ này.
  final MakeupRequest? makeupRequest;
}

/// Dữ liệu dời buổi (`POST /class-schedules/:id/reschedule`).
class RescheduleInput {
  const RescheduleInput({required this.start, required this.end, required this.reason, this.roomId});

  final DateTime start;
  final DateTime end;
  final String reason;
  final String? roomId;
}

class RescheduleResult {
  const RescheduleResult({required this.session, required this.affectedMembers, this.conflictedMembers = const []});

  final ClassSession session;
  final int affectedMembers;

  /// Học viên bị trùng lịch cá nhân ở giờ mới (đã được cảnh báo).
  final List<String> conflictedMembers;
}
