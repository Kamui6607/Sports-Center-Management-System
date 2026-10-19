/// Khu vực tập (`AreaType`). Phạm vi Gym: mọi phòng/khóa mới là `indoor`.
enum AreaType { pool, indoor, outdoor }

/// Bộ môn (`Sport`, bảng `Fitness` dưới DB). Phạm vi Gym: chỉ còn "Gym".
class Sport {
  const Sport({required this.id, required this.name, this.description, this.areaTypes = const []});

  final String id;
  final String name;
  final String? description;
  final List<AreaType> areaTypes;
}

/// Bộ môn duy nhất của hệ thống (BE `GYM_FITNESS`).
const kGymSport = Sport(id: 'Gym', name: 'Gym');

/// Phòng tập (`Room`) — kèm vị trí trong trung tâm để học viên/HLV tìm đường.
class Room {
  const Room({
    required this.id,
    required this.name,
    required this.capacity,
    required this.areaType,
    this.location,
    this.floor,
    this.directions,
  });

  final String id;
  final String name;
  final int capacity;
  final AreaType areaType;

  /// Khu vực trong trung tâm (VD "Khu tạ tự do").
  final String? location;

  /// Tầng (VD "Tầng 2").
  final String? floor;

  /// Chỉ dẫn đường đi.
  final String? directions;

  /// "Tầng 2 · Khu tạ tự do" (rỗng nếu chưa cấu hình).
  String get placeLabel => [floor, location].where((p) => p != null && p.trim().isNotEmpty).join(' · ');
}

/// Mục tiêu tập luyện (danh mục chung `GET /classes/goal-options`).
class GoalOption {
  const GoalOption(this.code, this.label, [this.description]);

  final String code;
  final String label;
  final String? description;
}

/// Danh mục mặc định (trùng `BE/src/config/fitness-goals.ts`) — dùng khi chưa tải được từ BE và cho mock.
const kFitnessGoals = <GoalOption>[
  GoalOption('WEIGHT_LOSS', 'Giảm mỡ / giảm cân', 'Đốt mỡ, kiểm soát cân nặng, cải thiện chỉ số cơ thể.'),
  GoalOption('MUSCLE_GAIN', 'Tăng cơ', 'Phát triển khối cơ, tăng cân nạc.'),
  GoalOption('STRENGTH', 'Tăng sức mạnh', 'Nâng mức tạ các bài compound (squat, deadlift, bench…).'),
  GoalOption('ENDURANCE', 'Tăng sức bền', 'Cải thiện tim mạch, thể lực, khả năng tập lâu.'),
  GoalOption('BODY_SHAPING', 'Săn chắc, cải thiện vóc dáng', 'Định hình cơ thể, vòng eo – mông – tay săn chắc.'),
  GoalOption('MOBILITY', 'Linh hoạt & tư thế', 'Giãn cơ, cải thiện biên độ khớp, chỉnh tư thế.'),
  GoalOption('REHAB', 'Phục hồi chấn thương', 'Tập phục hồi chức năng an toàn, có hướng dẫn kỹ.'),
  GoalOption('GENERAL_HEALTH', 'Nâng cao sức khỏe tổng quát', 'Duy trì sức khỏe, giảm stress, ngủ ngon hơn.'),
  GoalOption('GYM_FOUNDATION', 'Làm quen phòng gym', 'Dành cho người mới: kỹ thuật cơ bản, dùng máy an toàn.'),
  GoalOption('COMPETITION', 'Chuẩn bị thi đấu thể hình', 'Giáo án chuyên sâu cho vận động viên/thi đấu.'),
];

/// Nhãn tiếng Việt của mã mục tiêu.
String goalLabel(String code) => kFitnessGoals.where((g) => g.code == code).firstOrNull?.label ?? code;

/// Số mục tiêu tối đa: khóa học (Coach chọn) / hồ sơ học viên.
const kMaxClassGoals = 4;
const kMaxMemberGoals = 5;

/// Thông tin trung tâm (`GET /center`) — địa chỉ, giờ mở cửa, hotline.
class CenterInfo {
  const CenterInfo({
    required this.name,
    required this.address,
    required this.mapLink,
    this.hotline,
    this.email,
    this.openingHours,
    this.parkingNote,
    this.description,
  });

  final String name;
  final String address;

  /// Link mở bản đồ (link Manager cấu hình hoặc tìm theo địa chỉ).
  final String mapLink;
  final String? hotline;
  final String? email;
  final String? openingHours;
  final String? parkingNote;
  final String? description;
}
