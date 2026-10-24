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
  );

  static Membership _membership(Json m) => Membership(
    id: m.str('id'),
    plan: _plan(m.obj('plan')),
    startDate: m.date('startDate'),
    endDate: m.date('endDate'),
    status: m.enumOr('status', MembershipStatus.values, MembershipStatus.expired),
    daysLeft: m.integer('daysLeft'),
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
  Future<MembershipVerifyResult> verify(String userId) async {
    final j = (await _api.get('/memberships/verify/${Uri.encodeComponent(userId)}')).json;
    final user = j.obj('user');
    final m = j.objOrNull('membership');
    return MembershipVerifyResult(
      userId: user.str('id'),
      fullName: user.str('fullName'),
      avatarUrl: user.strOrNull('avatarUrl'),
      isActive: j.boolean('isActive'),
      status: m?.enumOrNull('status', MembershipStatus.values),
      planName: m?.strOrNull('planName'),
      endDate: m?.dateOrNull('endDate'),
      daysLeft: m?.integer('daysLeft') ?? 0,
    );
  }
}
