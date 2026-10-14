import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/membership/data/membership_mock_repository.dart';
import 'package:sports_center_mobile/features/membership/domain/entities/membership.dart';
import 'package:sports_center_mobile/features/payments/data/payment_mock_repository.dart';
import 'package:sports_center_mobile/features/payments/domain/entities/payment.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// Gói thành viên: mua qua VietQR ⇒ cấp thẻ, cộng dồn, HLV quét kiểm tra.
void main() {
  late MockServer server;
  late AuthMockRepository auth;
  late MembershipMockRepository memberships;

  setUp(() {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    server.settings.autoConfirmPayments = false;
    auth = AuthMockRepository(server);
    memberships = MembershipMockRepository(server);
  });

  Future<void> login(String email) => auth.login(email, kDemoPassword);

  test('gói đang bán sắp theo giá tăng dần', () async {
    await login('member2@demo.vn');
    final plans = await memberships.listPlans();
    expect(plans.map((p) => p.price), [500000, 1200000, 2000000]);
  });

  test('mua gói ⇒ chỉ cấp thẻ khi SePay xác nhận đã thu tiền', () async {
    await login('member2@demo.vn');
    expect(await memberships.myMembership(), isNull);

    final paymentId = await memberships.purchase('mbp-1m');
    expect(await memberships.purchase('mbp-3m'), paymentId, reason: 'còn giao dịch chờ ⇒ dùng lại');
    final payments = PaymentMockRepository(server);
    final pending = await payments.checkout(paymentId);
    expect(pending.purpose, CheckoutPurpose.membership);
    expect(pending.title, 'Gói 1 tháng');
    expect(await memberships.myMembership(), isNull);

    final paid = await payments.simulatePaid(paymentId);
    expect(paid.status, PaymentStatus.success);
    final m = await memberships.myMembership();
    expect(m?.status, MembershipStatus.active);
    expect(m?.daysLeft, 30);
  });

  test('mua thêm khi còn hạn ⇒ cộng dồn sau ngày hết hạn', () async {
    await login('member@demo.vn');
    final before = (await memberships.myMembership())!;
    expect(before.daysLeft, 25);
    final paymentId = await memberships.purchase('mbp-1m');
    await PaymentMockRepository(server).simulatePaid(paymentId);
    final after = (await memberships.myMembership())!;
    expect(after.endDate, before.endDate.add(const Duration(days: 30)));
    expect(after.daysLeft, 55);
  });

  test('HLV quét QR: còn hạn / hết hạn / chưa có gói', () async {
    await login('coach@demo.vn');
    final active = await memberships.verify('u-m1');
    expect(active.isActive, isTrue);
    expect(active.daysLeft, 25);
    final expired = await memberships.verify('u-m3');
    expect(expired.isActive, isFalse);
    expect(expired.status, MembershipStatus.expired);
    final none = await memberships.verify('u-m2');
    expect(none.isActive, isFalse);
    expect(none.status, isNull);
    await expectLater(memberships.verify('khong-ton-tai'), throwsA(isA<AppFailure>()));
  });

  test('hội viên không được quét thẻ người khác', () async {
    await login('member@demo.vn');
    await expectLater(memberships.verify('u-m2'), throwsA(isA<AppFailure>()));
  });
}
