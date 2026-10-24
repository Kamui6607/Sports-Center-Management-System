import '../../../core/error/app_failure.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../payments/domain/entities/payment.dart';
import '../domain/entities/feedback.dart';
import '../domain/repositories/feedback_repository.dart';

/// Mock theo `BE/src/modules/feedbacks` (Member đánh giá HLV).
class FeedbackMockRepository implements FeedbackRepository {
  FeedbackMockRepository(this._server);

  final MockServer _server;

  @override
  Future<FeedbackPage> forCoach(String coachProfileId, {String? classId}) => _server.run(() {
    final db = _server.db;
    final me = _server.currentUser == null ? null : db.memberOfUser(_server.currentUserId!);
    final rows =
        db.feedbacks
            .where((f) => f.coachProfileId == coachProfileId && (classId == null || f.classId == classId))
            .toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final items = [
      for (final f in rows)
        CoachFeedback(
          id: f.id,
          coachProfileId: f.coachProfileId,
          classId: f.classId,
          className: f.classId == null ? null : db.classRow(f.classId!).name,
          rating: f.rating,
          comment: f.comment,
          isAnonymous: f.isAnonymous,
          authorName: f.isAnonymous ? 'Học viên ẩn danh' : db.userOfMember(f.memberProfileId).fullName,
          createdAt: f.createdAt,
          isMine: me != null && f.memberProfileId == me.id,
        ),
    ];
    final dist = <int, int>{for (var i = 1; i <= 5; i++) i: 0};
    for (final f in rows) {
      dist[f.rating] = dist[f.rating]! + 1;
    }
    final avg = rows.isEmpty ? 0.0 : rows.fold(0, (s, f) => s + f.rating) / rows.length;
    return FeedbackPage(
      summary: FeedbackSummary(average: avg, count: rows.length, distribution: dist),
      items: items,
    );
  });

  bool _learnsWith(String memberId, String coachProfileId) {
    final db = _server.db;
    return db.payments.any(
      (p) =>
          p.memberProfileId == memberId &&
          p.classId != null &&
          p.status == PaymentStatus.success &&
          db.classRow(p.classId!).coachProfileId == coachProfileId,
    );
  }

  @override
  Future<bool> canReview(String coachProfileId) => _server.run(() {
    final u = _server.currentUser;
    if (u == null) return false;
    final m = _server.db.memberOfUser(u.id);
    return m != null && _learnsWith(m.id, coachProfileId);
  });

  @override
  Future<void> submit(FeedbackDraft d) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    if (!_learnsWith(member.id, d.coachProfileId)) {
      throw const AppFailure.forbidden('Bạn chỉ đánh giá được HLV đã/đang dạy mình.');
    }
    if (d.rating < 1 || d.rating > 5) throw const AppFailure.validation('Đánh giá từ 1 đến 5 sao.');
    final comment = d.comment?.trim();
    final existing = db.feedbacks
        .where((f) => f.coachProfileId == d.coachProfileId && f.memberProfileId == member.id)
        .firstOrNull;
    if (existing != null) {
      existing
        ..rating = d.rating
        ..comment = comment == null || comment.isEmpty ? null : comment
        ..isAnonymous = d.isAnonymous
        ..classId = d.classId ?? existing.classId
        ..createdAt = db.now();
      return;
    }
    db.feedbacks.add(
      FeedbackRow(
        id: db.nextId('fb'),
        coachProfileId: d.coachProfileId,
        memberProfileId: member.id,
        rating: d.rating,
        createdAt: db.now(),
        classId: d.classId,
        comment: comment == null || comment.isEmpty ? null : comment,
        isAnonymous: d.isAnonymous,
      ),
    );
  });

  @override
  Future<void> delete(String feedbackId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final f = db.feedbacks.where((x) => x.id == feedbackId).firstOrNull;
    if (f == null) throw const AppFailure.notFound('Không tìm thấy đánh giá.');
    if (f.memberProfileId != member.id) throw const AppFailure.forbidden('Bạn chỉ xóa được đánh giá của mình.');
    db.feedbacks.remove(f);
  });
}
