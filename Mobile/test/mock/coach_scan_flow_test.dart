import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/attendance/data/attendance_mock_repository.dart';
import 'package:sports_center_mobile/features/attendance/domain/entities/attendance.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/mock_tables.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// HLV quét thẻ thành viên của học viên (mock `POST /attendance/coach-scan`): đối chiếu buổi đang dạy + điểm danh.
void main() {
  late MockServer server;
  late AttendanceMockRepository repo;
  late SessionRow live;
  late String memberProfileId;

  setUp(() async {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    repo = AttendanceMockRepository(server);
    await AuthMockRepository(server).login('coach@demo.vn', kDemoPassword);
    final db = server.db;
    final coach = db.coachOfUser(server.requireUser().id)!;
    final now = db.now();
    // Chỉ giữ MỘT buổi đang diễn ra của HLV để kết quả không phụ thuộc dữ liệu seed.
    final mine = db.sessions.where((s) => db.classRow(s.classId).coachProfileId == coach.id).toList();
    for (final s in mine) {
      s.status = ScheduleStatus.cancelled;
    }
    final template = mine.first;
    live = SessionRow(
      id: 'live-scan',
      classId: template.classId,
      roomId: template.roomId,
      start: now.subtract(const Duration(minutes: 20)),
      end: now.add(const Duration(minutes: 40)),
    );
    db.sessions.add(live);
    memberProfileId = db.memberOfUser('u-m1')!.id;
    db.attendance.removeWhere((a) => a.sessionId == live.id);
  });

  void enroll(String profileId) => server.db.enrollments.add(
    EnrollmentRow(
      id: server.db.nextId('enr'),
      memberProfileId: profileId,
      sessionId: live.id,
      bookedAt: server.db.now(),
    ),
  );

  test('học viên có chỗ ⇒ điểm danh (quá 10 phút ⇒ Đi trễ), quét lại ⇒ đã điểm danh', () async {
    enroll(memberProfileId);
    final r = await repo.coachScan('u-m1');
    expect(r.state, CoachScanState.checkedIn);
    expect(r.attendanceStatus, AttendanceStatus.late);
    expect(r.session?.id, live.id);
    expect(r.pass.fullName, isNotEmpty);
    final again = await repo.coachScan('u-m1', sessionId: live.id);
    expect(again.state, CoachScanState.alreadyCheckedIn);
    expect(
      server.db.attendance.where((a) => a.sessionId == live.id && a.memberProfileId == memberProfileId),
      hasLength(1),
    );
  });

  test('đang Vắng ⇒ HLV quét ghi đè thành có mặt', () async {
    enroll(memberProfileId);
    server.db.attendance.add(
      AttendanceRow(
        id: 'a-absent',
        sessionId: live.id,
        memberProfileId: memberProfileId,
        status: AttendanceStatus.absent,
      ),
    );
    final r = await repo.coachScan('u-m1');
    expect(r.state, CoachScanState.checkedIn);
    expect(server.db.attendance.firstWhere((a) => a.id == 'a-absent').status, AttendanceStatus.late);
  });

  test('không có chỗ ⇒ Không có trong lớp, không ghi điểm danh', () async {
    final r = await repo.coachScan('u-m1');
    expect(r.state, CoachScanState.notInClass);
    expect(r.session?.id, live.id);
    expect(r.attendanceStatus, isNull);
    expect(server.db.attendance.where((a) => a.sessionId == live.id), isEmpty);
  });

  test('không có buổi đang dạy ⇒ noActiveSession; buổi ngoài khung ⇒ lỗi', () async {
    live.status = ScheduleStatus.cancelled;
    expect((await repo.coachScan('u-m1')).state, CoachScanState.noActiveSession);
    await expectLater(repo.coachScan('u-m1', sessionId: live.id), throwsA(isA<AppFailure>()));
  });
}
