import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/core/utils/vn_time.dart';
import 'package:sports_center_mobile/features/term/data/coach_term_api_repository.dart';
import 'package:sports_center_mobile/features/term/domain/entities/coach_term.dart';

import '../helpers/fake_backend.dart';

/// `GET /terms/me` đúng shape BE (chụp từ BE chạy thật, rút gọn).
Map<String, Object?> _status({String state = 'PENDING', Map<String, Object?>? previousTerm}) => {
  'eligible': true,
  'term': {
    'id': 'b4542521-e5c3-4e45-b6c8-7b545e3032c1',
    'name': 'Kỳ 3/2026',
    'year': 2026,
    'seq': 3,
    'startDate': '2026-08-31T17:00:00.000Z',
    'endDate': '2026-12-31T16:59:59.999Z',
    'graceDays': 14,
    'graceDeadline': '2026-09-14T17:00:00.000Z',
    'phase': 'ACTIVE',
    'daysToStart': -52,
    'daysToEnd': 70,
  },
  'evaluation': {
    'state': state,
    'final': false,
    'phase': 'ACTIVE',
    'reasons': ['Cần tạo khóa học hợp lệ trước 04/11/2026 (còn 13 ngày): ≥ 8 buổi, trải ≥ 28 ngày.'],
    'warnings': ['Khóa "Gym Nền Tảng Buổi Sáng" mới có 1 buổi / 0 ngày — chưa đủ điều kiện.'],
    'atRisk': false,
    'deadlineAt': '2026-11-04T17:00:00.000Z',
    'daysToDeadline': 13,
    'registration': {
      'ok': false,
      'qualifyingClassId': 'class-1',
      'qualifyingClassName': 'Gym Nền Tảng Buổi Sáng',
      'qualifyingClassStatus': 'APPROVED',
      'mainSessions': 1,
      'spanDays': 0,
      'pendingApproval': false,
      'required': {'sessions': 8, 'spanDays': 28},
    },
    'delivery': {
      'completed': 0,
      'awaitingComplete': 1,
      'scheduledFuture': 1,
      'cancelled': 0,
      'leaveCancelled': 0,
      'dueTotal': 1,
      'completionRate': 0,
      'cancelRate': 0,
      'completedWithStudents': 0,
      'withEvidence': 0,
      'evidenceRate': null,
    },
    'leave': {'approvedDays': 0, 'share': 0, 'graceExtensionDays': 0},
  },
  'previousTerm': previousTerm,
  'pass': {
    'valid': true,
    'level': 'WARN',
    'reason': 'Đang trong thời gian ân hạn — còn 13 ngày để tạo khóa học hợp lệ.',
  },
  'rules': {'minSessions': 8, 'minSpanDays': 28},
};

Map<String, Object?> _leave(String id, {String status = 'PENDING', String kind = 'SICK', String? note}) => {
  'id': id,
  'coachId': 'cp1',
  'startDate': '2026-11-01T17:00:00.000Z',
  'endDate': '2026-11-09T16:59:59.999Z',
  'kind': kind,
  'reason': 'Ốm sốt xuất huyết',
  'status': status,
  'reviewedAt': null,
  'reviewNote': note,
  'createdAt': '2026-10-23T03:00:00.000Z',
};

void main() {
  late FakeApi api;
  late CoachTermApiRepository repo;

  setUp(() {
    api = FakeApi();
    repo = CoachTermApiRepository(api.client);
  });

  test('myStatus: ánh xạ kỳ, đánh giá, đăng ký, việc dạy và thẻ', () async {
    api.backend.on('GET /terms/me', (_) async => FakeReply.ok(_status()));
    final s = await repo.myStatus();
    expect(s.eligible, isTrue);
    expect(s.term.name, 'Kỳ 3/2026');
    expect(s.term.phase, TermPhase.active);
    expect(s.term.graceDays, 14);
    expect(s.previousTermName, isNull);

    final ev = s.evaluation!;
    expect(ev.state, CoachTermState.pending);
    expect(ev.isFinal, isFalse);
    expect(ev.reasons.single, contains('04/11/2026'));
    expect(ev.warnings, hasLength(1));
    expect(ev.daysToDeadline, 13);
    expect(ev.registration.ok, isFalse);
    expect(ev.registration.qualifyingClassName, 'Gym Nền Tảng Buổi Sáng');
    expect(ev.registration.requiredSessions, 8);
    expect(ev.registration.requiredSpanDays, 28);
    expect(ev.delivery.awaitingComplete, 1);
    expect(ev.delivery.completionRate, 0);
    expect(ev.delivery.evidenceRate, isNull, reason: 'chưa có buổi có học viên ⇒ không có tỷ lệ bằng chứng');

    expect(s.pass.valid, isTrue);
    expect(s.pass.level, PassLevel.warn);
  });

  test('NON_COMPLIANT ⇒ nonCompliant; kỳ trước được ánh xạ', () async {
    api.backend.on(
      'GET /terms/me',
      (_) async => FakeReply.ok(
        _status(
          state: 'NON_COMPLIANT',
          previousTerm: {'id': 't0', 'name': 'Kỳ 2/2026', 'state': 'NON_COMPLIANT', 'final': true},
        ),
      ),
    );
    final s = await repo.myStatus();
    expect(s.evaluation!.state, CoachTermState.nonCompliant);
    expect(s.previousTermName, 'Kỳ 2/2026');
    expect(s.previousState, CoachTermState.nonCompliant);
  });

  test('hồ sơ chưa duyệt (eligible=false, không có evaluation) không làm vỡ ánh xạ', () async {
    api.backend.on('GET /terms/me', (_) async {
      final body = _status()..['eligible'] = false;
      body['evaluation'] = null;
      body['pass'] = {'valid': false, 'level': 'DENY', 'reason': 'Hồ sơ Coach chưa được duyệt.'};
      return FakeReply.ok(body);
    });
    final s = await repo.myStatus();
    expect(s.eligible, isFalse);
    expect(s.evaluation, isNull);
    expect(s.pass.level, PassLevel.deny);
  });

  test('pass: nhận token, thời hạn và kết luận', () async {
    api.backend.on(
      'GET /terms/me/pass',
      (_) async => FakeReply.ok({
        'token': 'abc.def.ghi',
        'expiresIn': 60,
        'verdict': {'valid': false, 'level': 'DENY', 'reason': 'Kỳ trước chưa đạt.'},
        'state': 'PENDING',
      }),
    );
    final p = await repo.pass();
    expect(p.token, 'abc.def.ghi');
    expect(p.expiresIn, 60);
    expect(p.verdict.valid, isFalse);
    expect(p.verdict.level, PassLevel.deny);
    expect(p.state, CoachTermState.pending);
    expect(CoachPass.refreshEvery.inSeconds, lessThan(p.expiresIn), reason: 'phải làm mới trước khi mã hết hạn');
  });

  test('myLeaves: trạng thái + loại + ghi chú duyệt', () async {
    api.backend.on(
      'GET /terms/me/leaves',
      (_) async =>
          FakeReply.ok([_leave('l1'), _leave('l2', status: 'REJECTED', kind: 'PERSONAL', note: 'Trùng cao điểm')]),
    );
    final list = await repo.myLeaves();
    expect(list.map((l) => l.status), [LeaveStatus.pending, LeaveStatus.rejected]);
    expect(list[1].kind, LeaveKind.personal);
    expect(list[1].reviewNote, 'Trùng cao điểm');
    expect(list[0].isPending, isTrue);
  });

  test('createLeave: gửi NGÀY theo giờ VN + loại viết hoa + lý do đã trim', () async {
    api.backend.on('POST /terms/me/leaves', (_) async => FakeReply.ok(_leave('l9')));
    final leave = await repo.createLeave(
      startDate: VnTime.fromWall(2026, 11, 2),
      endDate: VnTime.fromWall(2026, 11, 9, 13, 30),
      kind: LeaveKind.sick,
      reason: '  Ốm sốt xuất huyết  ',
    );
    expect(leave.id, 'l9');
    final sent = api.backend.requests.single.body! as Map<String, Object?>;
    expect(sent, {'startDate': '2026-11-02', 'endDate': '2026-11-09', 'kind': 'SICK', 'reason': 'Ốm sốt xuất huyết'});
  });

  test('createLeave: 409 trùng đơn ⇒ AppFailure conflict kèm mã', () async {
    api.backend.on(
      'POST /terms/me/leaves',
      (_) async =>
          FakeReply.error(409, 'Đã có đơn nghỉ trùng khoảng thời gian này.', errors: {'code': 'LEAVE_OVERLAP'}),
    );
    await expectLater(
      repo.createLeave(
        startDate: VnTime.fromWall(2026, 11, 2),
        endDate: VnTime.fromWall(2026, 11, 3),
        kind: LeaveKind.other,
        reason: 'abc',
      ),
      throwsA(
        isA<AppFailure>()
            .having((f) => f.type, 'type', FailureType.conflict)
            .having((f) => f.code, 'code', 'LEAVE_OVERLAP'),
      ),
    );
  });

  test('cancelLeave: DELETE đúng đường dẫn và trả đơn đã hủy', () async {
    api.backend.on('DELETE /terms/me/leaves/l1', (_) async => FakeReply.ok(_leave('l1', status: 'CANCELLED')));
    final l = await repo.cancelLeave('l1');
    expect(l.status, LeaveStatus.cancelled);
    expect(api.backend.count('DELETE /terms/me/leaves/l1'), 1);
  });

  test('canCancel: chờ duyệt hoặc đã duyệt nhưng chưa bắt đầu', () {
    final base = CoachLeave(
      id: 'x',
      startDate: DateTime.utc(2026, 11, 5),
      endDate: DateTime.utc(2026, 11, 8),
      kind: LeaveKind.sick,
      reason: 'r',
      status: LeaveStatus.pending,
    );
    final now = DateTime.utc(2026, 11, 1);
    expect(base.canCancel(now), isTrue);
    final approved = CoachLeave(
      id: 'y',
      startDate: base.startDate,
      endDate: base.endDate,
      kind: base.kind,
      reason: 'r',
      status: LeaveStatus.approved,
    );
    expect(approved.canCancel(now), isTrue);
    expect(approved.canCancel(DateTime.utc(2026, 11, 6)), isFalse, reason: 'đã bắt đầu');
  });
}
