// Bảng kỳ học của Coach: CoachLeave (đơn nghỉ phép).
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import '../../features/term/domain/entities/coach_term.dart';

class CoachLeaveRow {
  CoachLeaveRow({
    required this.id,
    required this.coachProfileId,
    required this.startDate,
    required this.endDate,
    required this.kind,
    required this.reason,
    required this.createdAt,
    this.status = LeaveStatus.pending,
    this.reviewNote,
  });

  final String id;
  final String coachProfileId;
  final DateTime startDate;
  final DateTime endDate;
  final LeaveKind kind;
  final String reason;
  final DateTime createdAt;
  LeaveStatus status;
  String? reviewNote;
}
