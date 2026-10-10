import '../../../api/catalog_json.dart';
import '../../../api/class_json.dart';
import '../../../api/student_json.dart';
import '../../../core/data/paged.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/network/token_storage.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/coach_class.dart';
import '../domain/entities/course.dart';
import '../domain/repositories/course_repository.dart';

/// [CourseRepository] gọi BE thật — `classes`, `class-schedules`, `enrollments`, `payments`.
class CourseApiRepository implements CourseRepository {
  CourseApiRepository(this._api, this._tokens, {DateTime Function()? clock}) : _now = clock ?? DateTime.now;

  final ApiClient _api;
  final TokenStorage _tokens;
  final DateTime Function() _now;

  static const _pageSize = 8;

  /// Mọi buổi của khóa (`GET /class-schedules?classId=`), gắn thông tin khóa từ [cls].
  Future<List<ClassSession>> _sessionsOf(Json cls) async {
    final rows = await _api.getAll('/class-schedules', query: {'classId': cls.str('id')});
    return ClassJson.sessions(rows, classes: {cls.str('id'): cls});
  }

  @override
  Future<Paged<CourseClass>> browse(ClassQuery q) async {
    // BE-1: Guest xem được (không token ⇒ BE chỉ trả khóa đang mở bán). BE-12: kèm `summary`.
    final res = await _api.get(
      '/classes',
      query: {
        'page': q.page,
        'limit': _pageSize,
        'search': q.search.trim(),
        'fitness': q.sportId,
        'classType': q.classType,
        'areaType': q.areaType,
        'status': 'APPROVED',
        'isActive': 'true',
      },
    );
    return res.paged((c) => ClassJson.course(c), page: q.page, limit: _pageSize);
  }

  @override
  Future<CourseDetail> detail(String classId) async {
    // Guest (BE-1) xem được khóa & lộ trình nhưng `GET /class-schedules` cần đăng nhập ⇒ bỏ qua
    // phần đánh dấu "buổi dạy bù" (chỉ là nhãn phụ).
    final loggedIn = await _tokens.hasSession;
    final results = await Future.wait([
      _api.get('/classes/$classId'),
      _api.get('/classes/$classId/course-plan'),
      if (loggedIn) _api.getAll('/class-schedules', query: {'classId': classId}) else Future.value(<Json>[]),
    ]);
    final cls = (results[0] as ApiResponse).json;
    final plan = (results[1] as ApiResponse).json;
    final allSessions = ClassJson.sessions(results[2] as List<Json>, classes: {classId: cls});
    final course = ClassJson.course(cls);

    final makeupIds = {
      for (final s in allSessions)
        if (s.isMakeup) s.id,
    };
    final sessions = [
      for (final s in plan.objList('sessions'))
        PlanSession(
          id: s.str('id'),
          startTime: s.date('startTime'),
          endTime: s.date('endTime'),
          room: CatalogJson.room(s.obj('room')),
          bookedCount: s.integer('bookedCount'),
          capacity: course.capacity,
          isMakeup: makeupIds.contains(s.str('id')),
          mine: const {'BOOKED', 'COMPLETED'}.contains(s.strOrNull('myEnrollmentStatus')),
          conflictWith: s.objOrNull('conflictWith')?.strOrNull('className'),
        ),
    ];
    final slots = [
      for (final s in plan.objOrNull('course')?.objList('slots') ?? const <Json>[])
        CourseSlot(
          weekday: s.integer('weekday', 1),
          timeLabel: '${s.str('startTime')} – ${s.str('endTime')}',
          roomName: s.str('roomName'),
          sessionCount: s.integer('sessionCount'),
        ),
    ];
    return CourseDetail(
      course: course,
      slots: slots,
      sessions: sessions,
      purchase: _purchaseInfo(course, plan.objOrNull('registration')),
    );
  }

  /// BE-13: `registration.purchase` — đã mua / đang chờ thanh toán / chưa mua.
  static PurchaseInfo _purchaseInfo(CourseClass course, Json? registration) {
    if (registration == null) return PurchaseInfo.guest; // Guest / HLV / Quản lý.
    final purchase = registration.obj('purchase');
    // Hạn hủy khóa = buổi chính đầu tiên − 24h (đúng luật `POST /refunds/course-cancellation`).
    final deadline = course.firstSessionStart?.subtract(const Duration(hours: 24));
    switch (purchase.str('status')) {
      case 'PURCHASED':
        return PurchaseInfo(
          status: PurchaseStatus.purchased,
          cancelDeadline: deadline,
          hasPendingRefund: purchase.boolean('hasPendingRefund'),
        );
      case 'PENDING_PAYMENT':
        return PurchaseInfo(status: PurchaseStatus.pendingPayment, pendingPaymentId: purchase.strOrNull('paymentId'));
    }
    return PurchaseInfo(
      status: PurchaseStatus.none,
      blockers: [
        if (course.status != ClassStatus.approved)
          const PurchaseBlocker('CLASS_NOT_AVAILABLE', 'Khóa học hiện không mở bán.'),
        for (final b in registration.objList('blockers')) PurchaseBlocker(b.str('code'), b.str('message')),
      ],
    );
  }

  @override
  Future<List<MyCourse>> myCourses() async {
    final results = await Future.wait([
      _api.getAll('/enrollments/my'),
      _api.getAll('/attendance/my'),
      _api.getAll('/refunds/my'),
      _api.getAll('/payments/my', query: {'type': 'CLASS'}),
    ]);
    final enrollments = results[0];
    final attendance = results[1];
    final refunds = results[2];
    final payments = results[3];
    final now = _now();

    // Gom chỗ đã giữ theo khóa (bỏ khóa chỉ còn chỗ đã hủy — VD đã được hoàn tiền).
    final byClass = <String, List<Json>>{};
    for (final e in enrollments) {
      byClass.putIfAbsent(e.obj('schedule').str('classId'), () => []).add(e);
    }
    byClass.removeWhere((_, list) => list.every((e) => e.str('status') == 'CANCELLED'));

    final courses = await Future.wait(
      byClass.entries.map((entry) async {
        final classId = entry.key;
        final course = ClassJson.course((await _api.get('/classes/$classId')).json);
        final mine = entry.value;
        final booked =
            mine
                .where((e) => e.str('status') == 'BOOKED')
                .map((e) => e.obj('schedule'))
                .where((s) => s.date('endTime').isAfter(now))
                .toList()
              ..sort((a, b) => a.date('startTime').compareTo(b.date('startTime')));
        final attended = attendance
            .where((a) => a.obj('schedule').obj('class').str('id') == classId)
            .where((a) => const {'PRESENT', 'LATE'}.contains(a.str('status')))
            .length;
        final pending = refunds.any(
          (r) =>
              r.str('classId') == classId && r.str('reason') == 'MEMBER_CANCEL_COURSE' && r.str('status') == 'PENDING',
        );
        // BE-6: giao dịch thành công của khóa (số tiền & ngày mua thật).
        final payment = payments.where((p) => p.str('classId') == classId && p.str('status') == 'SUCCESS').firstOrNull;
        final first = course.firstSessionStart;
        final last = course.lastSessionEnd;
        final phase = course.status == ClassStatus.completed || (last != null && !now.isBefore(last))
            ? MyCoursePhase.ended
            : (first != null && now.isBefore(first) ? MyCoursePhase.upcoming : MyCoursePhase.ongoing);
        return MyCourse(
          course: course,
          phase: phase,
          purchasedAt:
              payment?.dateOrNull('paidAt') ??
              mine.map((e) => e.date('bookedAt')).reduce((a, b) => a.isBefore(b) ? a : b),
          amountPaid: payment?.money('amount') ?? course.price,
          attendedCount: attended,
          bookedCount: booked.length,
          totalSessions: course.mainSessionCount,
          nextSessionStart: booked.firstOrNull?.date('startTime'),
          cancelDeadline: first?.subtract(const Duration(hours: 24)),
          refundStatusLabel: pending ? 'Chờ duyệt hoàn tiền' : null,
        );
      }),
    );
    courses.sort((a, b) => (a.nextSessionStart ?? DateTime(9999)).compareTo(b.nextSessionStart ?? DateTime(9999)));
    return courses;
  }

  /// Doanh thu HLV theo khóa từ giao dịch ví (`DEPOSIT` đã hoàn tất — số thật BE ghi nhận).
  Future<Map<String, int>> _revenueByClass() async {
    final txs = await _api.getAll('/coaches/me/wallet/transactions', query: {'type': 'DEPOSIT', 'status': 'COMPLETED'});
    final map = <String, int>{};
    for (final t in txs) {
      final classId = t.strOrNull('classId');
      if (classId != null) map[classId] = (map[classId] ?? 0) + t.money('amount');
    }
    return map;
  }

  @override
  Future<List<CourseClass>> coachClasses() async {
    final results = await Future.wait([
      _api.getAll('/classes', query: {'createdByMe': 'true'}),
      _revenueByClass(),
    ]);
    final revenue = results[1] as Map<String, int>;
    return [for (final c in results[0] as List<Json>) ClassJson.course(c, coachRevenue: revenue[c.str('id')] ?? 0)]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  @override
  Future<CoachClassDetail> coachClassDetail(String classId) async {
    final results = await Future.wait([_api.get('/classes/$classId'), _api.get('/classes/$classId/students')]);
    final cls = (results[0]).json;
    final roster = (results[1]).json;
    final sessions = (await _sessionsOf(cls))..sort((a, b) => a.startTime.compareTo(b.startTime));
    // L12: học viên, chuyên cần và doanh thu đều là số liệu thật của BE.
    return CoachClassDetail(
      course: ClassJson.course(cls, coachRevenue: roster.money('coachRevenue')),
      sessions: sessions,
      students: [for (final s in roster.objList('students')) StudentJson.student(s)],
      grossRevenue: roster.money('grossRevenue'),
    );
  }

  Map<String, Object?> _planBody(ClassDraft d) => {
    'class': {
      'name': d.name.trim(),
      // L3: mỗi khóa MỘT bộ môn (`Class.fitness`).
      'fitness': d.sportIds.isEmpty ? '' : d.sportIds.first.trim(),
      if (d.description?.trim().isNotEmpty ?? false) 'description': d.description!.trim(),
      'capacity': d.capacity,
      'classType': beName(d.classType),
      'areaType': beName(d.areaType),
      'price': d.price,
    },
    'roomId': d.roomId,
    'schedules': [
      for (final s in d.sessions)
        {'startTime': s.start.toUtc().toIso8601String(), 'endTime': s.end.toUtc().toIso8601String()},
    ],
  };

  @override
  Future<CourseClass> createClass(ClassDraft d) async {
    // BE-10: lưu khóa PENDING kèm toàn bộ lịch buổi (giữ phòng, kiểm tra trùng lịch).
    final res = await _api.post('/class-schedules/activity-plan', body: _planBody(d));
    return ClassJson.course(res.json.obj('class'));
  }

  @override
  Future<ClassDraft> draftOf(String classId) async {
    final cls = (await _api.get('/classes/$classId')).json;
    final sessions = (await _sessionsOf(cls)).where((s) => !s.isMakeup).toList()
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
    final course = ClassJson.course(cls);
    var roomId = sessions.firstOrNull?.room.id;
    if (roomId == null) {
      final rooms = await _api.getAll('/rooms', query: {'isActive': 'true', 'areaType': cls.strOrNull('areaType')});
      roomId = rooms.firstOrNull?.str('id') ?? '';
    }
    return ClassDraft(
      name: course.name,
      description: cls.strOrNull('description'),
      sportIds: [for (final s in course.sports) s.id],
      capacity: course.capacity,
      classType: course.classType,
      areaType: course.areaType,
      price: course.price,
      roomId: roomId,
      sessions: [for (final s in sessions) DraftSession(s.startTime, s.endTime)],
    );
  }

  @override
  Future<CourseClass> resubmitClass(String classId, ClassDraft draft) async {
    // BE-3: thay thông tin + lịch, xóa lý do từ chối, quay về PENDING.
    final res = await _api.patch('/classes/$classId/resubmit', body: _planBody(draft));
    return ClassJson.course(res.json.obj('class'));
  }
}
