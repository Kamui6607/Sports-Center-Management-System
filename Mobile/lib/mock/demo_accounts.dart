import 'seed/seed.dart';

/// OTP đặt lại mật khẩu giả lập (TODO BE-4).
const kDemoOtp = '246810';

/// Tài khoản demo hiển thị trên màn Đăng nhập (CHỈ khi `USE_MOCK=true`).
class DemoAccount {
  const DemoAccount(this.label, this.email);

  final String label;
  final String email;
  String get password => kDemoPassword;
}

const demoAccounts = [
  DemoAccount('Học viên', 'member@demo.vn'),
  DemoAccount('Học viên 2', 'member2@demo.vn'),
  DemoAccount('HLV', 'coach@demo.vn'),
  DemoAccount('HLV đủ ĐK rút', 'coach.done@demo.vn'),
  DemoAccount('HLV chờ duyệt', 'coach.pending@demo.vn'),
  DemoAccount('HLV bị từ chối', 'coach.rejected@demo.vn'),
  DemoAccount('HLV chưa nộp CV', 'coach.new@demo.vn'),
  DemoAccount('Quản lý', 'manager@demo.vn'),
];
