// Các "bảng" của BE giả lập — mỗi lớp tương ứng một model Prisma
// (`BE/prisma/schema.prisma`). Mutable để mock mô phỏng thao tác ghi.
// CHỈ dùng trong `lib/mock` và các `*_mock_repository.dart`.

export 'tables/class_tables.dart';
export 'tables/commerce_tables.dart';
export 'tables/people_tables.dart';
export 'tables/social_tables.dart';
