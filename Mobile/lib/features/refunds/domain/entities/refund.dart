/// Trạng thái yêu cầu hoàn tiền (`RefundStatus`).
enum RefundStatus { pending, completed, rejected }

/// Lý do hoàn tiền (`RefundReason`).
enum RefundReason { memberCancelCourse, sessionCancelled }

/// Yêu cầu hoàn tiền (`Refund`).
class Refund {
  const Refund({
    required this.id,
    required this.classId,
    required this.className,
    required this.reason,
    required this.amount,
    required this.coachDebitAmount,
    required this.status,
    required this.createdAt,
    required this.memberName,
    required this.coachName,
    this.sessionStart,
    this.note,
    this.processedAt,
    this.processedNote,
    this.rejectReason,
    this.paidAmount,
  });

  final String id;
  final String classId;
  final String className;
  final RefundReason reason;

  /// Số tiền hoàn cho học viên.
  final int amount;

  /// Phần bị trừ vào ví HLV khi duyệt (tỷ lệ 85%).
  final int coachDebitAmount;
  final RefundStatus status;
  final DateTime createdAt;
  final String memberName;
  final String coachName;

  /// Buổi bị hủy (với lý do `sessionCancelled`).
  final DateTime? sessionStart;

  /// Ghi chú của học viên khi gửi yêu cầu.
  final String? note;
  final DateTime? processedAt;

  /// Ghi chú của Quản lý khi duyệt (VD mã giao dịch chuyển khoản).
  final String? processedNote;
  final String? rejectReason;

  /// Số tiền giao dịch gốc.
  final int? paidAmount;
}

/// Điều kiện hủy khóa (≥ 24h trước buổi khai giảng).
class CancellationEligibility {
  const CancellationEligibility({
    required this.allowed,
    required this.paidAmount,
    required this.estimatedRefund,
    this.deadline,
    this.blockReason,
  });

  final bool allowed;
  final int paidAmount;

  /// Ước tính = phần còn lại của giao dịch (BE tính chính thức).
  final int estimatedRefund;
  final DateTime? deadline;
  final String? blockReason;
}
