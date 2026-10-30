import '../../features/catalog/domain/entities/catalog.dart';
import '../../features/classes/domain/entities/course.dart';
import '../mock_tables.dart';
import 'seed_helpers.dart';

const _mon = 1, _tue = 2, _wed = 3, _thu = 4, _fri = 5, _sat = 6, _sun = 7;

/// Danh sách buổi chính của các khóa mà [seedClassActivity] cần gắn dữ liệu.
typedef SeededSessions = ({List<SessionRow> c1, List<SessionRow> c6, List<SessionRow> c8});

/// Bộ môn, phòng, khóa học, buổi học. Chạy ngay trước [seedClassActivity]
/// (thứ tự sinh id phải giữ nguyên).
SeededSessions seedClasses(Seeder s) {
  final db = s.db;

  db.sports.addAll(const [
    Sport(id: 'sp-yoga', name: 'Yoga', areaTypes: [AreaType.indoor]),
    Sport(id: 'sp-pilates', name: 'Pilates', areaTypes: [AreaType.indoor]),
    Sport(id: 'sp-swim', name: 'Bơi lội', areaTypes: [AreaType.pool]),
    Sport(id: 'sp-gym', name: 'Gym', areaTypes: [AreaType.indoor]),
    Sport(id: 'sp-boxing', name: 'Boxing', areaTypes: [AreaType.indoor]),
    Sport(id: 'sp-badminton', name: 'Cầu lông', areaTypes: [AreaType.indoor]),
    Sport(id: 'sp-hiit', name: 'HIIT', areaTypes: [AreaType.indoor, AreaType.outdoor]),
    Sport(id: 'sp-run', name: 'Chạy bộ', areaTypes: [AreaType.outdoor]),
  ]);
  db.rooms.addAll(const [
    Room(id: 'r-yoga', name: 'Phòng Yoga A', capacity: 20, areaType: AreaType.indoor, location: 'Tầng 2'),
    Room(id: 'r-studio', name: 'Studio B', capacity: 15, areaType: AreaType.indoor, location: 'Tầng 2'),
    Room(id: 'r-pool', name: 'Hồ bơi 25m', capacity: 30, areaType: AreaType.pool, location: 'Tầng trệt'),
    Room(id: 'r-gym', name: 'Phòng Gym', capacity: 25, areaType: AreaType.indoor, location: 'Tầng 1'),
    Room(id: 'r-box', name: 'Sàn Boxing', capacity: 16, areaType: AreaType.indoor, location: 'Tầng 3'),
    Room(id: 'r-court', name: 'Sân cầu lông 1', capacity: 12, areaType: AreaType.indoor, location: 'Nhà thi đấu'),
    Room(id: 'r-field', name: 'Sân ngoài trời', capacity: 40, areaType: AreaType.outdoor, location: 'Khuôn viên'),
  ]);

  ClassRow cls(
    String id,
    String name,
    String coach,
    List<String> sports,
    int price,
    int cap,
    ClassType type,
    AreaType area,
    ClassStatus status, {
    String? desc,
    int createdDay = -30,
    String? reject,
  }) {
    final row = ClassRow(
      id: id,
      name: name,
      description: desc,
      sportIds: sports,
      price: price,
      status: status,
      coachProfileId: coach,
      capacity: cap,
      classType: type,
      areaType: area,
      createdAt: s.at(createdDay, 9),
      rejectReason: reject,
    );
    db.classes.add(row);
    return row;
  }

  // c1 — Yoga sáng của coach@demo.vn, đang học; có buổi dạy bù đang diễn ra.
  cls(
    'c1',
    'Yoga Flow buổi sáng',
    'cp-1',
    ['sp-yoga'],
    1200000,
    15,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.approved,
    desc: 'Chuỗi động tác Vinyasa nhẹ nhàng giúp khởi động ngày mới, tăng độ linh hoạt và hơi thở sâu. Phù hợp mọi trình độ.',
    createdDay: -25,
  );
  final c1 = s.sessions(
    'c1',
    'r-yoga',
    startDay: -15,
    weekdays: [_mon, _wed, _fri],
    hour: 6,
    minute: 30,
    durationMinutes: 60,
    count: 12,
    keepLastPastOpen: true,
  );
  final nowMinute = s.now.toUtc();
  s.cancelWithMakeup(
    c1[1],
    DateTime.utc(
      nowMinute.year,
      nowMinute.month,
      nowMinute.day,
      nowMinute.hour,
      nowMinute.minute,
    ).subtract(const Duration(minutes: 10)),
    'HLV bị ốm đột xuất',
  );

  // c2 — Pilates Premium sắp khai giảng (còn > 24h ⇒ thử mua / hủy khóa).
  cls(
    'c2',
    'Pilates Core nâng cao',
    'cp-1',
    ['sp-pilates'],
    2400000,
    10,
    ClassType.premium,
    AreaType.indoor,
    ClassStatus.approved,
    desc: 'Tập trung nhóm cơ trung tâm, cải thiện tư thế và sức mạnh cốt lõi. Lớp nhỏ tối đa 10 học viên.',
    createdDay: -10,
  );
  s.sessions('c2', 'r-studio', startDay: 5, weekdays: [_tue, _thu], hour: 18, durationMinutes: 60, count: 8);

  // c3 — đã kết thúc (doanh thu cũ của HLV).
  cls(
    'c3',
    'Yoga cho người mới',
    'cp-1',
    ['sp-yoga'],
    900000,
    12,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.completed,
    desc: 'Làm quen các tư thế cơ bản và hơi thở.',
    createdDay: -70,
  );
  s.sessions('c3', 'r-yoga', startDay: -60, weekdays: [_tue, _thu], hour: 19, durationMinutes: 60, count: 8);

  // c4 — chờ duyệt; c5 — bị từ chối (có lý do, sửa & gửi lại).
  cls(
    'c4',
    'Thiền & Giãn cơ cuối tuần',
    'cp-1',
    ['sp-yoga'],
    600000,
    20,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.pending,
    desc: 'Thiền chánh niệm kết hợp giãn cơ sâu, phục hồi sau tuần làm việc.',
    createdDay: -1,
  );
  s.sessions('c4', 'r-yoga', startDay: 10, weekdays: [_sat, _sun], hour: 8, durationMinutes: 60, count: 6);
  cls(
    'c5',
    'Yoga trị liệu cột sống',
    'cp-1',
    ['sp-yoga', 'sp-pilates'],
    3500000,
    8,
    ClassType.premium,
    AreaType.indoor,
    ClassStatus.rejected,
    desc: 'Bài tập hỗ trợ người đau lưng, thoát vị đĩa đệm nhẹ.',
    createdDay: -4,
    reject: 'Giá chưa phù hợp với số buổi. Mô tả cần nêu rõ đối tượng không phù hợp (chống chỉ định).',
  );
  s.sessions('c5', 'r-studio', startDay: 14, weekdays: [_mon, _wed], hour: 17, durationMinutes: 60, count: 10);

  // c6 — Bơi (HLV khác), có buổi bị hủy chọn HOÀN TIỀN.
  cls(
    'c6',
    'Bơi sải cơ bản',
    'cp-2',
    ['sp-swim'],
    1800000,
    12,
    ClassType.regular,
    AreaType.pool,
    ClassStatus.approved,
    desc: 'Học thở, đạp chân và tay sải đúng kỹ thuật. Bơi được 50m liên tục sau khóa học.',
    createdDay: -20,
  );
  final c6 = s.sessions('c6', 'r-pool', startDay: -15, weekdays: [_sat, _sun], hour: 8, durationMinutes: 60, count: 8);
  s.cancelWithRefund(c6[1], 'Hồ bơi bảo trì hệ thống lọc nước');

  // c7 — Boxing Premium gần hết chỗ.
  cls(
    'c7',
    'Boxing thể lực',
    'cp-3',
    ['sp-boxing'],
    2000000,
    10,
    ClassType.premium,
    AreaType.indoor,
    ClassStatus.approved,
    desc: 'Kỹ thuật đấm cơ bản, footwork và bài thể lực cường độ cao.',
    createdDay: -12,
  );
  s.sessions(
    'c7',
    'r-box',
    startDay: 2,
    weekdays: [_mon, _wed, _fri],
    hour: 19,
    minute: 30,
    durationMinutes: 90,
    count: 12,
  );

  // c8 — HIIT, Member 1 bị phạt chuyên cần.
  cls(
    'c8',
    'HIIT đốt mỡ 30 phút',
    'cp-3',
    ['sp-hiit'],
    900000,
    20,
    ClassType.regular,
    AreaType.outdoor,
    ClassStatus.approved,
    desc: 'Bài tập ngắt quãng cường độ cao ngoài trời.',
    createdDay: -30,
  );
  final c8 = s.sessions(
    'c8',
    'r-field',
    startDay: -20,
    weekdays: [_tue, _thu, _sat],
    hour: 6,
    durationMinutes: 30,
    count: 12,
  );
  s.cancelWithRefund(c8[2], 'Mưa lớn, sân ngoài trời không đảm bảo an toàn');

  // c9 — Cầu lông đã kín chỗ.
  cls(
    'c9',
    'Cầu lông nâng cao',
    'cp-2',
    ['sp-badminton'],
    1500000,
    8,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.approved,
    desc: 'Chiến thuật đánh đôi, đập cầu và di chuyển.',
    createdDay: -14,
  );
  s.sessions('c9', 'r-court', startDay: 3, weekdays: [_mon, _thu], hour: 20, durationMinutes: 90, count: 8);

  // c10 — Gym trùng giờ với c1 của Member 1.
  cls(
    'c10',
    'Gym sức mạnh tổng thể',
    'cp-3',
    ['sp-gym'],
    1600000,
    15,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.approved,
    desc: 'Giáo án tạ tự do 3 buổi/tuần cho người đã có nền tảng.',
    createdDay: -8,
  );
  s.sessions(
    'c10',
    'r-gym',
    startDay: 1,
    weekdays: [_mon, _wed, _fri],
    hour: 6,
    minute: 30,
    durationMinutes: 60,
    count: 12,
  );

  // c11 — chờ duyệt (HLV khác) ⇒ cho Manager duyệt.
  cls(
    'c11',
    'Bơi bướm kỹ thuật',
    'cp-2',
    ['sp-swim'],
    2200000,
    10,
    ClassType.premium,
    AreaType.pool,
    ClassStatus.pending,
    desc: 'Dành cho học viên đã bơi thành thạo sải và ếch.',
    createdDay: -2,
  );
  s.sessions('c11', 'r-pool', startDay: 12, weekdays: [_tue, _thu], hour: 7, durationMinutes: 60, count: 8);

  // c12 — Member 1 đã hủy khóa & được hoàn tiền.
  cls(
    'c12',
    'Cầu lông cơ bản',
    'cp-2',
    ['sp-badminton'],
    1000000,
    10,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.approved,
    desc: 'Cầm vợt, phát cầu, đánh cầu cao sâu.',
    createdDay: -16,
  );
  s.sessions('c12', 'r-court', startDay: 7, weekdays: [_tue, _sat], hour: 18, durationMinutes: 90, count: 8);

  // c13, c14 — khóa đã kết thúc của HLV 4 và 5.
  cls(
    'c13',
    'Gym nền tảng 4 tuần',
    'cp-4',
    ['sp-gym'],
    1400000,
    12,
    ClassType.regular,
    AreaType.indoor,
    ClassStatus.completed,
    createdDay: -60,
  );
  s.sessions('c13', 'r-gym', startDay: -50, weekdays: [_tue, _thu, _sat], hour: 17, durationMinutes: 60, count: 12);
  cls(
    'c14',
    'Chạy bộ 5km cho người mới',
    'cp-5',
    ['sp-run'],
    800000,
    20,
    ClassType.regular,
    AreaType.outdoor,
    ClassStatus.completed,
    createdDay: -55,
  );
  s.sessions(
    'c14',
    'r-field',
    startDay: -45,
    weekdays: [_sat, _sun],
    hour: 5,
    minute: 30,
    durationMinutes: 60,
    count: 8,
  );

  return (c1: c1, c6: c6, c8: c8);
}
