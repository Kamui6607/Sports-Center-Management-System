import '../entities/refund.dart';

/// Hủy khóa & hoàn tiền — module `refunds`.
abstract interface class RefundRepository {
  /// Kiểm tra điều kiện hủy khóa của Member.
  Future<CancellationEligibility> eligibility(String classId);

  /// `POST /refunds/course-cancellation { classId, note, bankName, bankAccountNumber, bankAccountName }`.
  Future<Refund> requestCancellation(
    String classId, {
    String? note,
    String? bankName,
    String? bankAccountNumber,
    String? bankAccountName,
  });

  /// `GET /refunds/my`.
  Future<List<Refund>> myRefunds();

  Future<Refund> refund(String id);

  /// Member tự hủy yêu cầu khi còn PENDING. `PATCH /refunds/:id/cancel`
  Future<void> cancelRequest(String refundId);

  /// Manager: `GET /refunds?status=`.
  Future<List<Refund>> all({RefundStatus? status});

  /// Manager: `PATCH /refunds/:id/approve { transactionRef }` (mã giao dịch FT).
  Future<void> approve(String id, {String? transactionRef});

  /// Manager: `PATCH /refunds/:id/reject { reason }`.
  Future<void> reject(String id, String reason);
}
