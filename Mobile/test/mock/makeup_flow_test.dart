import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/makeup/data/makeup_mock_repository.dart';
import 'package:sports_center_mobile/features/makeup/domain/entities/makeup.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/mock_tables.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// Học bù (mock): báo vắng + xin học bù ⇒ HLV mở buổi bù / xếp / từ chối; học viên tự chọn buổi bù.
void main() {
  late MockServer server;
  late AuthMockRepository auth;
  late ScheduleMockRepository schedule;
  late MakeupMockRepository makeup;
  late EnrollmentRow missed;
  late String coachEmail;

  setUp(() async {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    auth = AuthMockRepository(server);
    schedule = ScheduleMockRepository(server);
    makeup = MakeupMockRepository(server);
    await auth.login('member@demo.vn', kDemoPassword);
    final db = server.db;
    final member = server.requireMember();
    final now = db.now();
    missed = db.enrollments.firstWhere(
      (e) =>
          e.memberProfileId == member.id &&
          e.status == EnrollmentStatus.booked &&
          db.session(e.sessionId).status == ScheduleStatus.scheduled &&
          db.session(e.sessionId).start.isAfter(now.add(const Duration(days: 1))) &&
          !db.attendance.any((a) => a.sessionId == e.sessionId && a.memberProfileId == member.id),
    );
    final cls = db.classRow(db.session(missed.sessionId).classId);
    coachEmail = db.users.firstWhere((u) => u.id == db.userOfCoach(cls.coachProfileId).id).email;
  });

  Future<void> asCoach() => auth.login(coachEmail, kDemoPassword);
  Future<void> asMember() => auth.login('member@demo.vn', kDemoPassword);

  test('báo vắng + xin học bù ⇒ HLV mở buổi bù và xếp ⇒ học viên thấy buổi học bù', () async {
    await schedule.reportAbsence(missed.id, 'Bị ốm, nghỉ ở nhà', requestMakeup: true);
    final mine = await schedule.mySession(missed.sessionId);
    expect(mine.makeupRequest?.status, MakeupStatus.pending);

    await asCoach();
    final pending = await makeup.coachRequests(status: MakeupStatus.pending);
    final request = pending.singleWhere((r) => r.missedEnrollmentId == missed.id);
    final start = server.db.now().add(const Duration(days: 3, hours: 5));
    final res = await makeup.openSlot(
      OpenMakeupSlotInput(
        classId: request.paidClassId,
        start: start,
        end: start.add(const Duration(hours: 1)),
        capacity: 2,
        assignRequestIds: [request.id],
      ),
    );
    expect(res.assignedCount, 1);
    expect(res.slot.isMakeupSlot, isTrue);

    await asMember();
    final after = await schedule.mySession(missed.sessionId);
    expect(after.makeupRequest?.status, MakeupStatus.scheduled);
    expect(after.makeupRequest?.target?.id, res.slot.id);
    final slotSession = await schedule.mySession(res.slot.id);
    expect(slotSession.isMakeupEnrollment, isTrue);
    expect(slotSession.canTransfer, isFalse);
    // Đã xếp học bù ⇒ không hủy báo vắng được.
    await expectLater(schedule.cancelAbsence(missed.id), throwsA(isA<AppFailure>()));
  });

  test('học viên tự chọn buổi bù mở; buổi bù không xuất hiện khi đổi buổi thường', () async {
    await asCoach();
    final cls = server.db.classRow(server.db.session(missed.sessionId).classId);
    final start = server.db.now().add(const Duration(days: 4, hours: 3));
    final res = await makeup.openSlot(
      OpenMakeupSlotInput(classId: cls.id, start: start, end: start.add(const Duration(hours: 1)), capacity: 3),
    );

    await asMember();
    final t = await schedule.transferOptions(missed.id);
    expect(t.options.any((o) => o.session.id == res.slot.id), isFalse);

    await schedule.reportAbsence(missed.id, 'Có việc gia đình', requestMakeup: true);
    final request = (await makeup.myRequests()).first;
    final opts = await makeup.options(request.id);
    expect(opts.options.map((o) => o.session.id), contains(res.slot.id));
    await makeup.assign(request.id, res.slot.id);
    expect((await makeup.myRequests()).first.status, MakeupStatus.scheduled);
  });

  test('HLV từ chối ⇒ REJECTED; học viên rút yêu cầu ⇒ CANCELLED', () async {
    await schedule.reportAbsence(missed.id, 'Bị ốm, nghỉ ở nhà', requestMakeup: true);
    final id = (await makeup.myRequests()).first.id;
    await asCoach();
    await makeup.reject(id, 'Không còn buổi phù hợp');
    expect((await makeup.coachRequests(status: MakeupStatus.rejected)).any((r) => r.id == id), isTrue);

    await asMember();
    final again = await makeup.requestForAbsence(missed.id);
    expect(again.status, MakeupStatus.pending);
    await makeup.cancel(again.id);
    expect((await makeup.myRequests()).first.status, MakeupStatus.cancelled);
  });
}
