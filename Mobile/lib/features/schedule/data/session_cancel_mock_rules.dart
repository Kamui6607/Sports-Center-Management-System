// Luật BE giả khi HLV hủy buổi có học viên (`POST /class-schedules/:id/cancel`) — CHỈ dùng trong mock.

import '../../../core/error/app_failure.dart';
import '../../../core/utils/money.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../../refunds/domain/entities/refund.dart';
import '../domain/entities/session.dart';

/// MAKEUP: tạo buổi dạy bù (kiểm tra trùng phòng / lịch HLV / lịch học viên), chuyển chỗ của
/// học viên sang buổi bù và thông báo.
ClassSession scheduleMakeupSession(
  MockDatabase db,
  SessionRow s,
  ClassRow cls,
  List<EnrollmentRow> booked,
  CancelSessionInput input,
  String? reason,
) {
  final now = db.now();
  final start = input.makeupStart, end = input.makeupEnd;
  if (start == null || end == null || !end.isAfter(start)) {
    throw const AppFailure.validation('Giờ buổi dạy bù không hợp lệ.');
  }
  if (!start.isAfter(now)) throw const AppFailure.validation('Buổi dạy bù phải ở tương lai.');
  final roomId = input.makeupRoomId ?? s.roomId;
  final clash = db.sessions
      .where(
        (o) =>
            o.id != s.id &&
            o.status == ScheduleStatus.scheduled &&
            o.start.isBefore(end) &&
            start.isBefore(o.end) &&
            (o.roomId == roomId || db.classRow(o.classId).coachProfileId == cls.coachProfileId),
      )
      .firstOrNull;
  if (clash != null) {
    throw AppFailure.conflict(
      'Trùng lịch với "${db.classRow(clash.classId).name}" (${VnTime.sessionLabel(clash.start, clash.end)}).',
      code: 'SCHEDULE_CONFLICT',
    );
  }
  final memberClash = booked
      .where(
        (e) => db.enrollments.any(
          (o) =>
              o.memberProfileId == e.memberProfileId &&
              o.status == EnrollmentStatus.booked &&
              o.sessionId != s.id &&
              db.session(o.sessionId).start.isBefore(end) &&
              start.isBefore(db.session(o.sessionId).end),
        ),
      )
      .firstOrNull;
  if (memberClash != null) {
    throw AppFailure.conflict(
      'Học viên ${db.userOfMember(memberClash.memberProfileId).fullName} bị trùng lịch vào giờ dạy bù.',
      code: 'MEMBER_SCHEDULE_CONFLICT',
    );
  }
  final makeup = SessionRow(
    id: '${s.id}-bu',
    classId: s.classId,
    roomId: roomId,
    start: start,
    end: end,
    makeupForId: s.id,
  );
  db.sessions.add(makeup);
  for (final e in booked) {
    e.sessionId = makeup.id;
    db.notify(
      db.userOfMember(e.memberProfileId).id,
      NotificationType.scheduleCancelled,
      'Buổi học được dạy bù',
      'Buổi ${VnTime.sessionLabel(s.start, s.end)} của "${cls.name}" bị hủy, dạy bù vào ${VnTime.sessionLabel(start, end)}.',
      metadata: {'scheduleId': makeup.id, 'classId': cls.id},
      reason: reason,
    );
  }
  return db.toSession(makeup);
}

/// REFUND: hủy chỗ của học viên, tạo yêu cầu hoàn tiền (giá ÷ số buổi chính) chờ Quản lý duyệt.
/// Trả về số yêu cầu hoàn tiền đã tạo.
int refundCancelledSession(MockDatabase db, SessionRow s, ClassRow cls, List<EnrollmentRow> booked, String? reason) {
  final now = db.now();
  var refundCount = 0;
  final mainCount = db.mainSessionsOf(cls.id).length;
  final wallet = db.walletOf(cls.coachProfileId);
  for (final e in booked) {
    final payment = db.coursePayment(e.memberProfileId, cls.id);
    if (payment != null) {
      final remaining = payment.amount - db.refundedOf(payment.id);
      final amount = (cls.price ~/ mainCount).clamp(0, remaining);
      if (amount > 0) {
        db.refunds.add(
          RefundRow(
            id: db.nextId('rf'),
            paymentId: payment.id,
            memberProfileId: e.memberProfileId,
            classId: cls.id,
            scheduleId: s.id,
            reason: RefundReason.sessionCancelled,
            amount: amount,
            coachDebitAmount: (amount * MockDatabase.coachShare).round(),
            walletId: wallet.id,
            createdAt: now,
          ),
        );
        refundCount++;
      }
    }
    e
      ..status = EnrollmentStatus.cancelled
      ..cancelledAt = now;
    db.notify(
      db.userOfMember(e.memberProfileId).id,
      NotificationType.scheduleCancelled,
      'Buổi học bị hủy',
      'Buổi ${VnTime.sessionLabel(s.start, s.end)} của "${cls.name}" bị hủy. Bạn sẽ được hoàn ${Money.format(cls.price ~/ mainCount)} sau khi Quản lý duyệt.',
      metadata: {'scheduleId': s.id, 'classId': cls.id},
      reason: reason,
    );
  }
  db.notifyManagers(
    'Yêu cầu hoàn tiền mới',
    '$refundCount yêu cầu hoàn tiền do hủy buổi "${cls.name}".',
    metadata: {'classId': cls.id},
  );
  return refundCount;
}
