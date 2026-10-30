import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/coach/domain/entities/wallet.dart';
import 'package:sports_center_mobile/features/term/data/coach_term_mock_repository.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/mock_tables.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// Check-in phòng gym của HLV (mock): ngày miễn phí, vượt hạn mức, trừ ví, ghi nợ, quét lại trong ngày.
void main() {
  late MockServer server;
  late AuthMockRepository auth;
  late CoachTermMockRepository terms;

  setUp(() {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    auth = AuthMockRepository(server);
    terms = CoachTermMockRepository(server);
  });

  const qr = '${CoachTermMockRepository.qrPrefix}abc';

  Future<String> loginCoach() async {
    await auth.login('coach@demo.vn', kDemoPassword);
    return server.db.coachOfUser(server.requireUser().id)!.id;
  }

  /// Dựng sẵn [days] ngày đã dùng trong tháng hiện tại (ngày trước hôm nay giả lập bằng dayKey khác).
  void seedUsed(String coachId, int days, {required bool free}) {
    final db = server.db;
    final month = '${db.now().year}-${db.now().month.toString().padLeft(2, '0')}';
    for (var i = 0; i < days; i++) {
      db.coachCheckIns.add(
        CoachCheckInRow(
          id: db.nextId('seed-ci'),
          coachProfileId: coachId,
          dayKey: '$month-x$i',
          monthKey: month,
          checkedInAt: db.now(),
          dayIndex: i + 1,
          free: free,
          feeAssessed: free ? 0 : 20000,
          feeCharged: free ? 0 : 20000,
          feeDebt: 0,
        ),
      );
    }
  }

  test('QR sai ⇒ lỗi CHECKIN_QR_INVALID; Member không check-in được', () async {
    await loginCoach();
    expect(
      () => terms.checkIn('khong-phai-ma'),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'CHECKIN_QR_INVALID')),
    );
    await auth.login('member@demo.vn', kDemoPassword);
    expect(() => terms.checkIn(qr), throwsA(isA<AppFailure>()));
    expect(() => terms.myCheckIns(), throwsA(isA<AppFailure>()));
  });

  test('quét lần đầu ⇒ ghi 1 ngày; quét lại trong ngày ⇒ không tính thêm', () async {
    await loginCoach();
    final before = await terms.myCheckIns();
    expect(before.usage.daysUsed, 0);
    expect(before.usage.checkedInToday, isFalse);

    final first = await terms.checkIn(qr);
    expect(first.alreadyCheckedIn, isFalse);
    expect(first.checkIn.dayIndex, 1);
    expect(first.usage.daysUsed, 1);
    expect(first.usage.checkedInToday, isTrue);

    final again = await terms.checkIn(qr);
    expect(again.alreadyCheckedIn, isTrue);
    expect(again.usage.daysUsed, 1, reason: 'không tính thêm ngày');
    expect((await terms.myCheckIns()).items, hasLength(1));
  });

  test('thẻ hợp lệ + còn hạn mức ⇒ miễn phí; thẻ không hợp lệ ⇒ tính phí ngay từ ngày đầu', () async {
    await loginCoach();
    final first = await terms.checkIn(qr);
    final entitled = first.pass.valid;
    expect(first.checkIn.free, entitled, reason: 'miễn phí khi thẻ hợp lệ, trả phí khi không');
    expect(first.checkIn.feeAssessed, entitled ? 0 : 20000);
    expect(first.usage.entitled, entitled);
    expect(first.usage.freeDaysLeft, entitled ? 19 : 0);
  });

  test('hết 20 ngày miễn phí ⇒ ngày kế tiếp bị trừ 20.000 từ ví', () async {
    final coachId = await loginCoach();
    seedUsed(coachId, CoachTermMockRepository.freeDaysPerMonth, free: true);
    final wallet = server.db.walletOf(coachId)..balance = 100000;
    final r = await terms.checkIn(qr);
    expect(r.checkIn.free, isFalse);
    expect(r.checkIn.feeAssessed, 20000);
    expect(r.checkIn.feeCharged, 20000);
    expect(r.checkIn.feeDebt, 0);
    expect(wallet.balance, 80000);
    expect(r.usage.freeDaysLeft, 0);
    final tx = server.db.walletTxs.where((t) => t.walletId == wallet.id && t.type == WalletTxType.checkinFee).single;
    expect(tx.amount, 20000);
    expect(tx.status, WalletTxStatus.completed);
  });

  test('ví thiếu tiền ⇒ chỉ trừ phần có, phần còn lại ghi nợ', () async {
    final coachId = await loginCoach();
    seedUsed(coachId, CoachTermMockRepository.freeDaysPerMonth, free: true);
    final wallet = server.db.walletOf(coachId)..balance = 5000;
    final r = await terms.checkIn(qr);
    expect(r.checkIn.feeCharged, 5000);
    expect(r.checkIn.feeDebt, 15000);
    expect(r.usage.feeDebt, 15000);
    expect(wallet.balance, 0);
  });

  test('danh sách ngày gần đây: mới nhất trước', () async {
    final coachId = await loginCoach();
    seedUsed(coachId, 2, free: true);
    final items = (await terms.myCheckIns()).items;
    expect(items.map((i) => i.dayKey).toList(), [...items.map((i) => i.dayKey)]..sort((a, b) => b.compareTo(a)));
  });
}
