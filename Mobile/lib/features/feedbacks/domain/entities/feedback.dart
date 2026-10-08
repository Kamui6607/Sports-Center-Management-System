/// Đánh giá HLV (`CoachFeedback`).
class CoachFeedback {
  const CoachFeedback({
    required this.id,
    required this.coachProfileId,
    required this.rating,
    required this.createdAt,
    required this.authorName,
    this.classId,
    this.className,
    this.comment,
    this.isAnonymous = false,
    this.isMine = false,
  });

  final String id;
  final String coachProfileId;
  final String? classId;
  final String? className;
  final int rating;
  final String? comment;
  final bool isAnonymous;

  /// Tên hiển thị ("Học viên ẩn danh" khi ẩn danh).
  final String authorName;
  final DateTime createdAt;
  final bool isMine;
}

class FeedbackSummary {
  const FeedbackSummary({required this.average, required this.count, required this.distribution});

  static const empty = FeedbackSummary(average: 0, count: 0, distribution: {});

  final double average;
  final int count;
  final Map<int, int> distribution;
}

class FeedbackPage {
  const FeedbackPage({required this.summary, required this.items});

  final FeedbackSummary summary;
  final List<CoachFeedback> items;
}

class FeedbackDraft {
  const FeedbackDraft({
    required this.coachProfileId,
    required this.rating,
    this.classId,
    this.comment,
    this.isAnonymous = false,
  });

  final String coachProfileId;
  final String? classId;
  final int rating;
  final String? comment;
  final bool isAnonymous;
}
