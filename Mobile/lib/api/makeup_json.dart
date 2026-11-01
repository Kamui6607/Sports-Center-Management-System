import '../core/network/api_client.dart';
import '../core/network/json.dart';
import '../features/makeup/domain/entities/makeup.dart';

/// Ánh xạ yêu cầu học bù — `/makeup-requests`, `transfer-options.makeupRequest`.
abstract final class MakeupJson {
  static MakeupSession session(Json s) => MakeupSession(
    id: s.str('id', s.str('scheduleId')),
    classId: s.str('classId'),
    className: s.str('className'),
    startTime: s.date('startTime'),
    endTime: s.date('endTime'),
    roomName: s.strOrNull('roomName'),
    isMakeupSlot: s.boolean('isMakeupSlot'),
  );

  static MakeupRequest request(Json r) {
    final m = r.obj('member');
    final target = r.objOrNull('targetSession');
    return MakeupRequest(
      id: r.str('id'),
      status: r.enumOr('status', MakeupStatus.values, MakeupStatus.pending),
      reason: r.str('reason'),
      requestedAt: r.date('requestedAt'),
      expiresAt: r.date('expiresAt'),
      memberProfileId: m.str('id'),
      memberName: m.str('fullName', 'Học viên'),
      memberAvatarUrl: ApiClient.absoluteUrl(m.strOrNull('avatarUrl')),
      paidClassId: r.str('paidClassId'),
      missedEnrollmentId: r.str('missedEnrollmentId'),
      missed: session(r.obj('missedSession')),
      target: target == null ? null : session(target),
      rejectReason: r.strOrNull('rejectReason'),
      refundEligible: r.boolean('refundEligible'),
      refundId: r.strOrNull('refundId'),
    );
  }

  static MakeupOption option(Json o) => MakeupOption(
    session: session(o),
    capacity: o.integer('capacity'),
    bookedCount: o.integer('bookedCount'),
    canSelect: o.boolean('canSelect'),
    isSameClass: o.boolean('isSameClass', true),
    isFull: o.boolean('isFull'),
    guestSeatsFull: o.boolean('guestSeatsFull'),
    conflictWith: o.objOrNull('conflictWith')?.strOrNull('className'),
  );
}
