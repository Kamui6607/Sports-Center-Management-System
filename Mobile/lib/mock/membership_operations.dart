import '../core/utils/money.dart';
import '../features/membership/domain/entities/membership.dart';
import '../features/notifications/domain/entities/app_notification.dart';
import 'mock_database.dart';
import 'mock_tables.dart';

/// Nghiệp vụ gói thành viên (mô phỏng `BE/src/modules/memberships/memberships.service.ts`).
extension MembershipOperations on MockDatabase {
  MembershipPlanRow? membershipPlan(String id) => membershipPlans.where((p) => p.id == id).firstOrNull;

  /// Đánh dấu EXPIRED cho gói ACTIVE đã quá hạn.
  void expireMemberships() {
    final t = now();
    for (final m in memberships.where((m) => m.status == MembershipStatus.active && !m.endDate.isAfter(t))) {
      m.status = MembershipStatus.expired;
    }
  }

  /// Gói đang hiệu lực xa nhất (đã gồm cộng dồn) của hội viên.
  MembershipRow? currentMembership(String memberProfileId) {
    expireMemberships();
    final list = memberships
        .where((m) => m.memberProfileId == memberProfileId && m.status == MembershipStatus.active)
        .toList();
    if (list.isEmpty) return null;
    list.sort((a, b) => b.endDate.compareTo(a.endDate));
    return list.first;
  }

  /// Gói đã hết hạn gần nhất của hội viên.
  MembershipRow? recentExpiredMembership(String memberProfileId) {
    final list = memberships
        .where((m) => m.memberProfileId == memberProfileId && m.status == MembershipStatus.expired)
        .toList();
    if (list.isEmpty) return null;
    list.sort((a, b) => b.endDate.compareTo(a.endDate));
    return list.first;
  }

  /// Số ngày còn lại (làm tròn lên) tới [endDate].
  int membershipDaysLeft(DateTime endDate) {
    final ms = endDate.difference(now()).inMilliseconds;
    return ms <= 0 ? 0 : (ms / Duration.millisecondsPerDay).ceil();
  }

  /// SePay xác nhận giao dịch mua gói ⇒ tạo Membership (cộng dồn khi còn gói ACTIVE) + thông báo.
  void activateMembership(PaymentRow p) {
    final plan = membershipPlan(p.membershipPlanId!)!;
    final memberId = p.memberProfileId!;
    final latest = currentMembership(memberId);
    final start = latest?.endDate ?? now();
    final m = MembershipRow(
      id: nextId('ms'),
      memberProfileId: memberId,
      planId: plan.id,
      paymentId: p.id,
      startDate: start,
      endDate: start.add(Duration(days: plan.durationDays)),
    );
    memberships.add(m);
    notify(
      p.userId,
      NotificationType.paymentSuccess,
      'Mua gói thành viên thành công',
      'Bạn đã thanh toán ${Money.format(p.amount)} cho "${plan.name}".',
      metadata: {'paymentId': p.id, 'membershipId': m.id},
    );
  }
}
