import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/core/utils/vn_time.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/features/term/data/coach_term_mock_repository.dart';
import 'package:sports_center_mobile/features/term/domain/entities/coach_term.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/mock_tables.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// Kỳ học của Coach (mock) — đăng ký kỳ, nghỉ phép, thẻ ra vào.
void main() {
  late MockServer server;
  late AuthMockRepository auth;
  late CoachTermMockRepository terms;

  setUp(() {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    auth = AuthMockRepository(server);
    terms = CoachTermMockRepository(server);
  });

  Future<void> loginCoach() => auth.login('coach@demo.vn', kDemoPassword);

  /// Tạo thêm [n] buổi cách nhau [stepDays] ngày cho khóa của Coach đang đăng nhập (kỳ hiện tại).
  void addSessions(String classId, int n, {int stepDays = 4, ScheduleStatus status = ScheduleStatus.scheduled}) {
    final db = server.db;
    final first = db.now().add(const Duration(days: 1));
    for (var i = 0; i < n; i++) {
      final start = first.add(Duration(days: i * stepDays));
      db.sessions.add(
        SessionRow(
          id: db.nextId('s-term'),
          classId: classId,
          roomId: db.rooms.first.id,
          start: start,
          end: start.add(const Duration(hours: 1)),
          status: status,
        ),
      );
    }
  }

  String coachClassId() {
    final coach = server.db.coachOfUser(server.requireUser().id)!;
    return server.db.classes.firstWhere((c) => c.coachProfileId == coach.id).id;
  }

  test('kỳ hiện tại theo lịch dương: 3 kỳ × 4 tháng, ân hạn 14 ngày', () {
    final jan = CoachTermMockRepository.termOf(VnTime.fromWall(2027, 2, 10));
    expect(jan.name, 'Kỳ 1/2027');
    expect(VnTime.date(jan.startDate), '01/01/2027');
    expect(VnTime.date(jan.endDate), '30/04/2027');
    final aug = CoachTermMockRepository.termOf(VnTime.fromWall(2026, 8, 31, 23, 30));
    expect(aug.name, 'Kỳ 2/2026');
    expect(VnTime.date(aug.endDate), '31/08/2026');
    final sep = CoachTermMockRepository.termOf(VnTime.fromWall(2026, 9, 1));
    expect(sep.name, 'Kỳ 3/2026');
    expect(sep.phase, TermPhase.grace);
    expect(VnTime.date(sep.graceDeadline), '15/09/2026');
  });

  test('chỉ HLV dùng được; Member bị chặn', () async {
    await auth.login('member@demo.vn', kDemoPassword);
    expect(() => terms.myStatus(), throwsA(isA<AppFailure>()));
    expect(() => terms.pass(), throwsA(isA<AppFailure>()));
  });

  test('chưa đủ buổi ⇒ chờ / chưa đạt tùy hạn; đủ buổi trải ≥ 28 ngày ⇒ đạt', () async {
    await loginCoach();
    final before = await terms.myStatus();
    expect(before.eligible, isTrue);
    expect(before.evaluation!.registration.ok, isFalse);
    expect(
      before.evaluation!.state,
      before.term.phase == TermPhase.grace ? CoachTermState.pending : CoachTermState.nonCompliant,
    );

    // 10 buổi cách nhau 4 ngày ⇒ trải 36 ngày — nằm trong kỳ nếu còn đủ ngày; nếu gần cuối kỳ thì bỏ qua phần này.
    final term = before.term;
    final room = term.endDate.difference(server.db.now()).inDays;
    if (room < 45) return;
    addSessions(coachClassId(), 10);
    final after = await terms.myStatus();
    expect(after.evaluation!.registration.ok, isTrue);
    expect(after.evaluation!.state, CoachTermState.compliant);
    expect((await terms.pass()).verdict.level, PassLevel.ok);
  });

  test('thẻ: có token đổi theo thời điểm và kết luận khớp trạng thái', () async {
    await loginCoach();
    final status = await terms.myStatus();
    final p = await terms.pass();
    expect(p.token, startsWith('mock-pass.'));
    expect(p.expiresIn, 60);
    expect(p.state, status.evaluation!.state);
    expect(p.verdict.valid, status.pass.valid);
  });

  test('nghỉ phép: tạo, trùng ngày bị chặn, quá dài bị chặn, hủy được', () async {
    await loginCoach();
    final today = VnTime.startOfDay(server.db.now());
    final created = await terms.createLeave(
      startDate: today.add(const Duration(days: 3)),
      endDate: today.add(const Duration(days: 6)),
      kind: LeaveKind.sick,
      reason: 'Ốm',
    );
    expect(created.status, LeaveStatus.pending);
    expect((await terms.myLeaves()).single.id, created.id);

    expect(
      () => terms.createLeave(
        startDate: today.add(const Duration(days: 5)),
        endDate: today.add(const Duration(days: 8)),
        kind: LeaveKind.personal,
        reason: 'Trùng',
      ),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'LEAVE_OVERLAP')),
    );
    expect(
      () => terms.createLeave(
        startDate: today.add(const Duration(days: 20)),
        endDate: today.add(const Duration(days: 20 + 130)),
        kind: LeaveKind.other,
        reason: 'Dài',
      ),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'LEAVE_TOO_LONG')),
    );
    expect(
      () => terms.createLeave(
        startDate: today.subtract(const Duration(days: 40)),
        endDate: today.subtract(const Duration(days: 38)),
        kind: LeaveKind.other,
        reason: 'Quá cũ',
      ),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'LEAVE_TOO_OLD')),
    );
    expect(
      () => terms.createLeave(
        startDate: today.add(const Duration(days: 9)),
        endDate: today.add(const Duration(days: 8)),
        kind: LeaveKind.other,
        reason: 'Ngược',
      ),
      throwsA(isA<AppFailure>()),
    );

    final cancelled = await terms.cancelLeave(created.id);
    expect(cancelled.status, LeaveStatus.cancelled);
    expect(
      () => terms.cancelLeave(created.id),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'LEAVE_NOT_CANCELLABLE')),
    );
    expect(() => terms.cancelLeave('khong-co'), throwsA(isA<AppFailure>()));
  });

  test('nghỉ được duyệt: gia hạn ân hạn; nghỉ ≥ nửa kỳ ⇒ được miễn', () async {
    await loginCoach();
    final today = VnTime.startOfDay(server.db.now());
    final coach = server.db.coachOfUser(server.requireUser().id)!;
    final base = await terms.myStatus();
    final extBefore = base.evaluation!.graceExtensionDays;

    // Duyệt thẳng trong DB (luồng duyệt là của Quản lý trên Web).
    server.db.coachLeaves.add(
      CoachLeaveRow(
        id: 'leave-ok',
        coachProfileId: coach.id,
        startDate: today,
        endDate: today.add(const Duration(days: 3, hours: 23)),
        kind: LeaveKind.sick,
        reason: 'Ốm',
        createdAt: today,
        status: LeaveStatus.approved,
      ),
    );
    final extended = await terms.myStatus();
    expect(extended.evaluation!.leaveApprovedDays, greaterThanOrEqualTo(4));
    if (base.term.phase == TermPhase.grace) {
      expect(extended.evaluation!.graceExtensionDays, greaterThan(extBefore));
    }

    server.db.coachLeaves.add(
      CoachLeaveRow(
        id: 'leave-long',
        coachProfileId: coach.id,
        startDate: base.term.startDate,
        endDate: base.term.endDate,
        kind: LeaveKind.other,
        reason: 'Bảo lưu',
        createdAt: today,
        status: LeaveStatus.approved,
      ),
    );
    final exempt = await terms.myStatus();
    expect(exempt.evaluation!.state, CoachTermState.exempt);
    expect(exempt.pass.valid, isTrue);
  });
}
