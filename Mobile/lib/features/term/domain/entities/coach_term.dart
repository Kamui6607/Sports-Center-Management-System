/// Kỳ học & quyền lợi của Coach (`BE/src/modules/terms`, Doc/COACH_TERMS.md).
///
/// Mỗi kỳ (4 tháng) Coach cần có khóa học hợp lệ trong hạn ân hạn và dạy đủ buổi để giữ quyền tập gym miễn phí.
/// Thẻ ra vào do Quản lý quét; hệ thống chỉ đánh giá + nhắc, không tự khóa tài khoản.
library;

/// Trạng thái của Coach trong một kỳ (`CoachTermState`).
enum CoachTermState { pending, compliant, nonCompliant, exempt }

/// Giai đoạn của kỳ tại thời điểm hiện tại.
enum TermPhase { upcoming, grace, active, ended }

/// Mức hợp lệ của thẻ: OK ⇒ qua; WARN ⇒ qua nhưng cần lưu ý; DENY ⇒ không hợp lệ.
enum PassLevel { ok, warn, deny }

enum LeaveStatus { pending, approved, rejected, cancelled }

enum LeaveKind { sick, personal, other }

/// Một kỳ học (3 kỳ/năm dương lịch).
class AcademicTerm {
  const AcademicTerm({
    required this.id,
    required this.name,
    required this.startDate,
    required this.endDate,
    required this.graceDays,
    required this.graceDeadline,
    required this.phase,
  });

  final String id;
  final String name;
  final DateTime startDate;
  final DateTime endDate;
  final int graceDays;

  /// Hạn ân hạn cơ bản (chưa cộng nghỉ phép của riêng Coach).
  final DateTime graceDeadline;
  final TermPhase phase;
}

/// Đăng ký kỳ: có khóa hợp lệ (đủ số buổi, trải đủ ngày) chưa.
class TermRegistration {
  const TermRegistration({
    required this.ok,
    required this.mainSessions,
    required this.spanDays,
    required this.requiredSessions,
    required this.requiredSpanDays,
    this.qualifyingClassName,
    this.pendingApproval = false,
  });

  final bool ok;
  final String? qualifyingClassName;
  final int mainSessions;
  final int spanDays;
  final int requiredSessions;
  final int requiredSpanDays;

  /// Khóa hợp lệ nhưng còn chờ Quản lý duyệt (không phải lỗi của Coach).
  final bool pendingApproval;
}

/// Việc dạy thật trong kỳ.
class TermDelivery {
  const TermDelivery({
    required this.completed,
    required this.awaitingComplete,
    required this.scheduledFuture,
    required this.cancelled,
    this.completionRate,
    this.cancelRate,
    this.evidenceRate,
  });

  final int completed;

  /// Buổi đã qua nhưng chưa bấm "Hoàn tất" — không được tính là đã dạy.
  final int awaitingComplete;
  final int scheduledFuture;
  final int cancelled;
  final double? completionRate;
  final double? cancelRate;
  final double? evidenceRate;
}

/// Kết quả đánh giá của Coach trong kỳ.
class CoachTermEvaluation {
  const CoachTermEvaluation({
    required this.state,
    required this.isFinal,
    required this.reasons,
    required this.warnings,
    required this.atRisk,
    required this.deadlineAt,
    required this.registration,
    required this.delivery,
    this.daysToDeadline,
    this.leaveApprovedDays = 0,
    this.graceExtensionDays = 0,
  });

  final CoachTermState state;

  /// Kỳ đã kết thúc ⇒ kết quả cuối cùng, ngược lại là tạm thời.
  final bool isFinal;
  final List<String> reasons;
  final List<String> warnings;
  final bool atRisk;

  /// Hạn tạo khóa (đã cộng nghỉ phép) — mốc 00:00 của ngày SAU ngày cuối.
  final DateTime deadlineAt;
  final int? daysToDeadline;
  final TermRegistration registration;
  final TermDelivery delivery;
  final int leaveApprovedDays;
  final int graceExtensionDays;

  /// Ngày cuối được phép tạo khóa (để hiển thị).
  DateTime get lastDay => deadlineAt.subtract(const Duration(milliseconds: 1));
}

/// Kết luận của thẻ ra vào.
class PassVerdict {
  const PassVerdict({required this.valid, required this.level, required this.reason});

  final bool valid;
  final PassLevel level;
  final String reason;
}

/// Trạng thái của chính Coach trong kỳ hiện tại (`GET /terms/me`).
class CoachTermStatus {
  const CoachTermStatus({
    required this.eligible,
    required this.term,
    required this.pass,
    this.evaluation,
    this.previousTermName,
    this.previousState,
  });

  /// `false` ⇒ hồ sơ Coach chưa được duyệt (chưa được đánh giá).
  final bool eligible;
  final AcademicTerm term;
  final CoachTermEvaluation? evaluation;
  final String? previousTermName;
  final CoachTermState? previousState;
  final PassVerdict pass;
}

/// Mã thẻ ra vào: JWT sống ngắn đưa vào QR (`GET /terms/me/pass`).
class CoachPass {
  const CoachPass({required this.token, required this.expiresIn, required this.verdict, this.state});

  /// Thời gian app nên làm mới mã trước khi hết hạn.
  static const refreshEvery = Duration(seconds: 45);

  final String token;
  final int expiresIn;
  final PassVerdict verdict;
  final CoachTermState? state;
}

/// Đơn nghỉ phép / ốm.
class CoachLeave {
  const CoachLeave({
    required this.id,
    required this.startDate,
    required this.endDate,
    required this.kind,
    required this.reason,
    required this.status,
    this.reviewNote,
  });

  final String id;
  final DateTime startDate;
  final DateTime endDate;
  final LeaveKind kind;
  final String reason;
  final LeaveStatus status;
  final String? reviewNote;

  bool get isPending => status == LeaveStatus.pending;

  /// Hủy được khi đang chờ duyệt, hoặc đã duyệt nhưng chưa bắt đầu.
  bool canCancel(DateTime now) => isPending || (status == LeaveStatus.approved && startDate.isAfter(now));
}

/// Mức dùng phòng gym trong tháng của HLV (`GET /terms/me/check-ins`).
class CheckInUsage {
  const CheckInUsage({
    required this.monthKey,
    required this.daysUsed,
    required this.freeDaysUsed,
    required this.freeDaysPerMonth,
    required this.freeDaysLeft,
    required this.feePerDay,
    required this.entitled,
    required this.feeAssessedThisMonth,
    required this.feeChargedThisMonth,
    required this.feeDebt,
    required this.checkedInToday,
  });

  final String monthKey;
  final int daysUsed;
  final int freeDaysUsed;
  final int freeDaysPerMonth;

  /// Thẻ không hợp lệ ⇒ 0 (mọi ngày đều tính phí).
  final int freeDaysLeft;
  final int feePerDay;

  /// Thẻ hợp lệ ⇒ được hưởng hạn mức miễn phí.
  final bool entitled;
  final int feeAssessedThisMonth;
  final int feeChargedThisMonth;

  /// Phí còn nợ (ví chưa đủ tiền ròng của khóa để trừ).
  final int feeDebt;
  final bool checkedInToday;
}

/// Một ngày dùng phòng.
class CoachCheckIn {
  const CoachCheckIn({
    required this.dayKey,
    required this.checkedInAt,
    required this.dayIndex,
    required this.free,
    required this.feeAssessed,
    required this.feeCharged,
    required this.feeDebt,
  });

  /// YYYY-MM-DD theo giờ VN.
  final String dayKey;
  final DateTime checkedInAt;
  final int dayIndex;
  final bool free;
  final int feeAssessed;
  final int feeCharged;
  final int feeDebt;
}

/// Kết quả quét QR check-in.
class CheckInResult {
  const CheckInResult({required this.alreadyCheckedIn, required this.checkIn, required this.usage, required this.pass});

  /// Đã check-in hôm nay trước đó — không tính thêm.
  final bool alreadyCheckedIn;
  final CoachCheckIn checkIn;
  final CheckInUsage usage;
  final PassVerdict pass;
}

/// Tổng quan check-in của tôi.
class MyCheckIns {
  const MyCheckIns({required this.eligible, required this.usage, required this.items});

  /// `false` ⇒ hồ sơ HLV chưa được duyệt (chưa check-in được).
  final bool eligible;
  final CheckInUsage usage;
  final List<CoachCheckIn> items;
}
