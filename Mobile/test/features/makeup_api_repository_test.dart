import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/features/makeup/data/makeup_api_repository.dart';
import 'package:sports_center_mobile/features/makeup/domain/entities/makeup.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_api_repository.dart';

import '../helpers/fake_backend.dart';

/// `/makeup-requests` — ánh xạ yêu cầu / buổi có thể xếp; mở buổi bù gửi đúng body.
void main() {
  Map<String, Object?> session(String id, {bool slot = false}) => {
    'id': id,
    'classId': 'c1',
    'className': 'Yoga sáng',
    'startTime': '2026-11-05T01:00:00.000Z',
    'endTime': '2026-11-05T02:00:00.000Z',
    'roomName': 'Phòng A',
    'isMakeupSlot': slot,
  };
  final request = {
    'id': 'mk1',
    'status': 'PENDING',
    'reason': 'Bị ốm',
    'requestedAt': '2026-11-02T01:00:00.000Z',
    'expiresAt': '2026-12-01T00:00:00.000Z',
    'refundEligible': true,
    'paidClassId': 'c1',
    'missedEnrollmentId': 'e1',
    'member': {'id': 'm1', 'userId': 'u1', 'fullName': 'Phạm Văn An', 'avatarUrl': null},
    'missedSession': session('s1'),
    'targetSession': null,
  };

  test('options: yêu cầu + buổi bù mở (chọn được) + buổi khóa khác hết chỗ khách', () async {
    final api = FakeApi();
    api.backend.on(
      'GET /makeup-requests/mk1/options',
      (_) async => FakeReply.ok({
        'request': request,
        'options': [
          {
            ...session('slot1', slot: true),
            'scheduleId': 'slot1',
            'capacity': 3,
            'bookedCount': 1,
            'canSelect': true,
            'isSameClass': true,
          },
          {
            ...session('q1'),
            'scheduleId': 'q1',
            'className': 'Yoga tối',
            'capacity': 10,
            'bookedCount': 4,
            'canSelect': false,
            'isSameClass': false,
            'guestSeatsFull': true,
          },
        ],
      }),
    );
    final d = await MakeupApiRepository(api.client).options('mk1');
    expect(d.request.status, MakeupStatus.pending);
    expect(d.request.refundEligible, isTrue);
    expect(d.request.missed.className, 'Yoga sáng');
    expect(d.options.first.session.isMakeupSlot, isTrue);
    expect(d.options.first.remaining, 2);
    expect(d.options.last.blockReason, 'Đã đủ chỗ cho học viên khóa khác');
  });

  test('mở buổi bù: gửi giờ UTC, sức chứa, yêu cầu xếp luôn', () async {
    final api = FakeApi();
    Object? body;
    api.backend.on('POST /makeup-requests/slots', (req) async {
      body = req.body;
      return FakeReply.ok({
        'slot': {...session('slot1', slot: true)},
        'assigned': ['mk1'],
        'failed': <Object>[],
      });
    });
    final start = DateTime.utc(2026, 11, 6, 1);
    final res = await MakeupApiRepository(api.client).openSlot(
      OpenMakeupSlotInput(
        classId: 'c1',
        start: start,
        end: start.add(const Duration(hours: 1)),
        capacity: 3,
        assignRequestIds: ['mk1'],
      ),
    );
    expect(body, {
      'classId': 'c1',
      'startTime': '2026-11-06T01:00:00.000Z',
      'endTime': '2026-11-06T02:00:00.000Z',
      'capacity': 3,
      'assignRequestIds': ['mk1'],
    });
    expect(res.assignedCount, 1);
    expect(res.failedCount, 0);
  });

  test('báo vắng kèm xin học bù gửi requestMakeup', () async {
    final api = FakeApi();
    api.backend.on('POST /enrollments/e1/absence', (_) async => FakeReply.ok({}));
    await ScheduleApiRepository(api.client).reportAbsence('e1', 'Bị ốm nặng', requestMakeup: true);
    expect(api.backend.requests.single.body, {'reason': 'Bị ốm nặng', 'requestMakeup': true});
  });
}
