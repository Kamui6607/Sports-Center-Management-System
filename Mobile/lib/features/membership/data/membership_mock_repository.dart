import '../../../core/error/app_failure.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../payments/domain/entities/payment.dart';
import '../domain/entities/membership.dart';
import '../domain/repositories/membership_repository.dart';

/// Mock theo `BE/src/modules/memberships`.
class MembershipMockRepository implements MembershipRepository {
  MembershipMockRepository(this._server);

  final MockServer _server;

  static MembershipPlan _plan(MembershipPlanRow p) =>
      MembershipPlan(id: p.id, name: p.name, durationDays: p.durationDays, price: p.price, description: p.description);

  Membership _membership(MockDatabase db, MembershipRow m) => Membership(
    id: m.id,
    plan: _plan(db.membershipPlan(m.planId)!),
    startDate: m.startDate,
    endDate: m.endDate,
    status: m.status,
    daysLeft: m.status == MembershipStatus.active ? db.membershipDaysLeft(m.endDate) : 0,
    isQueued: m.status == MembershipStatus.active && m.startDate.isAfter(db.now()),
    paidAmount: db.payments.where((p) => p.id == m.paymentId).firstOrNull?.amount,
    paymentId: m.paymentId,
  );

  /// Mã thẻ mock: `MOCKPASS:<userId>:<hết hạn epoch ms>` (BE thật dùng JWT 60 giây).
  static const _passPrefix = 'MOCKPASS:';

  @override
  Future<List<MembershipPlan>> listPlans() => _server.run(() {
    _server.requireUser();
    return (_server.db.membershipPlans.where((p) => p.isActive).toList()..sort((a, b) => a.price.compareTo(b.price)))
        .map(_plan)
        .toList();
  });

  @override
  Future<String> purchase(String planId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final plan = db.membershipPlan(planId);
    if (plan == null || !plan.isActive) {
      throw const AppFailure.notFound('Gói thành viên không tồn tại hoặc đã ngừng bán.');
    }
    // Còn giao dịch mua gói chưa hết hạn ⇒ tiếp tục giao dịch đó (BE trả 409 kèm QR cũ).
    final t = db.now();
    final pending = db.payments
        .where(
          (p) =>
              p.memberProfileId == member.id &&
              p.membershipPlanId != null &&
              p.status == PaymentStatus.pending &&
              t.isBefore(p.expiresAt),
        )
        .firstOrNull;
    if (pending != null) return pending.id;
    return db
        .createPendingPayment(
          userId: member.userId,
          memberProfileId: member.id,
          amount: plan.price,
          membershipPlanId: plan.id,
        )
        .id;
  });

  @override
  Future<Membership?> myMembership() => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final member = db.memberOfUser(u.id);
    if (member == null) return null;
    final m = db.currentMembership(member.id);
    return m == null ? null : _membership(db, m);
  });

  @override
  Future<MembershipOverview> overview() => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final member = db.memberOfUser(u.id);
    if (member == null) return MembershipOverview.empty;
    db.expireMemberships();
    final t = db.now();
    final live =
        db.memberships
            .where((m) => m.memberProfileId == member.id && m.status == MembershipStatus.active && m.endDate.isAfter(t))
            .toList()
          ..sort((a, b) => a.startDate.compareTo(b.startDate));
    final current = live.where((m) => !m.startDate.isAfter(t)).firstOrNull;
    final queued = live.where((m) => m.startDate.isAfter(t)).toList();
    final until = live.isEmpty ? null : live.map((m) => m.endDate).reduce((a, b) => a.isAfter(b) ? a : b);
    final expired = db.recentExpiredMembership(member.id);
    return MembershipOverview(
      current: current == null ? null : _membership(db, current),
      queued: [for (final m in queued) _membership(db, m)],
      validUntil: until,
      totalDaysLeft: until == null ? 0 : db.membershipDaysLeft(until),
      recentExpired: expired == null ? null : _membership(db, expired),
      canQueueMore: queued.length < 3,
    );
  });

  @override
  Future<List<Membership>> history() => _server.run(() {
    final db = _server.db;
    final member = db.memberOfUser(_server.requireUser().id);
    if (member == null) return const <Membership>[];
    final rows = db.memberships.where((m) => m.memberProfileId == member.id).toList()
      ..sort((a, b) => b.startDate.compareTo(a.startDate));
    return [for (final m in rows) _membership(db, m)];
  });

  @override
  Future<MemberPass> pass() => _server.run(() {
    final db = _server.db;
    final u = _server.requireMember();
    final expiresAt = db.now().add(const Duration(seconds: 60));
    return MemberPass(
      token: '$_passPrefix${u.userId}:${expiresAt.millisecondsSinceEpoch}',
      expiresAt: expiresAt,
      isActive: db.currentMembership(u.id) != null,
    );
  });

  @override
  Future<MembershipVerifyResult> verifyPass(String token) => _server.run(() {
    final db = _server.db;
    final me = _server.requireUser();
    if (me.role == UserRole.member) throw const AppFailure.forbidden();
    // Nút DEV ở màn quét gửi thẳng userId; mã thật dạng MOCKPASS:<userId>:<hạn>.
    var userId = token;
    if (token.startsWith(_passPrefix)) {
      final parts = token.substring(_passPrefix.length).split(':');
      final exp = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
      if (DateTime.fromMillisecondsSinceEpoch(exp).isBefore(db.now())) {
        throw const AppFailure.validation('Mã thẻ đã hết hạn. Nhờ hội viên mở lại thẻ trên ứng dụng.');
      }
      userId = parts.first;
    }
    return _verify(db, userId);
  });

  MembershipVerifyResult _verify(MockDatabase db, String userId) {
    final u = db.users.where((x) => x.id == userId).firstOrNull;
    if (u == null) throw const AppFailure.validation('Mã thẻ không hợp lệ.');
    final member = db.memberOfUser(u.id);
    final active = member == null ? null : db.currentMembership(member.id);
    final shown = active ?? (member == null ? null : db.recentExpiredMembership(member.id));
    return MembershipVerifyResult(
      userId: u.id,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      isActive: active != null,
      status: shown?.status,
      planName: shown == null ? null : db.membershipPlan(shown.planId)!.name,
      endDate: shown?.endDate,
      daysLeft: active == null ? 0 : db.membershipDaysLeft(active.endDate),
      reason: active != null
          ? 'Gói thành viên còn hiệu lực.'
          : (shown == null ? 'Hội viên chưa có gói thành viên.' : 'Gói đã hết hạn.'),
      entriesToday: active == null ? 0 : 1,
    );
  }
}
