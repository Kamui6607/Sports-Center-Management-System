import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/features/attendance/data/attendance_api_repository.dart';
import 'package:sports_center_mobile/features/attendance/domain/entities/attendance.dart';

import '../helpers/fake_backend.dart';

/// `POST /attendance/coach-scan` (HLV quét thẻ học viên) + hạn mã dự phòng / kết quả `scan-qr` kèm buổi học.
void main() {
  final pass = {
    'valid': false,
    'reason': 'Hội viên chưa có gói thành viên.',
    'member': {'id': 'm1', 'userId': 'u1', 'fullName': 'Phạm Văn An', 'avatarUrl': null},
    'membership': null,
    'validUntil': null,
    'totalDaysLeft': 0,
    'entriesToday': 0,
    'isMyStudent': true,
  };

  test('điểm danh được: state + buổi + trạng thái + gói gym; chỉ gửi scheduleId khi có', () async {
    final api = FakeApi();
    final bodies = <Object?>[];
    api.backend.on('POST /attendance/coach-scan', (req) async {
      bodies.add(req.body);
      return FakeReply.ok({
        'state': 'CHECKED_IN',
        'session': {
          'id': 's1',
          'classId': 'c1',
          'className': 'Yoga sáng',
          'startTime': '2026-11-02T00:00:00.000Z',
          'endTime': '2026-11-02T01:00:00.000Z',
          'roomName': 'Phòng A',
        },
        'attendance': {'id': 'a1', 'status': 'LATE', 'note': 'HLV quét thẻ thành viên'},
        'pass': pass,
      });
    });
    final repo = AttendanceApiRepository(api.client);
    final r = await repo.coachScan('tok', sessionId: 's1');
    expect(r.state, CoachScanState.checkedIn);
    expect(r.inClass, isTrue);
    expect(r.session?.className, 'Yoga sáng');
    expect(r.attendanceStatus, AttendanceStatus.late);
    expect(r.pass.isActive, isFalse);
    expect(r.pass.fullName, 'Phạm Văn An');
    await repo.coachScan('tok');
    expect(bodies[0], {'token': 'tok', 'scheduleId': 's1'});
    expect(bodies[1], {'token': 'tok'});
  });

  test('không có trong lớp ⇒ session null, attendance null', () async {
    final api = FakeApi();
    api.backend.on(
      'POST /attendance/coach-scan',
      (_) async => FakeReply.ok({'state': 'NOT_IN_CLASS', 'session': null, 'attendance': null, 'pass': pass}),
    );
    final r = await AttendanceApiRepository(api.client).coachScan('tok');
    expect(r.state, CoachScanState.notInClass);
    expect(r.inClass, isFalse);
    expect(r.session, isNull);
    expect(r.attendanceStatus, isNull);
  });

  test('mã dự phòng: hạn theo manualCodeExpiresIn (90s), không theo hạn QR (600s)', () async {
    final now = DateTime(2026, 11, 2, 8);
    final api = FakeApi();
    api.backend.on(
      'POST /attendance/generate-qr',
      (_) async =>
          FakeReply.ok({'qrToken': 'jwt', 'expiresIn': 600, 'manualCode': 'ABCDEF', 'manualCodeExpiresIn': 90}),
    );
    final t = await AttendanceApiRepository(api.client, clock: () => now).generateQr('s1');
    expect(t.expiresAt, now.add(const Duration(seconds: 90)));
  });

  test('scan-qr trả kèm schedule ⇒ không gọi thêm GET /class-schedules', () async {
    final api = FakeApi();
    var scheduleCalls = 0;
    api.backend.on(
      'POST /attendance/scan-qr',
      (_) async => FakeReply.ok({
        'id': 'a1',
        'scheduleId': 's1',
        'status': 'PRESENT',
        'schedule': {
          'id': 's1',
          'startTime': '2026-11-02T00:00:00.000Z',
          'endTime': '2026-11-02T01:00:00.000Z',
          'class': {'id': 'c1', 'name': 'Yoga sáng'},
          'room': {'name': 'Phòng A'},
        },
      }),
    );
    api.backend.on('GET /class-schedules/s1', (_) async {
      scheduleCalls++;
      return FakeReply.ok({});
    });
    final r = await AttendanceApiRepository(api.client).scanQr('jwt');
    expect(r.className, 'Yoga sáng');
    expect(r.roomName, 'Phòng A');
    expect(scheduleCalls, 0);
  });
}
