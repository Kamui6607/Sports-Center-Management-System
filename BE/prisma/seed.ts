import "dotenv/config";
import { PrismaClient, UserRole, MemberTier, ClassType, PaymentMethod, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const SALT = 12;

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
      role: UserRole.MANAGER,
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
      role: UserRole.STAFF,
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

  // ─── MEMBERSHIP PLANS ────────────────────────────────
  const planBasic = await prisma.membershipPlan.upsert({
    where: { id: "plan-basic-001" },
    update: {},
    create: {
      id: "plan-basic-001",
      name: "Membership Monthly",
      description: "Gói thành viên cơ bản 1 tháng. Được đăng ký các lớp thông thường.",
      price: 300000,
      durationDays: 30,
      tier: MemberTier.MEMBERSHIP,
      isActive: true,
    },
  });

  const planQuarterly = await prisma.membershipPlan.upsert({
    where: { id: "plan-quarterly-001" },
    update: {},
    create: {
      id: "plan-quarterly-001",
      name: "Membership Quarterly",
      description: "Gói thành viên cơ bản 3 tháng. Tiết kiệm hơn so với gói tháng.",
      price: 800000,
      durationDays: 90,
      tier: MemberTier.MEMBERSHIP,
      isActive: true,
    },
  });

  const planPremium = await prisma.membershipPlan.upsert({
    where: { id: "plan-premium-001" },
    update: {},
    create: {
      id: "plan-premium-001",
      name: "Premium Monthly",
      description: "Gói Premium 1 tháng. Đăng ký lớp Premium, AI workout recommendation, ưu tiên booking.",
      price: 600000,
      durationDays: 30,
      tier: MemberTier.PREMIUM,
      isActive: true,
    },
  });
  console.log("Membership Plans created");

  // ─── SPORTS ──────────────────────────────────────────
  const yoga = await prisma.sport.upsert({
    where: { name: "Yoga" },
    update: {},
    create: {
      name: "Yoga",
      description: "Lớp Yoga cải thiện sự linh hoạt, cân bằng và tâm trí.",
      isActive: true,
    },
  });

  const hiit = await prisma.sport.upsert({
    where: { name: "HIIT" },
    update: {},
    create: {
      name: "HIIT",
      description: "High Intensity Interval Training – đốt cháy calo hiệu quả.",
      isActive: true,
    },
  });

  const swimming = await prisma.sport.upsert({
    where: { name: "Swimming" },
    update: {},
    create: {
      name: "Swimming",
      description: "Lớp bơi lội cho mọi trình độ.",
      isActive: true,
    },
  });
  console.log("Sports created");

  // ─── ROOMS ───────────────────────────────────────────
  const room1 = await prisma.room.upsert({
    where: { name: "Phòng Yoga A" },
    update: {},
    create: {
      name: "Phòng Yoga A",
      capacity: 20,
      location: "Tầng 1",
      isActive: true,
    },
  });

  const room2 = await prisma.room.upsert({
    where: { name: "Phòng HIIT B" },
    update: {},
    create: {
      name: "Phòng HIIT B",
      capacity: 15,
      location: "Tầng 2",
      isActive: true,
    },
  });

  const room3 = await prisma.room.upsert({
    where: { name: "Hồ Bơi" },
    update: {},
    create: {
      name: "Hồ Bơi",
      capacity: 25,
      location: "Tầng Trệt",
      isActive: true,
    },
  });
  console.log("Rooms created");

  // ─── CLASSES ─────────────────────────────────────────
  const coachProfile1 = await prisma.coachProfile.findUnique({ where: { userId: coach1.id } });
  const coachProfile2 = await prisma.coachProfile.findUnique({ where: { userId: coach2.id } });

  const yogaClass = await prisma.class.upsert({
    where: { id: "class-yoga-001" },
    update: {},
    create: {
      id: "class-yoga-001",
      name: "Yoga Buổi Sáng",
      description: "Lớp Yoga nhẹ nhàng buổi sáng, phù hợp mọi trình độ.",
      sportId: yoga.id,
      capacity: 15,
      classType: ClassType.REGULAR,
      isActive: true,
    },
  });

  const hiitClass = await prisma.class.upsert({
    where: { id: "class-hiit-001" },
    update: {},
    create: {
      id: "class-hiit-001",
      name: "HIIT Cardio",
      description: "Lớp HIIT cường độ cao, đốt cháy calo tối đa.",
      sportId: hiit.id,
      capacity: 12,
      classType: ClassType.REGULAR,
      isActive: true,
    },
  });

  const premiumYoga = await prisma.class.upsert({
    where: { id: "class-yoga-premium-001" },
    update: {},
    create: {
      id: "class-yoga-premium-001",
      name: "Premium Yoga & Meditation",
      description: "Lớp Yoga Premium với coach 1-1 và thiền định chuyên sâu.",
      sportId: yoga.id,
      capacity: 8,
      classType: ClassType.PREMIUM,
      isActive: true,
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

  // ─── SUBSCRIPTIONS (for member1 and member2) ─────────
  const member1Profile = member1.memberProfile;
  const member2Profile = member2.memberProfile;

  if (member1Profile) {
    const subStartDate = new Date();
    const subEndDate = new Date();
    subEndDate.setDate(subEndDate.getDate() + planBasic.durationDays);

    const sub1 = await prisma.membershipSubscription.create({
      data: {
        memberId: member1Profile.id,
        planId: planBasic.id,
        tier: MemberTier.MEMBERSHIP,
        startDate: subStartDate,
        endDate: subEndDate,
        status: "ACTIVE",
      },
    });

    // Payment + Invoice for subscription
    const payment1 = await prisma.payment.create({
      data: {
        memberId: member1Profile.id,
        subscriptionId: sub1.id,
        amount: planBasic.price,
        method: PaymentMethod.CASH,
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
        createdById: staff.id,
        note: "Thanh toán tại quầy",
      },
    });

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}-001`,
        memberId: member1Profile.id,
        paymentId: payment1.id,
        subtotal: planBasic.price,
        discount: 0,
        total: planBasic.price,
        status: "ISSUED",
        issuedAt: new Date(),
      },
    });

    console.log("Subscription for member1 created");
  }

  if (member2Profile) {
    const subStartDate = new Date();
    const subEndDate = new Date();
    subEndDate.setDate(subEndDate.getDate() + planPremium.durationDays);

    const sub2 = await prisma.membershipSubscription.create({
      data: {
        memberId: member2Profile.id,
        planId: planPremium.id,
        tier: MemberTier.PREMIUM,
        startDate: subStartDate,
        endDate: subEndDate,
        status: "ACTIVE",
      },
    });

    const payment2 = await prisma.payment.create({
      data: {
        memberId: member2Profile.id,
        subscriptionId: sub2.id,
        amount: planPremium.price,
        method: PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
        createdById: staff.id,
        note: "Chuyển khoản online",
      },
    });

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}-002`,
        memberId: member2Profile.id,
        paymentId: payment2.id,
        subtotal: planPremium.price,
        discount: 0,
        total: planPremium.price,
        status: "ISSUED",
        issuedAt: new Date(),
      },
    });

    console.log("Subscription for member2 created");
  }

  console.log("\nSeeding completed!");
  console.log("\nTest Accounts:");
  console.log("  Manager:  manager@sportscenter.com / Manager@123");
  console.log("  Staff:    staff@sportscenter.com   / Staff@123");
  console.log("  Coach 1:  coach1@sportscenter.com  / Coach@123");
  console.log("  Coach 2:  coach2@sportscenter.com  / Coach@123");
  console.log("  Member 1: member1@example.com      / Member@123  [MEMBERSHIP tier]");
  console.log("  Member 2: member2@example.com      / Member@123  [PREMIUM tier]");
  console.log("  Member 3: member3@example.com      / Member@123  [FREE tier]");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
