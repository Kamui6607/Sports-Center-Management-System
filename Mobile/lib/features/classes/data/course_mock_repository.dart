import '../../../core/data/paged.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../payments/domain/entities/payment.dart';
import '../../refunds/domain/entities/refund.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/coach_class.dart';
import '../domain/entities/course.dart';
import '../domain/repositories/course_repository.dart';
import 'course_mock_rules.dart';

/// Mock theo `BE/src/modules/classes` + `class-schedules` (activity-plan).
class CourseMockRepository implements CourseRepository {
  CourseMockRepository(this._server);

  final MockServer _server;
  static const _pageSize = 8;

  @override
  Future<Paged<CourseClass>> browse(ClassQuery q) => _server.run(() {
    final db = _server.db;
    final keyword = q.search.toLowerCase();
    final list =
        db.classes
            .where((c) => c.status == ClassStatus.approved)
            .where((c) => q.sportId == null || c.sportIds.contains(q.sportId))
            .where((c) => q.classType == null || c.classType == q.classType)
            .where((c) => q.areaType == null || c.areaType == q.areaType)
            .map(db.toCourse)
            .where(
              (c) =>
                  keyword.isEmpty ||
                  c.name.toLowerCase().contains(keyword) ||
                  c.sportNames.toLowerCase().contains(keyword) ||
                  c.coach.fullName.toLowerCase().contains(keyword),
            )
            .toList()
          ..sort((a, b) {
            // Khóa còn buổi sắp tới lên trước, theo ngày gần nhất.
            final an = a.nextSessionStart, bn = b.nextSessionStart;
            if (an == null && bn == null) return b.createdAt.compareTo(a.createdAt);
            if (an == null) return 1;
            if (bn == null) return -1;
            return an.compareTo(bn);
          });
    return Paged.slice(list, page: q.page, limit: _pageSize);
  });

  @override
  Future<CourseDetail> detail(String classId) => _server.run(() {
    final db = _server.db;
    final row = db.classes.where((c) => c.id == classId).firstOrNull;
    if (row == null) throw const AppFailure.notFound('Khóa học không tồn tại.');
    final viewer = _server.currentUser;
    final isOwner = viewer != null && db.coachOfUser(viewer.id)?.id == row.coachProfileId;
    if (row.status != ClassStatus.approved &&
        row.status != ClassStatus.completed &&
        !isOwner &&
        viewer?.role != UserRole.manager) {
      throw const AppFailure.notFound('Khóa học không tồn tại hoặc chưa được duyệt.');
    }
    final now = db.now();
    final member = viewer == null ? null : db.memberOfUser(viewer.id);
    final upcoming = db
        .sessionsOf(classId)
        .where((s) => s.status == ScheduleStatus.scheduled && s.start.isAfter(now))
        .toList();
    final myBooked = member == null ? <SessionRow>[] : _bookedSessions(member.id);

    final sessions = [
      for (final s in upcoming)
        PlanSession(
          id: s.id,
          startTime: s.start,
          endTime: s.end,
          room: db.room(s.roomId),
          bookedCount: db.bookedCount(s.id),
          capacity: row.capacity,
          isMakeup: s.makeupForId != null,
          mine:
              member != null &&
              db.enrollments.any(
                (e) => e.memberProfileId == member.id && e.sessionId == s.id && e.status == EnrollmentStatus.booked,
              ),
          conflictWith: myBooked
              .where((o) => o.classId != classId && o.start.isBefore(s.end) && s.start.isBefore(o.end))
              .map((o) => db.classRow(o.classId).name)
              .firstOrNull,
        ),
    ];

    final slots = <String, CourseSlot>{};
    for (final s in upcoming) {
      final weekday = VnTime.wall(s.start).weekday;
      final key = '$weekday|${VnTime.timeRange(s.start, s.end)}|${s.roomId}';
      final prev = slots[key];
      slots[key] = CourseSlot(
        weekday: weekday,
        timeLabel: VnTime.timeRange(s.start, s.end),
        roomName: db.room(s.roomId).name,
        sessionCount: (prev?.sessionCount ?? 0) + 1,
      );
    }
    final sortedSlots = slots.values.toList()..sort((a, b) => a.weekday.compareTo(b.weekday));

    return CourseDetail(
      course: db.toCourse(row),
      slots: sortedSlots,
      sessions: sessions,
      purchase: member == null ? PurchaseInfo.guest : coursePurchaseInfo(_server, row, member.id, sessions),
    );
  });

  List<SessionRow> _bookedSessions(String memberProfileId) {
    final db = _server.db;
    return db.enrollments
        .where((e) => e.memberProfileId == memberProfileId && e.status == EnrollmentStatus.booked)
        .map((e) => db.session(e.sessionId))
        .where((s) => s.status == ScheduleStatus.scheduled)
        .toList();
  }

  @override
  Future<List<MyCourse>> myCourses() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final now = db.now();
    final paid = db.payments.where(
      (p) => p.memberProfileId == member.id && p.classId != null && p.status == PaymentStatus.success,
    );
    final result = <MyCourse>[];
    for (final p in paid) {
      final row = db.classRow(p.classId!);
      final course = db.toCourse(row);
      final sessionIds = db.sessionsOf(row.id).map((s) => s.id).toSet();
      final attended = db.attendance
          .where((a) => a.memberProfileId == member.id && sessionIds.contains(a.sessionId))
          .where((a) => a.status == AttendanceStatus.present || a.status == AttendanceStatus.late)
          .length;
      final booked =
          db.enrollments
              .where(
                (e) =>
                    e.memberProfileId == member.id &&
                    sessionIds.contains(e.sessionId) &&
                    e.status == EnrollmentStatus.booked,
              )
              .map((e) => db.session(e.sessionId))
              .where((s) => s.end.isAfter(now))
              .toList()
            ..sort((a, b) => a.start.compareTo(b.start));
      final first = course.firstSessionStart;
      final last = course.lastSessionEnd;
      final phase = row.status == ClassStatus.completed || (last != null && !now.isBefore(last))
          ? MyCoursePhase.ended
          : (first != null && now.isBefore(first) ? MyCoursePhase.upcoming : MyCoursePhase.ongoing);
      final pendingRefund = db.refunds.any(
        (r) => r.paymentId == p.id && r.reason == RefundReason.memberCancelCourse && r.status == RefundStatus.pending,
      );
      result.add(
        MyCourse(
          course: course,
          phase: phase,
          purchasedAt: p.paidAt ?? p.createdAt,
          amountPaid: p.amount,
          attendedCount: attended,
          bookedCount: booked.length,
          totalSessions: course.mainSessionCount,
          nextSessionStart: booked.firstOrNull?.start,
          cancelDeadline: first?.subtract(const Duration(hours: 24)),
          refundStatusLabel: pendingRefund ? 'Chờ duyệt hoàn tiền' : null,
        ),
      );
    }
    result.sort((a, b) => (a.nextSessionStart ?? DateTime(9999)).compareTo(b.nextSessionStart ?? DateTime(9999)));
    return result;
  });

  @override
  Future<List<CourseClass>> coachClasses() => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    return db.classes.where((c) => c.coachProfileId == coach.id).map(db.toCourse).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  @override
  Future<CoachClassDetail> coachClassDetail(String classId) =>
      _server.run(() => buildCoachClassDetail(_server, classId));

  @override
  Future<CourseClass> createClass(ClassDraft d) => _server.run(() {
    validateClassDraft(_server, d);
    final db = _server.db;
    final coach = _server.requireCoach();
    final row = ClassRow(
      id: db.nextId('cls'),
      name: d.name.trim(),
      description: d.description?.trim(),
      sportIds: d.sportIds,
      price: d.price,
      status: ClassStatus.pending,
      coachProfileId: coach.id,
      capacity: d.capacity,
      classType: d.classType,
      areaType: d.areaType,
      createdAt: db.now(),
    );
    db.classes.add(row);
    writeDraftSessions(_server, row.id, d);
    db.notifyManagers(
      'Khóa học chờ duyệt',
      '${db.user(coach.userId).fullName} vừa tạo khóa "${row.name}".',
      metadata: {'classId': row.id},
    );
    return db.toCourse(row);
  });

  @override
  Future<ClassDraft> draftOf(String classId) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final row = db.classRow(classId);
    if (row.coachProfileId != coach.id) throw const AppFailure.forbidden();
    final sessions = db.mainSessionsOf(classId);
    return ClassDraft(
      name: row.name,
      description: row.description,
      sportIds: List.of(row.sportIds),
      capacity: row.capacity,
      classType: row.classType,
      areaType: row.areaType,
      price: row.price,
      roomId: sessions.isEmpty ? db.rooms.first.id : sessions.first.roomId,
      sessions: [for (final s in sessions) DraftSession(s.start, s.end)],
    );
  });

  @override
  Future<CourseClass> resubmitClass(String classId, ClassDraft d) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final row = db.classRow(classId);
    if (row.coachProfileId != coach.id) throw const AppFailure.forbidden();
    if (row.status != ClassStatus.rejected && row.status != ClassStatus.pending) {
      throw const AppFailure.business('Chỉ sửa được khóa đang chờ duyệt hoặc bị từ chối.');
    }
    validateClassDraft(_server, d, ignoreClassId: classId);
    row
      ..name = d.name.trim()
      ..description = d.description?.trim()
      ..sportIds = d.sportIds
      ..price = d.price
      ..capacity = d.capacity
      ..classType = d.classType
      ..areaType = d.areaType
      ..status = ClassStatus.pending
      ..rejectReason = null;
    db.sessions.removeWhere((s) => s.classId == classId);
    writeDraftSessions(_server, classId, d);
    db.notifyManagers(
      'Khóa học gửi lại',
      '${db.user(coach.userId).fullName} đã sửa và gửi lại khóa "${row.name}".',
      metadata: {'classId': classId},
    );
    return db.toCourse(row);
  });
}
