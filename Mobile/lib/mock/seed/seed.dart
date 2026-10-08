import '../mock_database.dart';
import 'seed_class_activity.dart';
import 'seed_classes.dart';
import 'seed_commerce.dart';
import 'seed_helpers.dart';
import 'seed_people.dart';
import 'seed_social.dart';

export 'seed_helpers.dart' show kDemoPassword;

/// Dựng cơ sở dữ liệu mock đầy đủ, sinh theo thời điểm [now].
///
/// Tài khoản demo (mật khẩu [kDemoPassword]):
/// - member@demo.vn — đang học 2 khóa, có phạt chuyên cần, đơn hàng chờ thanh toán
/// - member2@demo.vn — khóa sắp khai giảng (thử hủy khóa ≥ 24h)
/// - coach@demo.vn — HLV đã duyệt, có ví, khóa chờ duyệt / bị từ chối, buổi đang diễn ra
/// - coach.done@demo.vn — HLV đủ điều kiện rút tiền
/// - coach.pending@demo.vn / coach.rejected@demo.vn / coach.new@demo.vn — onboarding
/// - manager@demo.vn — Quản lý (duyệt)
MockDatabase seedDatabase(DateTime Function() now) {
  final db = MockDatabase(now: now);
  final seeder = Seeder(db);
  seedPeople(seeder);
  seedClassActivity(seeder, seedClasses(seeder));
  seedCommerce(seeder);
  seedSocial(seeder);
  return db;
}
