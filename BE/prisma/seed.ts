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
  const staffPwd = await bcrypt.hash("Staff@123", SALT);
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

  // Staff (Receptionist)
  const staff = await prisma.user.upsert({
    where: { email: "staff@sportscenter.com" },
    update: {},
    create: {
      email: "staff@sportscenter.com",
      password: staffPwd,
      fullName: "Lê Thị Lễ Tân",
      phone: "0900000002",
      role: { connect: { name: "MANAGER" } },
      isActive: true,
    },
  });
  console.log("Staff:", staff.email);

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
          specialization: "Yoga, Pilates",
          experienceYears: 5,
          bio: "Chuyên gia Yoga với 5 năm kinh nghiệm giảng dạy.",
          approvalStatus: "APPROVED",
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
          specialization: "HIIT, Strength Training",
          experienceYears: 7,
          bio: "HLV HIIT và Strength Training với 7 năm kinh nghiệm.",
          approvalStatus: "APPROVED",
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
          fitnessGoal: "Giảm cân",
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
          fitnessGoal: "Tăng cơ",
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

  // ─── SPORTS ──────────────────────────────────────────
  const yoga = await prisma.sport.upsert({
    where: { name: "Yoga" },
    update: { areaTypes: [AreaType.INDOOR] },
    create: {
      name: "Yoga",
      description: "Lớp Yoga cải thiện sự linh hoạt, cân bằng và tâm trí.",
      areaTypes: [AreaType.INDOOR],
      isActive: true,
    },
  });

  const hiit = await prisma.sport.upsert({
    where: { name: "HIIT" },
    update: { areaTypes: [AreaType.INDOOR] },
    create: {
      name: "HIIT",
      description: "High Intensity Interval Training – đốt cháy calo hiệu quả.",
      areaTypes: [AreaType.INDOOR],
      isActive: true,
    },
  });

  const swimming = await prisma.sport.upsert({
    where: { name: "Swimming" },
    update: { areaTypes: [AreaType.POOL] },
    create: {
      name: "Swimming",
      description: "Lớp bơi lội cho mọi trình độ.",
      areaTypes: [AreaType.POOL],
      isActive: true,
    },
  });
  console.log("Sports created");

  // ─── ROOMS ───────────────────────────────────────────
  const room1 = await prisma.room.upsert({
    where: { name: "Phòng Yoga A" },
    update: { areaType: AreaType.INDOOR },
    create: {
      name: "Phòng Yoga A",
      capacity: 20,
      location: "Tầng 1",
      areaType: AreaType.INDOOR,
      isActive: true,
    },
  });

  const room2 = await prisma.room.upsert({
    where: { name: "Phòng HIIT B" },
    update: { areaType: AreaType.INDOOR },
    create: {
      name: "Phòng HIIT B",
      capacity: 15,
      location: "Tầng 2",
      areaType: AreaType.INDOOR,
      isActive: true,
    },
  });

  const room3 = await prisma.room.upsert({
    where: { name: "Hồ Bơi" },
    update: { areaType: AreaType.POOL },
    create: {
      name: "Hồ Bơi",
      capacity: 25,
      location: "Tầng Trệt",
      areaType: AreaType.POOL,
      isActive: true,
    },
  });
  console.log("Rooms created");

  // ─── CLASSES ─────────────────────────────────────────
  const coachProfile1 = await prisma.coachProfile.findUnique({ where: { userId: coach1.id } });
  const coachProfile2 = await prisma.coachProfile.findUnique({ where: { userId: coach2.id } });

  const yogaClass = await prisma.class.upsert({
    where: { id: "class-yoga-001" },
    update: { sports: { set: [{ id: yoga.id }] }, areaType: AreaType.INDOOR },
    create: {
      // Seed dùng ID custom ổn định (không phải UUID) để test/dev dễ tham chiếu.
      // API giữ string.min(1), KHÔNG ép uuid để tương thích các ID này.
      id: "class-yoga-001",
      name: "Yoga Buổi Sáng",
      description: "Lớp Yoga nhẹ nhàng buổi sáng, phù hợp mọi trình độ.",
      sports: { connect: [{ id: yoga.id }] },
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
    update: { sports: { set: [{ id: hiit.id }] }, areaType: AreaType.INDOOR },
    create: {
      id: "class-hiit-001",
      name: "HIIT Cardio",
      description: "Lớp HIIT cường độ cao, đốt cháy calo tối đa.",
      sports: { connect: [{ id: hiit.id }] },
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
    update: { sports: { set: [{ id: yoga.id }] }, areaType: AreaType.INDOOR },
    create: {
      id: "class-yoga-premium-001",
      name: "Premium Yoga & Meditation",
      description: "Lớp Yoga Premium với coach 1-1 và thiền định chuyên sâu.",
      sports: { connect: [{ id: yoga.id }] },
      capacity: 8,
      classType: ClassType.PREMIUM,
      areaType: AreaType.INDOOR,
      isActive: true,
      status: "APPROVED",
      price: 1200000,
    },
  });
  console.log("Classes created");

  // Assign coaches
  if (coachProfile1) {
    await prisma.classMember.upsert({
      where: { classId_coachId: { classId: yogaClass.id, coachId: coachProfile1.id } },
      update: {},
      create: { classId: yogaClass.id, coachId: coachProfile1.id, isPrimary: true },
    });
    await prisma.classMember.upsert({
      where: { classId_coachId: { classId: premiumYoga.id, coachId: coachProfile1.id } },
      update: {},
      create: { classId: premiumYoga.id, coachId: coachProfile1.id, isPrimary: true },
    });
  }
  if (coachProfile2) {
    await prisma.classMember.upsert({
      where: { classId_coachId: { classId: hiitClass.id, coachId: coachProfile2.id } },
      update: {},
      create: { classId: hiitClass.id, coachId: coachProfile2.id, isPrimary: true },
    });
  }
  console.log("Coaches assigned");

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
