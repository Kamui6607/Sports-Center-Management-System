import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/attendance/domain/entities/attendance.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/mock_tables.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// Báo vắng (mock `POST/DELETE /enrollments/:id/absence`) + lý do không đổi được buổi.
void main() {
  late MockServer server;
  late ScheduleMockRepository repo;
  late List<EnrollmentRow> upcoming;

  setUp(() async {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    repo = ScheduleMockRepository(server);
    await AuthMockRepository(server).login('member@demo.vn', kDemoPassword);
    final db = server.db;
    final member = server.requireMember();
    final now = db.now();
    // Các buổi sắp tới cùng MỘT khóa, chưa điểm danh.
    final mine = db.enrollments
        .where(
          (e) =>
              e.memberProfileId == member.id &&
              e.status == EnrollmentStatus.booked &&
              db.session(e.sessionId).status == ScheduleStatus.scheduled &&
              db.session(e.sessionId).start.isAfter(now) &&
              !db.attendance.any((a) => a.sessionId == e.sessionId && a.memberProfileId == member.id),
        )
        .toList();
    final classId = db.session(mine.first.sessionId).classId;
    upcoming = mine.where((e) => db.session(e.sessionId).classId == classId).toList();
  });

  test('báo vắng ⇒ Vắng có phép + giảm lượt; tối đa 2 lần/khóa; hủy báo vắng trả lại lượt', () async {
    expect(upcoming.length, greaterThanOrEqualTo(3), reason: 'seed cần ≥ 3 buổi sắp tới cùng khóa');
    await repo.reportAbsence(upcoming[0].id, 'Bị ốm, nghỉ ở nhà');
    final first = await repo.mySession(upcoming[0].sessionId);
    expect(first.hasReportedAbsence, isTrue);
    expect(first.absenceReason, 'Bị ốm, nghỉ ở nhà');
    expect(first.attendance, AttendanceStatus.excused);
    expect(first.absencesLeft, kMaxAbsencesPerCourse - 1);

    await expectLater(repo.reportAbsence(upcoming[0].id, 'Bị ốm, nghỉ ở nhà'), throwsA(isA<AppFailure>()));
    await expectLater(repo.reportAbsence(upcoming[1].id, 'ốm'), throwsA(isA<AppFailure>()));
    await repo.reportAbsence(upcoming[1].id, 'Có việc gia đình');
    await expectLater(repo.reportAbsence(upcoming[2].id, 'Có việc gia đình'), throwsA(isA<AppFailure>()));

    await repo.cancelAbsence(upcoming[1].id);
    expect((await repo.mySession(upcoming[1].sessionId)).hasReportedAbsence, isFalse);
    await repo.reportAbsence(upcoming[2].id, 'Có việc gia đình');
    expect((await repo.mySession(upcoming[2].sessionId)).absencesLeft, 0);
  });

  test('hủy buổi đã báo vắng ⇒ xóa báo vắng', () async {
    await repo.reportAbsence(upcoming[0].id, 'Bị ốm, nghỉ ở nhà');
    await repo.cancelEnrollment(upcoming[0].id);
    expect(
      server.db.attendance.where(
        (a) => a.sessionId == upcoming[0].sessionId && a.memberProfileId == upcoming[0].memberProfileId,
      ),
      isEmpty,
    );
  });

  test('không có buổi để đổi ⇒ có lý do (emptyReason) để app giải thích', () async {
    final db = server.db;
    final s = db.session(upcoming[0].sessionId);
    // Học viên đã có chỗ ở mọi buổi còn lại của khóa ⇒ không còn buổi nào chọn được.
    for (final other in db.sessionsOf(s.classId)) {
      final booked = db.enrollments.any(
        (e) =>
            e.sessionId == other.id &&
            e.memberProfileId == upcoming[0].memberProfileId &&
            e.status == EnrollmentStatus.booked,
      );
      if (other.id != s.id && !booked) other.status = ScheduleStatus.cancelled;
    }
    final t = await repo.transferOptions(upcoming[0].id);
    expect(t.emptyReason, isNotNull);
    final ms = await repo.mySession(s.id);
    expect(ms.transferEmptyReason, isNotNull);
    expect(ms.canTransfer, isFalse);
  });
}
