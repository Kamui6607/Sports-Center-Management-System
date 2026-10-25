import '../core/network/api_client.dart';
import '../core/network/json.dart';
import '../features/auth/domain/entities/app_user.dart';
import '../features/catalog/domain/entities/catalog.dart';
import '../features/classes/domain/entities/course.dart';
import '../features/schedule/domain/entities/session.dart';
import 'catalog_json.dart';

/// Ánh xạ JSON khóa học / buổi học của BE ⇒ entity.
abstract final class ClassJson {
  /// HLV của khóa: `class.coach` (CoachProfile) + `class.coach.user`.
  static CoachSummary coach(Json cls, {double? rating, int? ratingCount}) {
    final coach = cls.obj('coach');
    final user = coach.obj('user');
    return CoachSummary(
      coachProfileId: coach.str('id', cls.str('coachId')),
      userId: user.str('id', coach.str('userId')),
      fullName: user.str('fullName', 'Huấn luyện viên'),
      avatarUrl: ApiClient.absoluteUrl(user.strOrNull('avatarUrl')),
      specialization: coach.strOrNull('specialization'),
      experienceYears: coach.intOrNull('experienceYears'),
      // BE-12: điểm HLV kèm trong `class.coach`.
      ratingAverage: rating ?? coach.dbl('ratingAverage'),
      ratingCount: ratingCount ?? coach.integer('ratingCount'),
    );
  }

  /// `Class` của BE. Số liệu lịch/học viên lấy từ `summary` (BE-12); [stats] ghi đè khi đã có
  /// danh sách buổi đầy đủ.
  static CourseClass course(Json cls, {ClassStats? stats, double? rating, int? ratingCount, int coachRevenue = 0}) {
    final fitness = cls.str('fitness').trim();
    final count = cls.obj('_count');
    stats ??= ClassStats.fromSummary(cls.objOrNull('summary'));
    return CourseClass(
      id: cls.str('id'),
      name: cls.str('name'),
      description: cls.strOrNull('description') ?? cls.strOrNull('goal'),
      sports: fitness.isEmpty ? const [] : [CatalogJson.sport(fitness)],
      price: cls.money('price'),
      status: cls.enumOr('status', ClassStatus.values, ClassStatus.pending),
      classType: cls.enumOr('classType', ClassType.values, ClassType.regular),
      areaType: cls.enumOr('areaType', AreaType.values, AreaType.indoor),
      capacity: cls.integer('capacity'),
      coach: coach(cls, rating: rating, ratingCount: ratingCount),
      // Không có danh sách buổi ⇒ `_count.schedules` (gồm cả buổi bù/đã hủy) là ước lượng.
      mainSessionCount: stats?.mainSessionCount ?? count.integer('schedules'),
      completedSessionCount: stats?.completedSessionCount ?? 0,
      upcomingSessionCount: stats?.upcomingSessionCount ?? 0,
      createdAt: cls.date('createdAt'),
      firstSessionStart: stats?.firstSessionStart,
      lastSessionEnd: stats?.lastSessionEnd,
      nextSessionStart: stats?.nextSessionStart,
      studentCount: stats?.studentCount ?? 0,
      minRemainingSlots: stats?.minRemainingSlots,
      rejectReason: cls.strOrNull('rejectReason'),
      coachRevenue: coachRevenue,
      goal: cls.strOrNull('goal'),
      goalTags: cls.strList('goalTags'),
      targetLevel: cls.enumOrNull('targetLevel', TrainingLevel.values),
      startDate: cls.dateOrNull('startDate') ?? stats?.firstSessionStart,
      endDate: cls.dateOrNull('endDate') ?? stats?.lastSessionEnd,
      goalMatch: goalMatch(cls.objOrNull('goalMatch')),
      saleState: saleState(cls.objOrNull('summary')?.strOrNull('saleState')) ?? SaleState.onSale,
      quote: quote(cls.objOrNull('summary')?.objOrNull('quote')),
    );
  }

  /// `saleState` của BE (`ON_SALE`…) ⇒ [SaleState].
  static SaleState? saleState(String? v) => switch (v) {
    'ON_SALE' => SaleState.onSale,
    'FULL' => SaleState.full,
    'SALE_CLOSED' => SaleState.saleClosed,
    'ENDED' => SaleState.ended,
    'NOT_OPEN' => SaleState.notOpen,
    _ => null,
  };

  /// Báo giá mua khóa (`summary.quote` / `course-plan.sale.quote`).
  static CourseQuote? quote(Json? q) => q == null
      ? null
      : CourseQuote(
          listPrice: q.money('listPrice'),
          totalSessions: q.integer('totalSessions'),
          unitPrice: q.money('unitPrice'),
          sessionsPurchased: q.integer('sessionsPurchased'),
          sessionsMissed: q.integer('sessionsMissed'),
          discount: q.money('discount'),
          amount: q.money('amount'),
          isLate: q.boolean('isLate'),
        );

  /// `goalMatch` của BE (null với Guest/HLV).
  static GoalMatch? goalMatch(Json? g) => g == null
      ? null
      : GoalMatch(
          score: g.integer('score'),
          level: g.enumOr('level', GoalMatchLevel.values, GoalMatchLevel.unknown),
          matchedGoals: [for (final m in g.objList('matchedGoals')) m.str('code')],
          message: g.str('message'),
        );

  /// Một dòng `GET /enrollments/my/courses` — thông tin khóa theo snapshot lúc mua.
  static MemberCourse memberCourse(Json r) {
    final cls = r.obj('class');
    final coach = cls.obj('coach');
    final pay = r.obj('payment');
    final review = r.objOrNull('myReview');
    return MemberCourse(
      classId: r.str('classId', cls.str('id')),
      status: r.enumOr('courseStatus', MemberCourseStatus.values, MemberCourseStatus.ongoing),
      className: cls.str('name', 'Khóa học'),
      coachName: coach.str('fullName', 'Huấn luyện viên'),
      coachProfileId: coach.strOrNull('id'),
      coachUserId: coach.strOrNull('userId'),
      coachAvatarUrl: ApiClient.absoluteUrl(coach.strOrNull('avatarUrl')),
      goal: cls.strOrNull('goal'),
      amountPaid: pay.money('amount'),
      paidAt: pay.dateOrNull('paidAt'),
      paymentId: pay.strOrNull('id'),
      pendingExpiresAt: pay.dateOrNull('pendingExpiresAt'),
      startDate: r.dateOrNull('startDate'),
      endDate: r.dateOrNull('endDate'),
      nextSessionStart: r.objOrNull('nextSession')?.dateOrNull('startTime'),
      totalSessions: r.integer('totalSessions'),
      completedSessions: r.integer('completedSessions'),
      myBookedSessions: r.integer('myBookedSessions'),
      pendingRefundAmount: r.objOrNull('pendingRefund')?.money('amount'),
      canReview: r.boolean('canReview'),
      canEditReview: r.boolean('canEditReview'),
      myRating: r.intOrNull('myRating'),
      myReviewComment: review?.strOrNull('comment'),
    );
  }

  /// `GET /coaches/:id/profile`.
  static CoachPublicProfile coachProfile(Json p) {
    final stats = p.obj('stats');
    final rating = p.obj('rating');
    final dist = rating.obj('distribution');
    return CoachPublicProfile(
      coachProfileId: p.str('coachProfileId'),
      userId: p.str('userId'),
      fullName: p.str('fullName', 'Huấn luyện viên'),
      avatarUrl: ApiClient.absoluteUrl(p.strOrNull('avatarUrl')),
      specialization: p.strOrNull('specialization'),
      experienceYears: p.intOrNull('experienceYears'),
      bio: p.strOrNull('bio'),
      joinedAt: p.dateOrNull('joinedAt'),
      openCourses: stats.integer('openCourses'),
      totalCourses: stats.integer('totalCourses'),
      totalStudents: stats.integer('totalStudents'),
      completedSessions: stats.integer('completedSessions'),
      ratingAverage: rating['average'] == null ? null : rating.dbl('average'),
      ratingCount: rating.integer('count'),
      distribution: {for (var i = 1; i <= 5; i++) i: dist.integer('$i')},
      courses: [
        for (final c in p.objList('courses'))
          CoachCourseItem(
            id: c.str('id'),
            name: c.str('name'),
            price: c.money('price'),
            goalTags: [for (final g in c.objList('goals')) g.str('code')],
            upcomingSessions: c.integer('upcomingSessions'),
            startDate: c.dateOrNull('startDate'),
            endDate: c.dateOrNull('endDate'),
          ),
      ],
      reviews: [
        for (final r in p.objList('recentReviews'))
          CoachReviewItem(
            rating: r.integer('rating'),
            comment: r.strOrNull('comment'),
            createdAt: r.date('createdAt'),
            authorName: r.objOrNull('author')?.strOrNull('fullName'),
            className: r.objOrNull('class')?.strOrNull('name'),
          ),
      ],
    );
  }

  /// Buổi học (`ClassSchedule` kèm `class`, `room`, `_count.enrollments`).
  ///
  /// [classes] tra cứu tên khóa / HLV khi JSON buổi không kèm `class.coach`.
  static ClassSession session(Json s, {Json? classJson, String? makeupSessionId}) {
    final cls = classJson ?? s.obj('class');
    final c = coach(cls);
    final room = s.objOrNull('room');
    return ClassSession(
      id: s.str('id'),
      classId: s.str('classId', cls.str('id')),
      className: cls.str('name'),
      coachName: c.fullName,
      coachUserId: c.userId,
      room: room == null
          ? Room(id: s.str('roomId'), name: '', capacity: 0, areaType: AreaType.indoor)
          : CatalogJson.room(room),
      startTime: s.date('startTime'),
      endTime: s.date('endTime'),
      status: s.enumOr('status', ScheduleStatus.values, ScheduleStatus.scheduled),
      bookedCount: s.obj('_count').integer('enrollments'),
      capacity: cls.integer('capacity', room?.integer('capacity') ?? 0),
      makeupForId: s.strOrNull('makeupForId'),
      makeupSessionId: makeupSessionId,
      // BE-20: lý do & phương án hủy được lưu ở buổi học.
      cancelReason: s.strOrNull('cancelReason'),
      cancelResolution:
          s.enumOrNull('cancelResolution', CancelResolutionMode.values) ??
          (makeupSessionId != null ? CancelResolutionMode.makeup : null),
      originalStartTime: s.dateOrNull('originalStartTime'),
      rescheduleReason: s.strOrNull('rescheduleReason'),
      rescheduleCount: s.integer('rescheduleCount'),
      rescheduledAt: s.dateOrNull('rescheduledAt'),
    );
  }

  /// Gắn liên kết buổi bị hủy ⇒ buổi dạy bù trong cùng danh sách.
  static List<ClassSession> sessions(List<Json> rows, {Map<String, Json> classes = const {}}) {
    final makeupOf = <String, String>{
      for (final r in rows)
        if (r.strOrNull('makeupForId') != null) r.str('makeupForId'): r.str('id'),
    };
    return [
      for (final r in rows) session(r, classJson: classes[r.str('classId')], makeupSessionId: makeupOf[r.str('id')]),
    ];
  }
}

/// Số liệu tổng hợp của một khóa tính từ danh sách buổi (`GET /class-schedules?classId=`).
class ClassStats {
  const ClassStats({
    required this.mainSessionCount,
    required this.completedSessionCount,
    required this.upcomingSessionCount,
    required this.studentCount,
    this.firstSessionStart,
    this.lastSessionEnd,
    this.nextSessionStart,
    this.minRemainingSlots,
  });

  final int mainSessionCount;
  final int completedSessionCount;
  final int upcomingSessionCount;
  final int studentCount;
  final DateTime? firstSessionStart;
  final DateTime? lastSessionEnd;
  final DateTime? nextSessionStart;
  final int? minRemainingSlots;

  /// `summary` của BE (BE-12) ⇒ [ClassStats] (null nếu BE không trả).
  static ClassStats? fromSummary(Json? s) => s == null
      ? null
      : ClassStats(
          mainSessionCount: s.integer('mainSessionCount'),
          completedSessionCount: s.integer('completedSessionCount'),
          upcomingSessionCount: s.integer('upcomingSessionCount'),
          studentCount: s.integer('studentCount'),
          firstSessionStart: s.dateOrNull('firstSessionStart'),
          lastSessionEnd: s.dateOrNull('lastSessionEnd'),
          nextSessionStart: s.dateOrNull('nextSessionStart'),
          minRemainingSlots: s.intOrNull('minRemainingSlots'),
        );

  /// [sessions]: buổi của một khóa. [capacity]: sức chứa mỗi buổi. Số học viên lấy từ [studentCount]
  /// của BE (không ước lượng).
  static ClassStats of(List<ClassSession> sessions, int capacity, DateTime now, {required int studentCount}) {
    final live = sessions.where((s) => s.status != ScheduleStatus.cancelled).toList()
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
    final main = live.where((s) => !s.isMakeup).toList();
    final upcoming = live.where((s) => s.status == ScheduleStatus.scheduled && s.startTime.isAfter(now)).toList();
    int? minRemaining;
    for (final s in upcoming) {
      final left = (capacity - s.bookedCount).clamp(0, capacity);
      minRemaining = minRemaining == null || left < minRemaining ? left : minRemaining;
    }
    return ClassStats(
      mainSessionCount: sessions.where((s) => !s.isMakeup).length,
      completedSessionCount: live.where((s) => s.status == ScheduleStatus.completed).length,
      upcomingSessionCount: upcoming.length,
      studentCount: studentCount,
      firstSessionStart: (main.isNotEmpty ? main : live).firstOrNull?.startTime,
      lastSessionEnd: live.lastOrNull?.endTime,
      nextSessionStart: upcoming.firstOrNull?.startTime,
      minRemainingSlots: minRemaining,
    );
  }
}
