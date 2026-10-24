import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/entities/coach_term.dart';

/// Trạng thái của Coach trong kỳ ⇒ (nhãn, tone).
StatusLabel termStateLabel(CoachTermState s) => switch (s) {
  CoachTermState.pending => const StatusLabel('Chờ đủ điều kiện', StatusTone.warning),
  CoachTermState.compliant => const StatusLabel('Đạt', StatusTone.success),
  CoachTermState.nonCompliant => const StatusLabel('Chưa đạt', StatusTone.danger),
  CoachTermState.exempt => const StatusLabel('Được miễn', StatusTone.info),
};

String termPhaseLabel(TermPhase p) => switch (p) {
  TermPhase.upcoming => 'Sắp bắt đầu',
  TermPhase.grace => 'Đang trong ân hạn',
  TermPhase.active => 'Đang diễn ra',
  TermPhase.ended => 'Đã kết thúc',
};

StatusTone passTone(PassLevel l) => switch (l) {
  PassLevel.ok => StatusTone.success,
  PassLevel.warn => StatusTone.warning,
  PassLevel.deny => StatusTone.danger,
};

String passTitle(PassLevel l) => switch (l) {
  PassLevel.ok => 'Thẻ hợp lệ',
  PassLevel.warn => 'Thẻ hợp lệ — cần lưu ý',
  PassLevel.deny => 'Thẻ không hợp lệ',
};

StatusLabel leaveStatusLabel(LeaveStatus s) => switch (s) {
  LeaveStatus.pending => const StatusLabel('Chờ duyệt', StatusTone.warning),
  LeaveStatus.approved => const StatusLabel('Đã duyệt', StatusTone.success),
  LeaveStatus.rejected => const StatusLabel('Từ chối', StatusTone.danger),
  LeaveStatus.cancelled => const StatusLabel('Đã hủy', StatusTone.neutral),
};

String leaveKindLabel(LeaveKind k) => switch (k) {
  LeaveKind.sick => 'Ốm',
  LeaveKind.personal => 'Việc riêng',
  LeaveKind.other => 'Khác',
};

/// Tỷ lệ 0..1 ⇒ "85%"; thiếu dữ liệu ⇒ "—".
String percentLabel(double? v) => v == null ? '—' : '${(v * 100).round()}%';
