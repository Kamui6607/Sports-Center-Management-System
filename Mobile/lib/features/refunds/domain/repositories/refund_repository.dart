import '../entities/refund.dart';

/// Hủy khóa & hoàn tiền — module `refunds`.
abstract interface class RefundRepository {
  /// Kiểm tra điều kiện hủy khóa của Member.
  Future<CancellationEligibility> eligibility(String classId);

  /// `POST /refunds/course-cancellation { classId, note }`.
  Future<Refund> requestCancellation(String classId, {String? note});

  /// `GET /refunds/my`.
  Future<List<Refund>> myRefunds();

  Future<Refund> refund(String id);

  /// Manager: `GET /refunds?status=`.
  Future<List<Refund>> all({RefundStatus? status});

  /// Manager: `PATCH /refunds/:id/approve { note }`.
  Future<void> approve(String id, {String? note});

  /// Manager: `PATCH /refunds/:id/reject { reason }`.
  Future<void> reject(String id, String reason);
}
