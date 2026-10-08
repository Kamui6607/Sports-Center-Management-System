import '../entities/feedback.dart';

/// Đánh giá HLV — module `feedbacks`.
abstract interface class FeedbackRepository {
  /// `GET /feedbacks?coachId=&classId=`.
  Future<FeedbackPage> forCoach(String coachProfileId, {String? classId});

  /// Member có học với HLV này (được viết đánh giá).
  Future<bool> canReview(String coachProfileId);

  /// `POST /feedbacks` (tạo mới hoặc cập nhật đánh giá của tôi).
  Future<void> submit(FeedbackDraft draft);

  /// `DELETE /feedbacks/:id`.
  Future<void> delete(String feedbackId);
}
