import '../../../api/payment_json.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/membership.dart';
import '../domain/repositories/membership_repository.dart';

/// [MembershipRepository] gọi BE thật — module `memberships`.
class MembershipApiRepository implements MembershipRepository {
  MembershipApiRepository(this._api);

  final ApiClient _api;

  static MembershipPlan _plan(Json p) => MembershipPlan(
    id: p.str('id'),
    name: p.str('name'),
    durationDays: p.integer('durationDays'),
    price: p.money('price'),
    description: p.strOrNull('description'),
    benefits: p.strList('benefits'),
    isFeatured: p.boolean('isFeatured'),
    pricePer30Days: p.intOrNull('pricePer30Days'),
  );

  static Membership _membership(Json m) => Membership(
    id: m.str('id'),
    plan: _plan(m.obj('plan')),
    startDate: m.date('startDate'),
    endDate: m.date('endDate'),
    status: m.enumOr('status', MembershipStatus.values, MembershipStatus.expired),
    daysLeft: m.integer('daysLeft'),
    isQueued: m.boolean('isQueued'),
    totalDays: m.intOrNull('totalDays'),
    paidAmount: m['paidAmount'] == null ? null : m.money('paidAmount'),
    cancelReason: m.strOrNull('cancelReason'),
    paymentId: m.strOrNull('paymentId'),
  );

  @override
  Future<List<MembershipPlan>> listPlans() async => (await _api.get('/membership-plans')).list.map(_plan).toList();

  @override
  Future<String> purchase(String planId) async {
    try {
      final res = await _api.post('/memberships/purchase', body: {'planId': planId});
      return res.json.str('paymentId');
    } on AppFailure catch (f) {
      // Còn giao dịch mua gói chưa hết hạn ⇒ tiếp tục thanh toán giao dịch đó.
      final pending = PaymentJson.pendingCheckout(f);
      if (pending != null) return pending.paymentId;
      rethrow;
    }
  }

  @override
  Future<Membership?> myMembership() async {
    final m = (await _api.get('/memberships/my')).json.objOrNull('membership');
    return m == null ? null : _membership(m);
  }

  @override
  Future<MembershipOverview> overview() async {
    final j = (await _api.get('/memberships/my')).json;
    final current = j.objOrNull('current');
    final expired = j.objOrNull('recentExpired');
    return MembershipOverview(
      current: current == null ? null : _membership(current),
      queued: j.objList('queued').map(_membership).toList(),
      validUntil: j.dateOrNull('validUntil'),
      totalDaysLeft: j.integer('totalDaysLeft'),
      recentExpired: expired == null ? null : _membership(expired),
      canQueueMore: j.boolean('canQueueMore', true),
    );
  }

  @override
  Future<List<Membership>> history() async =>
      (await _api.get('/memberships/my/history')).list.map(_membership).toList();

  @override
  Future<MemberPass> pass() async {
    final j = (await _api.get('/memberships/my/pass')).json;
    return MemberPass(
      token: j.str('token'),
      expiresAt: j.dateOrNull('expiresAt') ?? DateTime.now().add(Duration(seconds: j.integer('expiresIn', 60))),
      isActive: j.boolean('isActive'),
    );
  }

  @override
  Future<MembershipVerifyResult> verifyPass(String token) async {
    final j = (await _api.post('/memberships/pass/verify', body: {'token': token})).json;
    final member = j.obj('member');
    final m = j.objOrNull('membership');
    final valid = j.boolean('valid');
    return MembershipVerifyResult(
      userId: member.str('userId'),
      fullName: member.str('fullName'),
      avatarUrl: ApiClient.absoluteUrl(member.strOrNull('avatarUrl')),
      isActive: valid,
      status: valid ? MembershipStatus.active : (m == null ? null : MembershipStatus.expired),
      planName: m?.strOrNull('planName'),
      endDate: j.dateOrNull('validUntil') ?? m?.dateOrNull('endDate'),
      daysLeft: j.integer('totalDaysLeft'),
      reason: j.strOrNull('reason'),
      entriesToday: j.integer('entriesToday'),
    );
  }
}
