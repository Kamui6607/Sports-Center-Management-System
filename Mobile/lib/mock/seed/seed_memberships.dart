import '../../features/membership/domain/entities/membership.dart';
import '../../features/payments/domain/entities/payment.dart';
import '../mock_tables.dart';
import 'seed_helpers.dart';

/// Gói thành viên (như `BE/prisma/seed.ts`) + thẻ mẫu:
/// - member@demo.vn — Gói 1 tháng còn 25 ngày
/// - trang.le@demo.vn — gói đã hết hạn
/// - member2@demo.vn — chưa có gói (thử mua)
void seedMemberships(Seeder s) {
  final db = s.db;
  db.membershipPlans.addAll([
    MembershipPlanRow(
      id: 'mbp-1m',
      name: 'Gói 1 tháng',
      durationDays: 30,
      price: 500000,
      description: 'Tập tự do không giới hạn trong 30 ngày.',
    ),
    MembershipPlanRow(
      id: 'mbp-3m',
      name: 'Gói 3 tháng',
      durationDays: 90,
      price: 1200000,
      description: 'Tiết kiệm 20% so với gói tháng.',
    ),
    MembershipPlanRow(
      id: 'mbp-6m',
      name: 'Gói 6 tháng',
      durationDays: 180,
      price: 2000000,
      description: 'Tiết kiệm hơn 30% so với gói tháng.',
    ),
  ]);

  void membership(String memberProfileId, String planId, DateTime start) {
    final plan = db.membershipPlans.firstWhere((p) => p.id == planId);
    final buyer = db.userOfMember(memberProfileId);
    final p = PaymentRow(
      id: 'pay-$planId-$memberProfileId',
      userId: buyer.id,
      memberProfileId: memberProfileId,
      amount: plan.price,
      status: PaymentStatus.success,
      orderCode: 'PULSE${planId.hashCode.abs() % 100000}${memberProfileId.hashCode.abs() % 1000}',
      createdAt: start.subtract(const Duration(minutes: 3)),
      expiresAt: start.add(const Duration(minutes: 12)),
      membershipPlanId: planId,
      paidAt: start,
    );
    db.payments.add(p);
    s.invoice(p, plan.name, CheckoutPurpose.membership);
    final end = start.add(Duration(days: plan.durationDays));
    db.memberships.add(
      MembershipRow(
        id: 'ms-$planId-$memberProfileId',
        memberProfileId: memberProfileId,
        planId: planId,
        paymentId: p.id,
        startDate: start,
        endDate: end,
        status: end.isAfter(db.now()) ? MembershipStatus.active : MembershipStatus.expired,
      ),
    );
  }

  final now = db.now();
  membership('mp-1', 'mbp-1m', now.subtract(const Duration(days: 5)));
  membership('mp-3', 'mbp-1m', now.subtract(const Duration(days: 40)));
}
