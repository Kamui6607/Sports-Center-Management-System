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
  );

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
  Future<MembershipVerifyResult> verify(String userId) => _server.run(() {
    final db = _server.db;
    final me = _server.requireUser();
    if (me.role == UserRole.member) throw const AppFailure.forbidden();
    final u = db.users.where((x) => x.id == userId).firstOrNull;
    if (u == null) throw const AppFailure.notFound('Không tìm thấy người dùng.');
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
    );
  });
}
