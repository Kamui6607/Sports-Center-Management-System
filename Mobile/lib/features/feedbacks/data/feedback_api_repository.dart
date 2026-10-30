import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/feedback.dart';
import '../domain/repositories/feedback_repository.dart';

/// [FeedbackRepository] gọi BE thật — module `feedbacks`.
class FeedbackApiRepository implements FeedbackRepository {
  FeedbackApiRepository(this._api);

  final ApiClient _api;

  /// BE giới hạn `limit` ≤ 50.
  static const _limit = 50;
  static const _maxPages = 10;

  @override
  Future<FeedbackPage> forCoach(String coachProfileId, {String? classId}) async {
    final items = <CoachFeedback>[];
    Json summary = const {};
    for (var page = 1; page <= _maxPages; page++) {
      final res = await _api.get(
        '/feedbacks',
        query: {'coachId': coachProfileId, 'classId': classId, 'page': page, 'limit': _limit},
      );
      summary = res.json.obj('summary');
      for (final f in res.json.objList('feedbacks')) {
        final anonymous = f.boolean('isAnonymous');
        items.add(
          CoachFeedback(
            id: f.str('id'),
            coachProfileId: f.str('coachId'),
            classId: f.strOrNull('classId'),
            className: f.objOrNull('class')?.strOrNull('name'),
            rating: f.integer('rating'),
            comment: f.strOrNull('comment'),
            isAnonymous: anonymous,
            authorName: anonymous ? 'Học viên ẩn danh' : f.obj('member').obj('user').str('fullName', 'Học viên'),
            createdAt: f.date('createdAt'),
            isMine: f.boolean('isOwn'),
          ),
        );
      }
      if (page >= (res.pagination?.intOrNull('totalPages') ?? 1)) break;
    }
    // BE-22: phân bố sao do BE tính (toàn HLV, hoặc theo khóa khi lọc `classId`).
    final scope = classId == null ? summary : summary.obj('classSummary');
    final raw = scope.obj('distribution');
    return FeedbackPage(
      summary: FeedbackSummary(
        average: scope.dbl('averageRating'),
        count: scope.integer('totalFeedbacks'),
        distribution: {for (var star = 1; star <= 5; star++) star: raw.integer('$star')},
      ),
      items: items,
    );
  }

  @override
  Future<bool> canReview(String coachProfileId) async {
    // Đúng luật `POST /feedbacks` của BE: Member có chỗ (BOOKED/COMPLETED) trong một khóa của HLV này.
    try {
      final enrollments = await _api.getAll('/enrollments/my');
      return enrollments.any(
        (e) =>
            const {'BOOKED', 'COMPLETED'}.contains(e.str('status')) &&
            e.obj('schedule').obj('class').str('coachId') == coachProfileId,
      );
    } on AppFailure catch (f) {
      if (f.type == FailureType.forbidden) return false; // Không phải Member.
      rethrow;
    }
  }

  @override
  Future<void> submit(FeedbackDraft d) {
    final comment = d.comment?.trim();
    return _api.post(
      '/feedbacks',
      body: {
        'coachId': d.coachProfileId,
        'classId': ?d.classId,
        'rating': d.rating,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
        'isAnonymous': d.isAnonymous,
      },
    );
  }

  @override
  Future<void> delete(String feedbackId) => _api.delete('/feedbacks/$feedbackId');
}
