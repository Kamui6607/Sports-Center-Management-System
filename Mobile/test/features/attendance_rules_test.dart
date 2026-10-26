import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/features/attendance/data/attendance_api_repository.dart';
import 'package:sports_center_mobile/features/attendance/domain/entities/attendance.dart';

import '../helpers/fake_backend.dart';

/// Quy tắc chuyên cần phải khớp BE (`ATTENDANCE`: cửa sổ 10 buổi, mẫu tối thiểu 5, cảnh báo dưới 80%,
/// vắng có phép không tính) — để màn tổng, màn theo khóa và BE không ra ba con số khác nhau.
void main() {
  final day0 = DateTime.utc(2026, 10, 1, 14);

  /// Dựng bảng chuyên cần của một khóa: [marks] theo thứ tự cũ → mới, mỗi buổi cách nhau một ngày.
  CourseAttendance course(List<CourseSessionMark> marks) => CourseAttendance([
    for (var i = 0; i < marks.length; i++)
      CourseAttendanceSession(
        scheduleId: 's$i',
        startTime: day0.add(Duration(days: i)),
        endTime: day0.add(Duration(days: i, hours: 1)),
        mark: marks[i],
      ),
  ]);

  List<CourseSessionMark> rep(CourseSessionMark m, int n) => List.filled(n, m);
  const present = CourseSessionMark.present;
  const absent = CourseSessionMark.absent;
  const excused = CourseSessionMark.excused;

  group('ClassAttendanceStat (màn tổng)', () {
    ClassAttendanceStat stat({int p = 0, int l = 0, int a = 0, int e = 0}) =>
        ClassAttendanceStat(classId: 'c', className: 'C', present: p, late: l, absent: a, excused: e);

    test('vắng có phép không nằm trong mẫu số — khớp BE (66,7% chứ không phải 50%)', () {
      // BE: present 3, late 1, absent 1 + noShow 1 (đã gộp vào vắng), excused 2 ⇒ sampleSize 6, rate 66,7%.
      final s = stat(p: 3, l: 1, a: 2, e: 2);
      expect(s.counted, 6);
      expect(s.rate, closeTo(4 / 6, 1e-9));
      expect(s.isWarning, isTrue);
    });

    test('chỉ có buổi vắng có phép ⇒ không bị cảnh báo', () {
      final s = stat(p: 4, e: 6);
      expect(s.rate, 1);
      expect(s.isWarning, isFalse);
    });

    test('mẫu dưới 5 buổi ⇒ không cảnh báo dù tỷ lệ 0% (BE xếp loại OK)', () {
      final s = stat(a: 1);
      expect(s.rate, 0);
      expect(s.isWarning, isFalse);
      expect(stat(p: 1, a: 3).isWarning, isFalse);
    });

    test('đúng ngưỡng: 4/5 = 80% không cảnh báo, 3/5 = 60% cảnh báo', () {
      expect(stat(p: 4, a: 1).isWarning, isFalse);
      expect(stat(p: 3, a: 2).isWarning, isTrue);
    });
  });

  group('CourseAttendance (màn theo khóa)', () {
    test('tỷ lệ bỏ vắng có phép và buổi sắp tới; chưa điểm danh tính là vắng', () {
      final c = course([
        ...rep(present, 3),
        CourseSessionMark.late,
        absent,
        ...rep(excused, 2),
        CourseSessionMark.notMarked,
        CourseSessionMark.upcoming,
      ]);
      expect(c.counted, 6);
      expect(c.rate, closeTo(4 / 6, 1e-9));
      expect(c.isWarning, isTrue);
    });

    test('mẫu dưới 5 buổi ⇒ không cảnh báo', () {
      expect(course([absent, CourseSessionMark.upcoming]).isWarning, isFalse);
      expect(course(rep(absent, 4)).isWarning, isFalse);
      expect(course(rep(absent, 5)).isWarning, isTrue);
    });

    test('cảnh báo chỉ xét 10 buổi đã qua gần nhất như BE', () {
      // Cả khóa 10/13 = 76,9% (< 80%) nhưng 10 buổi gần nhất đều có mặt ⇒ không cảnh báo.
      final recovered = course([...rep(absent, 3), ...rep(present, 10)]);
      expect(recovered.rate, lessThan(0.8));
      expect(recovered.recentPast, hasLength(ClassAttendanceStat.sampleWindow));
      expect(recovered.isWarning, isFalse);

      // 10 buổi đầu có mặt nhưng 5 buổi gần nhất đều vắng ⇒ cửa sổ 5/10 = 50% ⇒ cảnh báo.
      final slipping = course([...rep(present, 10), ...rep(absent, 5)]);
      expect(slipping.isWarning, isTrue);
    });

    test('buổi vắng có phép nằm trong cửa sổ nhưng không tính vào mẫu', () {
      // 10 buổi gần nhất: 4 có phép + 6 có mặt ⇒ mẫu 6, 100% ⇒ không cảnh báo.
      final c = course([...rep(absent, 5), ...rep(excused, 4), ...rep(present, 6)]);
      expect(c.recentPast.where((s) => s.mark == excused), hasLength(4));
      expect(c.isWarning, isFalse);
    });

    test('buổi bị hủy và sắp tới không nằm trong cửa sổ', () {
      final c = course([...rep(absent, 5), CourseSessionMark.cancelled, CourseSessionMark.upcoming]);
      expect(c.recentPast, hasLength(5));
      expect(c.isWarning, isTrue);
    });
  });

  group('AttendancePenalty', () {
    AttendancePenalty penalty(double rate) => AttendancePenalty(
      id: 'p',
      classId: 'c',
      className: 'C',
      reason: 'r',
      attendanceRate: rate,
      releasedCount: 0,
      status: PenaltyStatus.applied,
      createdAt: day0,
    );

    test('ratePercent đổi tỷ lệ 0–1 thành số phần trăm (không in 0.65%)', () {
      expect(penalty(0.65).ratePercent, 65);
      expect(penalty(0.667).ratePercent, 67);
      expect(penalty(0).ratePercent, 0);
    });
  });

  test('AttendanceApiRepository: tóm tắt BE ⇒ vắng = absent + noShow, có phép giữ riêng, phạt 65 ⇒ 65%', () async {
    final api = FakeApi();
    api.backend.on(
      'GET /attendance/my/summary',
      (_) async => FakeReply.ok({
        'buckets': [
          {
            'classId': 'c1',
            'className': 'PT Premium Giảm Mỡ',
            'sampleSize': 6,
            'presentCount': 3,
            'lateCount': 1,
            'absentCount': 1,
            'noShowCount': 1,
            'excusedCount': 2,
            'attendanceRate': 66.7,
            'status': 'RELEASE',
          },
        ],
        'penalties': [
          {
            'id': 'pen1',
            'classId': 'c1',
            'className': 'PT Premium Giảm Mỡ',
            'reason': 'Chuyên cần 65% trên 10 buổi gần nhất.',
            'status': 'APPLIED',
            'attendanceRate': 65,
            'releasedCount': 0,
            'appealDeadline': day0.add(const Duration(hours: 72)).toIso8601String(),
          },
        ],
      }),
    );
    final repo = AttendanceApiRepository(api.client);
    final s = (await repo.mySummary()).single;
    expect((s.present, s.late, s.absent, s.excused), (3, 1, 2, 2));
    expect(s.counted, 6);
    expect(s.rate, closeTo(0.667, 0.001), reason: 'khớp attendanceRate 66,7% của BE');
    final p = (await repo.myPenalties()).single;
    expect(p.ratePercent, 65);
  });
}
