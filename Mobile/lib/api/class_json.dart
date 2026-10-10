import '../core/network/api_client.dart';
import '../core/network/json.dart';
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
