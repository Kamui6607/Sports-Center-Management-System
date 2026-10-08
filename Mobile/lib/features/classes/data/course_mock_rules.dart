// Luật BE giả cho khóa học (Member mua khóa, HLV tạo / gửi lại khóa) — CHỈ dùng trong mock.

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

/// Chi tiết khóa phía HLV (học viên, chuyên cần, doanh thu) — dùng chung cho Coach và Manager.
CoachClassDetail buildCoachClassDetail(MockServer server, String classId) {
  final db = server.db;
  final u = server.requireUser();
  final row = db.classes.where((c) => c.id == classId).firstOrNull;
  if (row == null) throw const AppFailure.notFound('Khóa học không tồn tại.');
  final isOwner = db.coachOfUser(u.id)?.id == row.coachProfileId;
  if (!isOwner && u.role != UserRole.manager) throw const AppFailure.forbidden();
  final now = db.now();
  final sessions = db.sessionsOf(classId);
  final pastIds = sessions
      .where(
        (s) => s.status == ScheduleStatus.completed || (s.status == ScheduleStatus.scheduled && s.end.isBefore(now)),
      )
      .map((s) => s.id)
      .toSet();
  final students = [
    for (final mpId in db.studentsOf(classId))
      () {
        final mp = db.memberProfile(mpId);
        final user = db.user(mp.userId);
        final enrolledPast = db.enrollments
            .where(
              (e) =>
                  e.memberProfileId == mpId && pastIds.contains(e.sessionId) && e.status != EnrollmentStatus.cancelled,
            )
            .length;
        final attended = db.attendance
            .where(
              (a) =>
                  a.memberProfileId == mpId &&
                  pastIds.contains(a.sessionId) &&
                  (a.status == AttendanceStatus.present || a.status == AttendanceStatus.late),
            )
            .length;
        return StudentSummary(
          memberProfileId: mpId,
          userId: user.id,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          email: user.email,
          phone: user.phone,
          trainingLevel: mp.trainingLevel,
          fitnessGoal: mp.fitnessGoal,
          trainingPreference: mp.trainingPreference,
          attendedCount: attended,
          pastSessionCount: enrolledPast,
        );
      }(),
  ]..sort((a, b) => a.fullName.compareTo(b.fullName));
  return CoachClassDetail(
    course: db.toCourse(row),
    sessions: sessions.map(db.toSession).toList(),
    students: students,
    grossRevenue: db.payments
        .where((p) => p.classId == classId && p.status == PaymentStatus.success)
        .fold(0, (s, p) => s + p.amount),
  );
}

/// Kiểm tra bản nháp khóa học như BE: trường bắt buộc, phòng, buổi trùng giờ / trùng phòng / trùng lịch HLV.
void validateClassDraft(MockServer server, ClassDraft d, {String? ignoreClassId}) {
  final db = server.db;
  final coach = server.requireCoach();
  final errors = <String, String>{};
  if (d.name.trim().length < 2) errors['name'] = 'Tên khóa tối thiểu 2 ký tự';
  if (d.sportIds.isEmpty) errors['sportIds'] = 'Chọn ít nhất 1 bộ môn';
  if (d.capacity < 1 || d.capacity > 200) errors['capacity'] = 'Sức chứa từ 1 đến 200';
  if (d.price < 0) errors['price'] = 'Giá không hợp lệ';
  if (errors.isNotEmpty) throw AppFailure.validation('Thông tin khóa học chưa hợp lệ.', fieldErrors: errors);
  if (d.sessions.isEmpty) throw const AppFailure.validation('Khóa học cần ít nhất 1 buổi.');
  final room = db.room(d.roomId);
  if (room.areaType != d.areaType) {
    throw const AppFailure.validation('Phòng tập không thuộc khu vực của khóa học.');
  }
  if (room.capacity < d.capacity) {
    throw AppFailure.validation('Phòng "${room.name}" chỉ chứa tối đa ${room.capacity} người.');
  }
  final now = db.now();
  final sorted = [...d.sessions]..sort((a, b) => a.start.compareTo(b.start));
  for (var i = 0; i < sorted.length; i++) {
    final s = sorted[i];
    if (!s.end.isAfter(s.start)) throw const AppFailure.validation('Giờ kết thúc phải sau giờ bắt đầu.');
    if (!s.start.isAfter(now)) throw const AppFailure.validation('Không thể tạo buổi trong quá khứ.');
    if (i > 0 && s.start.isBefore(sorted[i - 1].end)) {
      throw const AppFailure.validation('Các buổi trong lịch không được chồng giờ nhau.');
    }
    final clash = db.sessions
        .where(
          (o) =>
              o.classId != ignoreClassId &&
              o.status == ScheduleStatus.scheduled &&
              o.start.isBefore(s.end) &&
              s.start.isBefore(o.end) &&
              (o.roomId == d.roomId || db.classRow(o.classId).coachProfileId == coach.id),
        )
        .firstOrNull;
    if (clash != null) {
      final why = clash.roomId == d.roomId ? 'phòng ${room.name} đã có lớp' : 'bạn đã có lịch dạy';
      throw AppFailure.conflict(
        'Buổi ${VnTime.sessionLabel(s.start, s.end)} bị trùng: $why "${db.classRow(clash.classId).name}".',
        code: 'SCHEDULE_CONFLICT',
      );
    }
  }
}

/// Ghi các buổi của bản nháp vào bảng buổi học (id `<classId>-s<n>` theo thứ tự thời gian).
void writeDraftSessions(MockServer server, String classId, ClassDraft d) {
  final db = server.db;
  final sorted = [...d.sessions]..sort((a, b) => a.start.compareTo(b.start));
  for (var i = 0; i < sorted.length; i++) {
    db.sessions.add(
      SessionRow(
        id: '$classId-s${i + 1}',
        classId: classId,
        roomId: d.roomId,
        start: sorted[i].start,
        end: sorted[i].end,
      ),
    );
  }
}

/// Tình trạng mua khóa của Member: đã mua / đang chờ thanh toán / các lý do chặn (như BE trả về).
PurchaseInfo coursePurchaseInfo(MockServer server, ClassRow row, String memberProfileId, List<PlanSession> sessions) {
  final db = server.db;
  final paid = db.coursePayment(memberProfileId, row.id);
  if (paid != null) {
    final first = db.mainSessionsOf(row.id).where((s) => s.status != ScheduleStatus.cancelled).firstOrNull;
    return PurchaseInfo(
      status: PurchaseStatus.purchased,
      cancelDeadline: first?.start.subtract(const Duration(hours: 24)),
      hasPendingRefund: db.refunds.any(
        (r) =>
            r.paymentId == paid.id && r.reason == RefundReason.memberCancelCourse && r.status == RefundStatus.pending,
      ),
    );
  }
  final pending = db.pendingCoursePayment(memberProfileId, row.id);
  if (pending != null) return PurchaseInfo(status: PurchaseStatus.pendingPayment, pendingPaymentId: pending.id);

  final blockers = <PurchaseBlocker>[];
  final now = db.now();
  if (row.status != ClassStatus.approved) {
    blockers.add(const PurchaseBlocker('CLASS_NOT_AVAILABLE', 'Khóa học hiện không mở bán.'));
  } else if (sessions.isEmpty) {
    blockers.add(const PurchaseBlocker('NO_UPCOMING_SESSIONS', 'Khóa học không còn buổi nào sắp diễn ra.'));
  }
  if (sessions.any((s) => s.isFull)) {
    blockers.add(const PurchaseBlocker('CLASS_FULL', 'Khóa học đã kín chỗ ở một số buổi.'));
  }
  final conflicts = sessions.where((s) => s.conflictWith != null).toList();
  if (conflicts.isNotEmpty) {
    blockers.add(
      PurchaseBlocker(
        'SCHEDULE_CONFLICT',
        '${conflicts.length} buổi trùng giờ với khóa "${conflicts.first.conflictWith}" bạn đang học.',
      ),
    );
  }
  final penalty = db.penalties
      .where(
        (p) =>
            p.memberProfileId == memberProfileId &&
            p.classId == row.id &&
            p.status == PenaltyStatus.applied &&
            (p.blockedUntil?.isAfter(now) ?? false),
      )
      .firstOrNull;
  if (penalty != null) {
    blockers.add(
      PurchaseBlocker(
        'ATTENDANCE_PENALTY_ACTIVE',
        'Bạn đang bị phạt chuyên cần ở khóa này đến ${VnTime.date(penalty.blockedUntil!)}.',
      ),
    );
  }
  return PurchaseInfo(status: PurchaseStatus.none, blockers: blockers);
}
