import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/features/membership/data/membership_api_repository.dart';
import 'package:sports_center_mobile/features/membership/domain/entities/membership.dart';

import '../helpers/fake_backend.dart';

/// Kết quả quét thẻ thành viên: BE (`POST /memberships/pass/verify`) báo lượt vào và HLV quét có phải học viên của mình không.
void main() {
  Map<String, Object?> body({Object? isMyStudent, int entries = 1}) => {
    'valid': true,
    'reason': 'Gói thành viên còn hiệu lực.',
    'member': {'id': 'm1', 'userId': 'u1', 'fullName': 'Phạm Văn An', 'avatarUrl': null},
    'membership': {'planName': 'Gói 1 tháng', 'endDate': '2026-12-01T00:00:00.000Z', 'daysLeft': 30},
    'validUntil': '2026-12-01T00:00:00.000Z',
    'totalDaysLeft': 30,
    'entriesToday': entries,
    'isMyStudent': ?isMyStudent,
  };

  Future<MembershipVerifyResult> scan(Map<String, Object?> data) async {
    final api = FakeApi();
    api.backend.on('POST /memberships/pass/verify', (_) async => FakeReply.ok(data));
    return MembershipApiRepository(api.client).verifyPass('tok');
  }

  test('HLV quét học viên của mình ⇒ isMyStudent = true', () async {
    final r = await scan(body(isMyStudent: true));
    expect(r.isMyStudent, isTrue);
    expect(r.entriesToday, 1);
    expect(r.fullName, 'Phạm Văn An');
  });

  test('HLV quét hội viên khác ⇒ false; Manager quét (BE trả null / không có) ⇒ null', () async {
    expect((await scan(body(isMyStudent: false))).isMyStudent, isFalse);
    expect((await scan(body(isMyStudent: null))).isMyStudent, isNull);
    expect((await scan(body())).isMyStudent, isNull);
  });
}
