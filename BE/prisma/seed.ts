import "dotenv/config";
import { PrismaClient, UserRole, ClassType, AreaType, PaymentMethod, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { splitCoursePrice, COURSE_COMMISSION_RATE } from "../src/config/commission.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const SALT = 12;

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
      role: UserRole.MANAGER,
      isActive: true,
      managerProfile: { create: {} },
    },
  });
  console.log("Manager:", manager.email);

  // Coach 1
  const coach1 = await prisma.user.upsert({
    where: { email: "coach1@sportscenter.com" },
    update: {},
    create: {
      email: "coach1@sportscenter.com",
      password: coachPwd,
      fullName: "Nguyễn Văn Cường",
      phone: "0900000003",
      role: UserRole.COACH,
      isActive: true,
      coachProfile: {
        create: {
          specialization: "Yoga, Pilates",
          experienceYears: 5,
          bio: "Chuyên gia Yoga với 5 năm kinh nghiệm giảng dạy.",
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
      role: UserRole.COACH,
      isActive: true,
      coachProfile: {
        create: {
          specialization: "HIIT, Strength Training",
          experienceYears: 7,
          bio: "HLV HIIT và Strength Training với 7 năm kinh nghiệm.",
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
      role: UserRole.MEMBER,
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
      role: UserRole.MEMBER,
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
      role: UserRole.MEMBER,
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
    update: {
      sports: { set: [{ id: yoga.id }] },
      areaType: AreaType.INDOOR,
      price: 500000,
      durationDays: 30,
      ownerCoachId: coachProfile1?.id ?? null,
    },
    create: {
      // Seed dùng ID custom ổn định (không phải UUID) để test/dev dễ tham chiếu.
      // API giữ string.min(1), KHÔNG ép uuid để tương thích các ID này.
      id: "class-yoga-001",
      name: "Yoga Buổi Sáng",
      description: "Khóa Yoga nhẹ nhàng buổi sáng, phù hợp mọi trình độ.",
      sports: { connect: [{ id: yoga.id }] },
      capacity: 15,
      classType: ClassType.REGULAR,
      areaType: AreaType.INDOOR,
      price: 500000,
      durationDays: 30,
      ownerCoachId: coachProfile1?.id ?? null,
      isActive: true,
    },
  });

  const hiitClass = await prisma.class.upsert({
    where: { id: "class-hiit-001" },
    update: {
      sports: { set: [{ id: hiit.id }] },
      areaType: AreaType.INDOOR,
      price: 450000,
      durationDays: 30,
      ownerCoachId: coachProfile2?.id ?? null,
    },
    create: {
      id: "class-hiit-001",
      name: "HIIT Cardio",
      description: "Khóa HIIT cường độ cao, đốt cháy calo tối đa.",
      sports: { connect: [{ id: hiit.id }] },
      capacity: 12,
      classType: ClassType.REGULAR,
      areaType: AreaType.INDOOR,
      price: 450000,
      durationDays: 30,
      ownerCoachId: coachProfile2?.id ?? null,
      isActive: true,
    },
  });

  const premiumYoga = await prisma.class.upsert({
    where: { id: "class-yoga-premium-001" },
    update: {
      sports: { set: [{ id: yoga.id }] },
      areaType: AreaType.INDOOR,
      price: 900000,
      durationDays: 45,
      ownerCoachId: coachProfile1?.id ?? null,
    },
    create: {
      id: "class-yoga-premium-001",
      name: "Premium Yoga & Meditation",
      description: "Khóa Yoga Premium với coach 1-1 và thiền định chuyên sâu.",
      sports: { connect: [{ id: yoga.id }] },
      capacity: 8,
      classType: ClassType.PREMIUM,
      areaType: AreaType.INDOOR,
      price: 900000,
      durationDays: 45,
      ownerCoachId: coachProfile1?.id ?? null,
      isActive: true,
    },
  });
  console.log("Courses (classes) created with price/owner coach");

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

  // ─── COURSE PURCHASES (Member mua khóa học của Coach) ─────────────────
  // Mô hình hoa hồng KHẤU TRỪ: Member trả đúng giá niêm yết; nền tảng giữ 15%; Coach nhận 85%.
  const member1Profile = member1.memberProfile;
  const member2Profile = member2.memberProfile;
  const member3Profile = member3.memberProfile;

  /** Seed 1 lượt mua khóa học (idempotent: member đã có lượt ACTIVE cho khóa này thì bỏ qua). */
  async function seedCoursePurchase(opts: {
    memberProfileId: string;
    memberName: string;
    course: { id: string; name: string; price: unknown; durationDays: number | null; ownerCoachId: string | null };
    method: PaymentMethod;
    note: string;
    invoiceSuffix: string;
  }) {
    const existing = await prisma.coursePurchase.findFirst({
      where: { memberId: opts.memberProfileId, classId: opts.course.id, status: "ACTIVE" },
    });
    if (existing) {
      console.log(`  - ${opts.course.name}: member đã có lượt mua ACTIVE, bỏ qua`);
      return existing;
    }

    const { price, commissionAmount, coachEarning } = splitCoursePrice(Number(opts.course.price));
    const startDate = new Date();
    const endDate = opts.course.durationDays
      ? new Date(startDate.getTime() + opts.course.durationDays * 86_400_000)
      : null;

    return prisma.$transaction(async (tx) => {
      const purchase = await tx.coursePurchase.create({
        data: {
          memberId: opts.memberProfileId,
          classId: opts.course.id,
          coachId: opts.course.ownerCoachId,
          price,
          commissionRate: COURSE_COMMISSION_RATE,
          commissionAmount,
          coachEarning,
          startDate,
          endDate,
          status: "ACTIVE",
        },
      });

      const payment = await tx.payment.create({
        data: {
          memberId: opts.memberProfileId,
          coursePurchaseId: purchase.id,
          amount: price,
          method: opts.method,
          status: PaymentStatus.SUCCESS,
          paidAt: new Date(),
          createdById: manager.id,
          note: opts.note,
        },
      });

      await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}-${opts.invoiceSuffix}`,
          memberId: opts.memberProfileId,
          paymentId: payment.id,
          subtotal: price,
          discount: 0,
          total: price,
          status: "ISSUED",
          issuedAt: new Date(),
          memberName: opts.memberName,
          courseName: opts.course.name,
        },
      });

      console.log(
        `  - ${opts.course.name}: giá ${price.toLocaleString("vi-VN")}đ → nền tảng ${commissionAmount.toLocaleString("vi-VN")}đ / Coach ${coachEarning.toLocaleString("vi-VN")}đ`
      );
      return purchase;
    });
  }

  if (member1Profile) {
    await seedCoursePurchase({
      memberProfileId: member1Profile.id,
      memberName: member1.fullName,
      course: yogaClass,
      method: PaymentMethod.CASH,
      note: "Thanh toán tại quầy",
      invoiceSuffix: "001",
    });
  }

  if (member2Profile) {
    await seedCoursePurchase({
      memberProfileId: member2Profile.id,
      memberName: member2.fullName,
      course: premiumYoga,
      method: PaymentMethod.BANK_TRANSFER,
      note: "Chuyển khoản online",
      invoiceSuffix: "002",
    });
  }

  if (member3Profile) {
    await seedCoursePurchase({
      memberProfileId: member3Profile.id,
      memberName: member3.fullName,
      course: hiitClass,
      method: PaymentMethod.CASH,
      note: "Thanh toán tại quầy",
      invoiceSuffix: "003",
    });
  }

  console.log("\nSeeding completed!");
  console.log("\nTest Accounts (4 roles: Manager / Coach / Member — Guest không cần tài khoản):");
  console.log("  Manager:  manager@sportscenter.com / Manager@123");
  console.log("  Coach 1:  coach1@sportscenter.com  / Coach@123   [sở hữu: Yoga Buổi Sáng, Premium Yoga & Meditation]");
  console.log("  Coach 2:  coach2@sportscenter.com  / Coach@123   [sở hữu: HIIT Cardio]");
  console.log("  Member 1: member1@example.com      / Member@123  [đã mua: Yoga Buổi Sáng]");
  console.log("  Member 2: member2@example.com      / Member@123  [đã mua: Premium Yoga & Meditation]");
  console.log("  Member 3: member3@example.com      / Member@123  [đã mua: HIIT Cardio]");
  console.log("\nHoa hồng nền tảng: Member trả ĐÚNG giá khóa học; nền tảng giữ 15%; Coach nhận 85%.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
