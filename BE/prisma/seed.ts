import "dotenv/config";
import { PrismaClient, ClassType, AreaType, PaymentMethod, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const SALT = 12;

  // ─── ROLES (bảng tra cứu vai trò) ───────────────────
  const ROLE_SEED = [
    { name: "MEMBER", description: "Hội viên — mua khóa học, đặt lịch, điểm danh" },
    { name: "COACH", description: "Huấn luyện viên — mở lớp, dạy, nhận 85% doanh thu" },
    { name: "MANAGER", description: "Quản lý trung tâm — toàn quyền quản trị" },
  ];
  for (const r of ROLE_SEED) {
    await prisma.role.upsert({ where: { name: r.name }, update: {}, create: r });
  }
  console.log("Roles ready");

  // ─── USERS ───────────────────────────────────────────
  const managerPwd = await bcrypt.hash("Manager@123", SALT);
  const coachPwd = await bcrypt.hash("Coach@123", SALT);
  const memberPwd = await bcrypt.hash("Member@123", SALT);

  // Manager
  const manager = await prisma.user.upsert({
    where: { email: "manager@sportscenter.com" },
    update: {},
    create: {
      email: "manager@sportscenter.com",
      password: managerPwd,
      fullName: "Center Manager",
      phone: "0900000001",
      role: { connect: { name: "MANAGER" } },
      isActive: true,
      managerProfile: { create: {} },
    },
  });
  console.log("Manager:", manager.email);

  // Hệ thống chỉ còn 3 vai trò (MEMBER, COACH, MANAGER) — không còn tài khoản Staff/Lễ tân.

  // Coach 1
  const coach1 = await prisma.user.upsert({
    where: { email: "coach1@sportscenter.com" },
    update: {},
    create: {
      email: "coach1@sportscenter.com",
      password: coachPwd,
      fullName: "Nguyễn Văn Cường",
      phone: "0900000003",
      role: { connect: { name: "COACH" } },
      isActive: true,
      coachProfile: {
        create: {
          specialization: "Gym nền tảng, Giảm mỡ, Phục hồi chức năng",
          experienceYears: 5,
          bio: "HLV Gym 5 năm kinh nghiệm, chứng chỉ NASM-CPT. Chuyên giáo án giảm mỡ và hướng dẫn người mới làm quen phòng tập an toàn.",
          // Hồ sơ chứng nhận đã duyệt sẵn (seed không có file CV ⇒ fileUrl NULL)
          certification: { create: { status: "APPROVED" } },
        },
      },
    },
  });
  console.log("Coach 1:", coach1.email);

  // Coach 2
  const coach2 = await prisma.user.upsert({
    where: { email: "coach2@sportscenter.com" },
    update: {},
    create: {
      email: "coach2@sportscenter.com",
      password: coachPwd,
      fullName: "Trần Thị Mai",
      phone: "0900000004",
      role: { connect: { name: "COACH" } },
      isActive: true,
      coachProfile: {
        create: {
          specialization: "Tăng cơ, Sức mạnh (Powerlifting)",
          experienceYears: 7,
          bio: "HLV Strength & Conditioning 7 năm kinh nghiệm, từng thi đấu Powerlifting. Chuyên giáo án tăng cơ, tăng sức mạnh.",
          // Hồ sơ chứng nhận đã duyệt sẵn (seed không có file CV ⇒ fileUrl NULL)
          certification: { create: { status: "APPROVED" } },
        },
      },
    },
  });
  console.log("Coach 2:", coach2.email);

  // Members
  const member1 = await prisma.user.upsert({
    where: { email: "member1@example.com" },
    update: {},
    create: {
      email: "member1@example.com",
      password: memberPwd,
      fullName: "Phạm Văn An",
      phone: "0900000005",
      role: { connect: { name: "MEMBER" } },
      isActive: true,
      memberProfile: {
        create: {
          fitnessGoal: "Giảm 5kg trong 3 tháng",
          fitnessGoals: ["WEIGHT_LOSS", "GYM_FOUNDATION"],
          trainingLevel: "BEGINNER",
          trainingPreference: "Buổi sáng",
        },
      },
    },
    include: { memberProfile: true },
  });
  console.log("Member 1:", member1.email);

  const member2 = await prisma.user.upsert({
    where: { email: "member2@example.com" },
    update: {},
    create: {
      email: "member2@example.com",
      password: memberPwd,
      fullName: "Hoàng Thị Bình",
      phone: "0900000006",
      role: { connect: { name: "MEMBER" } },
      isActive: true,
      memberProfile: {
        create: {
          fitnessGoal: "Tăng cơ tay và vai",
          fitnessGoals: ["MUSCLE_GAIN", "STRENGTH"],
          trainingLevel: "INTERMEDIATE",
          trainingPreference: "Buổi tối",
        },
      },
    },
    include: { memberProfile: true },
  });
  console.log("Member 2:", member2.email);

  const member3 = await prisma.user.upsert({
    where: { email: "member3@example.com" },
    update: {},
    create: {
      email: "member3@example.com",
      password: memberPwd,
      fullName: "Đỗ Minh Chiến",
      phone: "0900000007",
      role: { connect: { name: "MEMBER" } },
      isActive: true,
      memberProfile: {
        create: {
          fitnessGoal: "Nâng cao thể lực",
          fitnessGoals: ["ENDURANCE", "STRENGTH"],
          trainingLevel: "ADVANCED",
          trainingPreference: "Cuối tuần",
        },
      },
    },
    include: { memberProfile: true },
  });
  console.log("Member 3:", member3.email);

  // Account riêng để kiểm thử thanh toán SePay (MEMBER + memberProfile).
  const memberSepay = await prisma.user.upsert({
    where: { email: "sepay.test@example.com" },
    update: {},
    create: {
      email: "sepay.test@example.com",
      password: memberPwd,
      fullName: "SePay Test Member",
      phone: "0900000008",
      role: { connect: { name: "MEMBER" } },
      isActive: true,
      memberProfile: {
        create: {
          fitnessGoal: "Kiểm thử thanh toán VietQR",
          trainingLevel: "BEGINNER",
          trainingPreference: "Cuối tuần",
        },
      },
    },
    include: { memberProfile: true },
  });
  console.log("Member SePay test:", memberSepay.email);

  // ─── ROOMS ───────────────────────────────────────────
  // Phạm vi Gym: mọi phòng là khu trong nhà, có tầng + khu vực + chỉ dẫn để hội viên/HLV tìm đường.
  const room1 = await prisma.room.upsert({
    where: { name: "Khu Tạ Tự Do A" },
    update: { areaType: AreaType.INDOOR },
    create: {
      name: "Khu Tạ Tự Do A",
      capacity: 20,
      floor: "Tầng 1",
      location: "Khu tạ tự do (bên trái quầy lễ tân)",
      directions: "Vào sảnh chính, đi thẳng qua quầy, rẽ trái.",
      areaType: AreaType.INDOOR,
      isActive: true,
    },
  });

  const room2 = await prisma.room.upsert({
    where: { name: "Phòng Functional B" },
    update: { areaType: AreaType.INDOOR },
    create: {
      name: "Phòng Functional B",
      capacity: 15,
      floor: "Tầng 2",
      location: "Phòng kính cạnh khu cardio",
      directions: "Thang máy/ thang bộ lên tầng 2, phòng kính đầu tiên bên phải.",
      areaType: AreaType.INDOOR,
      isActive: true,
    },
  });

  await prisma.room.upsert({
    where: { name: "Phòng PT 1-1" },
    update: { areaType: AreaType.INDOOR },
    create: {
      name: "Phòng PT 1-1",
      capacity: 8,
      floor: "Tầng 3",
      location: "Khu huấn luyện cá nhân",
      directions: "Lên tầng 3, cuối hành lang.",
      areaType: AreaType.INDOOR,
      isActive: true,
    },
  });
  console.log("Rooms created");

  // ─── THÔNG TIN TRUNG TÂM ─────────────────────────────
  await prisma.centerSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: "Pulse Gym Center",
      address: "7 Đường D1, Khu Công nghệ cao, Phường Tăng Nhơn Phú, TP. Hồ Chí Minh",
      hotline: "0900000001",
      email: "lienhe@pulsegym.vn",
      openingHours: "05:30 – 22:00 hằng ngày (CN đến 20:00)",
      parkingNote: "Gửi xe máy miễn phí tại tầng hầm B1, lối vào cổng phụ đường D1.",
      description: "Trung tâm Gym 3 tầng: khu tạ tự do, phòng functional, phòng PT 1-1, khu cardio.",
    },
  });

  // ─── CLASSES ─────────────────────────────────────────
  const coachProfile1 = await prisma.coachProfile.findUnique({ where: { userId: coach1.id } });
  const coachProfile2 = await prisma.coachProfile.findUnique({ where: { userId: coach2.id } });
  if (!coachProfile1 || !coachProfile2) throw new Error("Seed: thiếu CoachProfile của coach1/coach2");
  // Mỗi lớp đúng 1 HLV (Class.coachId): Yoga + Premium Yoga → coach1, HIIT → coach2.

  const yogaClass = await prisma.class.upsert({
    where: { id: "class-yoga-001" },
    update: { areaType: AreaType.INDOOR, coach: { connect: { id: coachProfile1.id } } },
    create: {
      // Seed dùng ID custom ổn định (không phải UUID) để test/dev dễ tham chiếu.
      // API giữ string.min(1), KHÔNG ép uuid để tương thích các ID này.
      id: "class-yoga-001",
      name: "Gym Nền Tảng Buổi Sáng",
      description: "Làm quen phòng gym: kỹ thuật squat, deadlift, đẩy ngực cơ bản và cách dùng máy an toàn.",
      fitness: "Gym",
      goal: "Thành thạo 6 bài compound cơ bản, giảm 2–3% mỡ cơ thể sau 8 tuần.",
      goalTags: ["GYM_FOUNDATION", "WEIGHT_LOSS", "GENERAL_HEALTH"],
      targetLevel: "BEGINNER",
      coach: { connect: { id: coachProfile1.id } },
      capacity: 15,
      classType: ClassType.REGULAR,
      areaType: AreaType.INDOOR,
      isActive: true,
      status: "APPROVED",
      price: 400000,
    },
  });

  const hiitClass = await prisma.class.upsert({
    where: { id: "class-hiit-001" },
    update: { areaType: AreaType.INDOOR, coach: { connect: { id: coachProfile2.id } } },
    create: {
      id: "class-hiit-001",
      name: "Tăng Cơ – Sức Mạnh",
      description: "Giáo án hypertrophy + strength theo chu kỳ, theo dõi mức tạ từng buổi.",
      fitness: "Gym",
      goal: "Tăng 2kg cơ nạc và 10–15% mức tạ squat/bench sau 8 tuần.",
      goalTags: ["MUSCLE_GAIN", "STRENGTH"],
      targetLevel: "INTERMEDIATE",
      coach: { connect: { id: coachProfile2.id } },
      capacity: 12,
      classType: ClassType.REGULAR,
      areaType: AreaType.INDOOR,
      isActive: true,
      status: "APPROVED",
      price: 450000,
    },
  });

  const premiumYoga = await prisma.class.upsert({
    where: { id: "class-yoga-premium-001" },
    update: { areaType: AreaType.INDOOR, coach: { connect: { id: coachProfile1.id } } },
    create: {
      id: "class-yoga-premium-001",
      name: "PT Premium Giảm Mỡ",
      description: "Nhóm nhỏ tối đa 8 người, HLV kèm sát, kết hợp tạ + conditioning + tư vấn dinh dưỡng.",
      fitness: "Gym",
      goal: "Giảm 4–6kg mỡ, săn chắc vóc dáng sau 8 tuần.",
      goalTags: ["WEIGHT_LOSS", "BODY_SHAPING", "ENDURANCE"],
      coach: { connect: { id: coachProfile1.id } },
      capacity: 8,
      classType: ClassType.PREMIUM,
      areaType: AreaType.INDOOR,
      isActive: true,
      status: "APPROVED",
      price: 1200000,
    },
  });
  console.log("Classes created (mỗi lớp 1 HLV)");

  // ─── CLASS SCHEDULES ─────────────────────────────────
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);

  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  dayAfter.setHours(9, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(18, 0, 0, 0);

  const schedule1 = await prisma.classSchedule.upsert({
    where: { id: "sch-yoga-001" },
    update: {},
    create: {
      id: "sch-yoga-001",
      classId: yogaClass.id,
      roomId: room1.id,
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000), // +1h
      status: "SCHEDULED",
    },
  });

  const schedule2StartTime = new Date(dayAfter);
  const schedule2 = await prisma.classSchedule.upsert({
    where: { id: "sch-hiit-001" },
    update: {},
    create: {
      id: "sch-hiit-001",
      classId: hiitClass.id,
      roomId: room2.id,
      startTime: schedule2StartTime,
      endTime: new Date(schedule2StartTime.getTime() + 45 * 60 * 1000), // +45min
      status: "SCHEDULED",
    },
  });

  const schedule3StartTime = new Date(nextWeek);
  await prisma.classSchedule.upsert({
    where: { id: "sch-yoga-premium-001" },
    update: {},
    create: {
      id: "sch-yoga-premium-001",
      classId: premiumYoga.id,
      roomId: room1.id,
      startTime: schedule3StartTime,
      endTime: new Date(schedule3StartTime.getTime() + 90 * 60 * 1000), // +1.5h
      status: "SCHEDULED",
    },
  });
  console.log("Class Schedules created");

  // ─── PRODUCTS (cửa hàng trong gym) ───────────────────
  // id cố định + update rỗng ⇒ chạy seed lại không tạo trùng và không ghi đè tồn kho đã thay đổi khi test mua.
  const products = [
    { id: "prd-water-001", name: "Nước suối Aquafina 500ml", description: "Nước uống đóng chai, ướp lạnh tại quầy.", price: 10000, stockQuantity: 100, isActive: true },
    { id: "prd-whey-001", name: "Whey Protein Isolate 1kg", description: "Bột protein hỗ trợ phục hồi và tăng cơ sau buổi tập.", price: 850000, stockQuantity: 20, isActive: true },
    { id: "prd-towel-001", name: "Khăn tập thể thao", description: "Khăn cotton thấm hút mồ hôi, kích thước 30x90cm.", price: 60000, stockQuantity: 40, isActive: true },
    { id: "prd-bottle-001", name: "Bình nước thể thao 750ml", description: "Bình nhựa không BPA, có nắp chống tràn.", price: 120000, stockQuantity: 30, isActive: true },
    { id: "prd-gloves-001", name: "Găng tay tập gym", description: "Găng tay hở ngón, chống chai tay khi tập tạ.", price: 150000, stockQuantity: 25, isActive: true },
    { id: "prd-yogamat-001", name: "Thảm Yoga TPE 6mm", description: "Thảm chống trượt, nhẹ, dễ cuộn mang theo.", price: 250000, stockQuantity: 15, isActive: true },
    // Sản phẩm đã ngừng bán — để test: không hiện ở GET /products mặc định, mua thì bị từ chối.
    { id: "prd-energy-001", name: "Nước tăng lực (ngừng bán)", description: "Sản phẩm đã ngừng kinh doanh.", price: 15000, stockQuantity: 0, isActive: false },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, createdById: manager.id },
    });
  }
  console.log("Products created");

  // ─── MEMBERSHIP PLANS (gói tập gym tự do) ─────────────
  const membershipPlans = [
    { id: "mbp-1m", name: "Gói 1 tháng", durationDays: 30, price: 500000, description: "Tập tự do không giới hạn trong 30 ngày." },
    { id: "mbp-3m", name: "Gói 3 tháng", durationDays: 90, price: 1200000, description: "Tiết kiệm 20% so với gói tháng." },
    { id: "mbp-6m", name: "Gói 6 tháng", durationDays: 180, price: 2000000, description: "Tiết kiệm hơn 30% so với gói tháng." },
  ];
  for (const p of membershipPlans) {
    await prisma.membershipPlan.upsert({ where: { id: p.id }, update: {}, create: p });
  }
  console.log("Membership plans created");

  // Ngày khai giảng / kết thúc của khóa = buổi chưa hủy sớm nhất / muộn nhất (BE tự duy trì khi lịch đổi).
  await prisma.$executeRaw`
    UPDATE "Class" c SET "startDate" = s.min_start, "endDate" = s.max_end
    FROM (SELECT "classId", MIN("startTime") AS min_start, MAX("endTime") AS max_end
          FROM "ClassSchedule" WHERE "status" <> 'CANCELLED' GROUP BY "classId") s
    WHERE s."classId" = c."id"`;

  console.log("  SePay:    sepay.test@example.com   / Member@123");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
