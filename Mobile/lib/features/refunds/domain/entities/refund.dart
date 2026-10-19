/// Tài khoản nhận hoàn tiền do học viên cung cấp khi hủy khóa (`bankInfo`).
class RefundBankInfo {
  const RefundBankInfo({
    required this.bankName,
    required this.accountNumber,
    required this.accountName,
    this.vietQrUrl,
  });

  final String bankName;
  final String accountNumber;
  final String accountName;

  /// Ảnh VietQR để Quản lý quét chuyển khoản.
  final String? vietQrUrl;
}

/// Trạng thái yêu cầu hoàn tiền (`RefundStatus`).
enum RefundStatus { pending, completed, rejected, cancelled }

/// Lý do hoàn tiền (`RefundReason`). `order*` = hoàn tiền đơn hàng của cửa hàng.
enum RefundReason {
  memberCancelCourse,

  /// Hủy khóa < 3 ngày trước khai giảng, xin hoàn ngoại lệ (Manager duyệt kèm phí chiết khấu).
  memberCancelCourseLate,
  memberCancelSession,

  /// Hủy buổi đã bị HLV dời lịch — hoàn 100% tiền buổi.
  sessionRescheduled,
  sessionCancelled,
  orderCancelled,
  orderNotPickedUp,
  orderLatePayment,
}

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
    this.orderId,
    this.orderCode,
    this.bankInfo,
    this.grossAmount,
    this.feePercent,
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

  /// Hoàn tiền đơn hàng (không trừ ví HLV).
  final String? orderId;
  final String? orderCode;

  /// `null` nếu học viên không cung cấp tài khoản.
  final RefundBankInfo? bankInfo;

  /// Hoàn ngoại lệ: giá trị gốc trước phí + % phí chiết khấu.
  final int? grossAmount;
  final int? feePercent;

  bool get isOrder => orderId != null;
}

/// Điều kiện hủy khóa: ≥ 3 ngày trước khai giảng ⇒ hoàn 100%; muộn hơn ⇒ hủy không hoàn hoặc xin hoàn ngoại lệ.
class CancellationEligibility {
  const CancellationEligibility({
    required this.allowed,
    required this.paidAmount,
    required this.estimatedRefund,
    this.fullRefund = true,
    this.deadline,
    this.blockReason,
    this.lateRefund,
  });

  final bool allowed;
  final int paidAmount;

  /// Ước tính tiền hoàn nếu hủy ngay (BE tính chính thức).
  final int estimatedRefund;

  /// `true` ⇒ còn ≥ 3 ngày, hoàn 100%; `false` ⇒ hủy muộn.
  final bool fullRefund;

  /// Hạn cuối được hoàn 100% (khai giảng − 3 ngày).
  final DateTime? deadline;
  final String? blockReason;

  /// Chỉ khi hủy muộn: thông tin yêu cầu hoàn ngoại lệ.
  final LateRefundOption? lateRefund;
}

/// Yêu cầu hoàn ngoại lệ khi hủy muộn: hoàn = giá trị buổi chưa học × (100% − phí), Manager chốt phí khi duyệt.
class LateRefundOption {
  const LateRefundOption({
    required this.available,
    required this.grossAmount,
    required this.feePercent,
    required this.estimatedAmount,
    required this.futureSessions,
    required this.totalSessions,
  });

  final bool available;
  final int grossAmount;
  final int feePercent;
  final int estimatedAmount;
  final int futureSessions;
  final int totalSessions;
}

/// Kết quả gửi hủy khóa.
enum CancellationMode { refundRequested, lateRefundRequested, cancelledNoRefund }

class CancellationResult {
  const CancellationResult({required this.mode, this.refund, this.cancelledSessions = 0});

  final CancellationMode mode;
  final Refund? refund;
  final int cancelledSessions;
}
