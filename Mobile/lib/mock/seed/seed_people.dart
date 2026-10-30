import '../../features/auth/domain/entities/app_user.dart';
import '../../features/auth/domain/entities/auth_models.dart';
import '../mock_tables.dart';
import 'seed_helpers.dart';

/// Người dùng, hồ sơ Member/Coach và hồ sơ CV.
void seedPeople(Seeder s) {
  final db = s.db;

  void member(
    String n,
    String email,
    String name,
    Gender g, {
    String? phone,
    String? goal,
    TrainingLevel? level,
    String? pref,
    int? birthYear,
  }) {
    db.users.add(
      UserRow(
        id: 'u-m$n',
        email: email,
        password: kDemoPassword,
        fullName: name,
        role: UserRole.member,
        gender: g,
        phone: phone,
        dateOfBirth: birthYear == null ? null : DateTime.utc(birthYear, 4, 12),
      ),
    );
    db.memberProfiles.add(
      MemberProfileRow(id: 'mp-$n', userId: 'u-m$n', fitnessGoal: goal, trainingLevel: level, trainingPreference: pref),
    );
  }

  member(
    '1',
    'member@demo.vn',
    'Nguyễn Minh Anh',
    Gender.female,
    phone: '0901234567',
    goal: 'Giảm mỡ, tăng sức bền và độ linh hoạt',
    level: TrainingLevel.intermediate,
    pref: 'Thích tập buổi sáng. Đầu gối trái từng chấn thương nhẹ.',
    birthYear: 1998,
  );
  member(
    '2',
    'member2@demo.vn',
    'Trần Gia Bảo',
    Gender.male,
    phone: '0912345678',
    goal: 'Tăng cơ, cải thiện thể lực',
    level: TrainingLevel.beginner,
    birthYear: 2001,
  );
  member('3', 'trang.le@demo.vn', 'Lê Thu Trang', Gender.female, goal: 'Giảm đau lưng', level: TrainingLevel.beginner);
  member('4', 'long.pham@demo.vn', 'Phạm Đức Long', Gender.male, goal: 'Tăng sức mạnh', level: TrainingLevel.advanced);
  member('5', 'chi.hoang@demo.vn', 'Hoàng Mai Chi', Gender.female, goal: 'Giữ dáng', level: TrainingLevel.intermediate);
  member('6', 'viet.dang@demo.vn', 'Đặng Quốc Việt', Gender.male, goal: 'Học bơi', level: TrainingLevel.beginner);
  member('7', 'han.bui@demo.vn', 'Bùi Ngọc Hân', Gender.female, goal: 'Thư giãn, giảm stress');
  member('8', 'dat.vo@demo.vn', 'Võ Thành Đạt', Gender.male, goal: 'Tăng sức bền', level: TrainingLevel.intermediate);
  member('9', 'linh.ngo@demo.vn', 'Ngô Phương Linh', Gender.female, goal: 'Cải thiện tư thế');
  member('10', 'nam.do@demo.vn', 'Đỗ Hải Nam', Gender.male, goal: 'Giảm cân', level: TrainingLevel.beginner);

  void coach(
    String n,
    String email,
    String name,
    Gender g, {
    required String spec,
    int? years,
    String? bio,
    bool active = true,
    CoachApprovalStatus? cv,
    String? cvFile,
    String? reject,
    int cvDay = -30,
  }) {
    db.users.add(
      UserRow(
        id: 'u-c$n',
        email: email,
        password: kDemoPassword,
        fullName: name,
        role: UserRole.coach,
        gender: g,
        phone: '09${n.padLeft(2, '0')}876543',
        isActive: active,
      ),
    );
    db.coachProfiles.add(
      CoachProfileRow(id: 'cp-$n', userId: 'u-c$n', specialization: spec, experienceYears: years, bio: bio),
    );
    if (cv != null) {
      db.certifications.add(
        CertificationRow(
          id: 'cert-$n',
          coachProfileId: 'cp-$n',
          status: cv,
          submittedAt: s.at(cvDay, 14, 20),
          fileName: cvFile,
          fileSizeBytes: cvFile == null ? null : 1843200,
          rejectReason: reject,
        ),
      );
    }
  }

  coach(
    '1',
    'coach@demo.vn',
    'Lê Hoàng Nam',
    Gender.male,
    spec: 'Yoga & Pilates',
    years: 6,
    bio: 'Chứng chỉ Yoga Alliance RYT-500. Chuyên Yoga trị liệu và Pilates cho dân văn phòng.',
    cv: CoachApprovalStatus.approved,
    cvDay: -120,
  );
  coach(
    '2',
    'coach2@demo.vn',
    'Phạm Thu Hà',
    Gender.female,
    spec: 'Bơi lội & Cầu lông',
    years: 8,
    bio: 'Cựu VĐV bơi lội đội tuyển trẻ TP.HCM.',
    cv: CoachApprovalStatus.approved,
    cvDay: -200,
  );
  coach(
    '3',
    'coach3@demo.vn',
    'Đỗ Quang Huy',
    Gender.male,
    spec: 'Boxing & HIIT',
    years: 5,
    bio: 'Huấn luyện viên thể lực, chứng chỉ NASM-CPT.',
    cv: CoachApprovalStatus.approved,
    cvDay: -150,
  );
  coach(
    '4',
    'coach.done@demo.vn',
    'Trịnh Bảo Ngọc',
    Gender.female,
    spec: 'Gym & Sức mạnh',
    years: 4,
    bio: 'PT chuyên tăng cơ giảm mỡ.',
    cv: CoachApprovalStatus.approved,
    cvDay: -100,
  );
  coach(
    '5',
    'coach5@demo.vn',
    'Ngô Thanh Tùng',
    Gender.male,
    spec: 'Chạy bộ & Thể lực',
    years: 3,
    cv: CoachApprovalStatus.approved,
    cvDay: -90,
  );
  coach(
    '6',
    'coach.pending@demo.vn',
    'Vũ Khánh Linh',
    Gender.female,
    spec: 'Yoga bay (Aerial Yoga)',
    years: 3,
    bio: 'Mong muốn mở lớp Aerial Yoga cho người mới.',
    active: false,
    cv: CoachApprovalStatus.pending,
    cvFile: 'CV_VuKhanhLinh_AerialYoga.pdf',
    cvDay: -2,
  );
  coach(
    '7',
    'coach.rejected@demo.vn',
    'Hoàng Đức Tài',
    Gender.male,
    spec: 'Personal Trainer',
    years: 2,
    active: false,
    cv: CoachApprovalStatus.rejected,
    cvFile: 'CV_HoangDucTai.pdf',
    reject: 'Chứng chỉ hành nghề chưa rõ ràng. Vui lòng bổ sung bản scan chứng chỉ PT quốc tế còn hiệu lực.',
    cvDay: -6,
  );
  coach('8', 'coach.new@demo.vn', 'Mai Anh Tuấn', Gender.male, spec: 'Bóng rổ', years: 1, active: false);
  coach(
    '9',
    'khoa.ly@demo.vn',
    'Lý Minh Khoa',
    Gender.male,
    spec: 'Calisthenics',
    years: 5,
    bio: 'Giải nhì Street Workout toàn quốc 2025.',
    active: false,
    cv: CoachApprovalStatus.pending,
    cvFile: 'LyMinhKhoa_CV_Calisthenics.pdf',
    cvDay: -1,
  );

  db.users.add(
    UserRow(
      id: 'u-mg',
      email: 'manager@demo.vn',
      password: kDemoPassword,
      fullName: 'Trần Quốc Bình',
      role: UserRole.manager,
      gender: Gender.male,
      phone: '0909000111',
    ),
  );
}
