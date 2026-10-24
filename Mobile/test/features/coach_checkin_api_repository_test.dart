import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/coach/domain/entities/wallet.dart';
import 'package:sports_center_mobile/features/term/data/coach_term_api_repository.dart';
import 'package:sports_center_mobile/features/term/domain/entities/coach_term.dart';

import '../helpers/fake_backend.dart';

/// `usage` đúng shape BE (`GET /terms/me/check-ins`, `POST /terms/check-in`) — tiền là chuỗi Decimal.
Map<String, Object?> _usage({int daysUsed = 3, int freeUsed = 2, bool entitled = true, String debt = '0'}) => {
  'monthKey': '2026-10',
  'today': '2026-10-24',
  'checkedInToday': true,
  'daysUsed': daysUsed,
  'freeDaysUsed': freeUsed,
  'freeDaysPerMonth': 20,
  'freeDaysLeft': entitled ? 20 - freeUsed : 0,
  'feePerDay': 20000,
  'entitled': entitled,
  'feeAssessedThisMonth': 20000,
  'feeChargedThisMonth': 17000,
  'feeDebt': debt,
};

Map<String, Object?> _row({bool free = true, String fee = '0.00', String charged = '0.00', String debt = '0.00'}) => {
  'id': 'ci1',
  'dayKey': '2026-10-24',
  'monthKey': '2026-10',
  'checkedInAt': '2026-10-24T02:15:00.000Z',
  'dayIndex': 3,
  'free': free,
  'feeAssessed': fee,
  'feeCharged': charged,
  'feeDebt': debt,
  'termState': 'COMPLIANT',
};

Map<String, Object?> _scan({bool already = false, Map<String, Object?>? row, Map<String, Object?>? usage}) => {
  'alreadyCheckedIn': already,
  'checkIn': row ?? _row(),
  'pass': {'valid': true, 'level': 'OK', 'reason': 'Đã đạt yêu cầu kỳ hiện tại.'},
  'usage': usage ?? _usage(),
};

void main() {
  late FakeApi api;
  late CoachTermApiRepository repo;

  setUp(() {
    api = FakeApi();
    repo = CoachTermApiRepository(api.client);
  });

  test('checkIn: gửi token đã trim, ánh xạ ngày miễn phí + mức dùng', () async {
    api.backend.on(
      'POST /terms/check-in',
      (_) async => FakeReply(201, {'success': true, 'message': 'OK', 'data': _scan()}),
    );
    final r = await repo.checkIn('  abc.def.ghi  ');
    expect((api.backend.requests.single.body! as Map<String, Object?>)['token'], 'abc.def.ghi');
    expect(r.alreadyCheckedIn, isFalse);
    expect(r.checkIn.free, isTrue);
    expect(r.checkIn.dayKey, '2026-10-24');
    expect(r.checkIn.dayIndex, 3);
    expect(r.pass.level, PassLevel.ok);
    expect(r.usage.freeDaysUsed, 2);
    expect(r.usage.freeDaysLeft, 18);
    expect(r.usage.feePerDay, 20000);
    expect(r.usage.checkedInToday, isTrue);
  });

  test('checkIn: ngày có phí — tiền Decimal dạng chuỗi và nợ được đọc đúng', () async {
    api.backend.on(
      'POST /terms/check-in',
      (_) async => FakeReply.ok(
        _scan(
          row: _row(free: false, fee: '20000.00', charged: '17000.00', debt: '3000.00'),
          usage: _usage(entitled: false, debt: '3000.00'),
        ),
      ),
    );
    final r = await repo.checkIn('t');
    expect(r.checkIn.free, isFalse);
    expect(r.checkIn.feeAssessed, 20000);
    expect(r.checkIn.feeCharged, 17000);
    expect(r.checkIn.feeDebt, 3000);
    expect(r.usage.feeDebt, 3000);
    expect(r.usage.entitled, isFalse);
    expect(r.usage.freeDaysLeft, 0, reason: 'thẻ không hợp lệ ⇒ không còn ngày miễn phí');
  });

  test('checkIn: đã check-in hôm nay', () async {
    api.backend.on('POST /terms/check-in', (_) async => FakeReply.ok(_scan(already: true)));
    expect((await repo.checkIn('t')).alreadyCheckedIn, isTrue);
  });

  test('checkIn: QR hết hạn / không hợp lệ ⇒ AppFailure kèm mã', () async {
    api.backend.on(
      'POST /terms/check-in',
      (_) async => FakeReply.error(400, 'Mã QR check-in đã hết hạn.', errors: {'code': 'CHECKIN_QR_EXPIRED'}),
    );
    await expectLater(
      repo.checkIn('t'),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'CHECKIN_QR_EXPIRED')),
    );
  });

  test('checkIn: hồ sơ chưa duyệt ⇒ 403 CHECKIN_NOT_ELIGIBLE', () async {
    api.backend.on(
      'POST /terms/check-in',
      (_) async => FakeReply.error(403, 'Hồ sơ Coach chưa được duyệt.', errors: {'code': 'CHECKIN_NOT_ELIGIBLE'}),
    );
    await expectLater(
      repo.checkIn('t'),
      throwsA(
        isA<AppFailure>()
            .having((f) => f.type, 'type', FailureType.forbidden)
            .having((f) => f.code, 'code', 'CHECKIN_NOT_ELIGIBLE'),
      ),
    );
  });

  test('myCheckIns: mức dùng + danh sách ngày gần đây', () async {
    api.backend.on(
      'GET /terms/me/check-ins',
      (_) async => FakeReply.ok({
        'eligible': true,
        'pass': {'valid': true, 'level': 'OK', 'reason': 'ok'},
        'usage': _usage(),
        'items': [_row(), _row(free: false, fee: '20000.00', charged: '20000.00')],
      }),
    );
    final m = await repo.myCheckIns();
    expect(m.eligible, isTrue);
    expect(m.items, hasLength(2));
    expect(m.items.first.free, isTrue);
    expect(m.items.last.feeCharged, 20000);
    expect(m.usage.daysUsed, 3);
  });

  test('myCheckIns: hồ sơ chưa duyệt ⇒ eligible=false, danh sách rỗng', () async {
    api.backend.on(
      'GET /terms/me/check-ins',
      (_) async => FakeReply.ok({
        'eligible': false,
        'usage': _usage(daysUsed: 0, freeUsed: 0, entitled: false),
        'items': <Object?>[],
      }),
    );
    final m = await repo.myCheckIns();
    expect(m.eligible, isFalse);
    expect(m.items, isEmpty);
  });

  test('ví: giao dịch CHECKIN_FEE được nhận diện (không rơi về "deposit")', () {
    expect(WalletTxType.values.map((t) => t.name), contains('checkinFee'));
    final tx = WalletTransaction(
      id: 'w1',
      amount: 20000,
      type: WalletTxType.checkinFee,
      status: WalletTxStatus.completed,
      createdAt: DateTime.utc(2026, 10, 24),
    );
    expect(tx.signedAmount, -20000, reason: 'phí là khoản trừ');
  });
}
