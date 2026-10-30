import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/utils/money.dart';
import 'package:sports_center_mobile/core/utils/validators.dart';
import 'package:sports_center_mobile/core/utils/vn_time.dart';

void main() {
  group('Money', () {
    test('định dạng VND có dấu chấm ngăn cách', () {
      expect(Money.format(1200000), '1.200.000 đ');
      expect(Money.signed(85000), '+85.000 đ');
      expect(Money.signed(-85000), '−85.000 đ');
    });

    test('parse chuỗi decimal của BE và chuỗi người dùng gõ', () {
      expect(Money.parse('1200000.00'), 1200000);
      expect(Money.parse(null), 0);
      expect(Money.parseInput('1.200.000'), 1200000);
      expect(Money.parseInput(''), isNull);
    });
  });

  group('VnTime (Asia/Ho_Chi_Minh)', () {
    test('hiển thị giờ VN bất kể múi giờ máy', () {
      final instant = DateTime.utc(2026, 10, 8, 23, 30); // 06:30 ngày 09/10 giờ VN
      expect(VnTime.time(instant), '06:30');
      expect(VnTime.date(instant), '09/10/2026');
      expect(VnTime.weekdayOf(instant), 'Thứ 6');
    });

    test('fromWall ⇄ wall', () {
      final t = VnTime.fromWall(2026, 1, 4, 8, 0);
      expect(t.toUtc().hour, 1);
      expect(VnTime.weekdayOf(t), 'Chủ nhật');
    });

    test('đếm ngược mm:ss', () {
      expect(VnTime.countdown(const Duration(minutes: 14, seconds: 5)), '14:05');
      expect(VnTime.countdown(const Duration(seconds: -3)), '00:00');
      expect(VnTime.countdown(const Duration(hours: 104, minutes: 39)), '4 ngày 8 giờ');
    });
  });

  group('Validators', () {
    test('email / mật khẩu / điện thoại theo ràng buộc BE', () {
      expect(Validators.email('a@b.vn'), isNull);
      expect(Validators.email('abc'), isNotNull);
      expect(Validators.password('12345'), isNotNull);
      expect(Validators.password('123456'), isNull);
      expect(Validators.phoneOptional(''), isNull);
      expect(Validators.phoneOptional('0912345678'), isNull);
      expect(Validators.phoneOptional('12ab'), isNotNull);
    });

    test('mã điểm danh dự phòng loại 0, O, 1, I', () {
      expect(Validators.attendanceCode('k7m2qp'), isNull);
      expect(Validators.attendanceCode('KO1234'), isNotNull);
      expect(Validators.otp('246810'), isNull);
      expect(Validators.otp('24681'), isNotNull);
    });
  });
}
