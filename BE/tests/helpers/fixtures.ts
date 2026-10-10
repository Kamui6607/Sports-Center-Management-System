/**
 * Fixture dùng chung cho E2E (tạo trực tiếp qua Prisma, tiền tố RUN) + dọn dẹp.
 * Hành vi nghiệp vụ luôn kiểm tra qua HTTP API thật — fixture chỉ dựng dữ liệu nền.
 */
import { prisma } from "../../src/config/prisma.js";
import { hashPassword } from "../../src/utils/bcrypt.js";
import { connectRole, type RoleName } from "../../src/utils/roles.js";
import { http, PASSWORD, RUN } from "./e2e.js";

let passwordHash: string | null = null;
let seq = 0;

export type TestUser = {
  id: string;
  email: string;
  role: RoleName;
  memberProfileId?: string;
  coachProfileId?: string;
  token?: string;
  refreshToken?: string;
};

/** Tạo user (kèm profile theo vai trò). Coach mặc định đã duyệt CV + `isActive=true`. */
export async function createUser(
  role: RoleName,
  opts: { active?: boolean; cert?: "PENDING" | "APPROVED" | "REJECTED" | null; name?: string } = {}
): Promise<TestUser> {
  passwordHash ??= await hashPassword(PASSWORD);
  seq++;
  const email = `${RUN}-${role.toLowerCase()}${seq}@example.test`;
  const cert = role === "COACH" ? (opts.cert === undefined ? "APPROVED" : opts.cert) : null;
  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      fullName: opts.name ?? `E2E ${role} ${seq}`,
      role: connectRole(role),
      isActive: opts.active ?? true,
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : {}),
      ...(role === "COACH"
        ? {
            coachProfile: {
              create: {
                specialization: "Yoga",
                ...(cert ? { certification: { create: { status: cert, fileUrl: "uploads/cvs/e2e.pdf" } } } : {}),
              },
            },
          }
        : {}),
      ...(role === "MANAGER" ? { managerProfile: { create: {} } } : {}),
    },
    include: { memberProfile: true, coachProfile: true },
  });
  return {
    id: user.id,
    email,
    role,
    memberProfileId: user.memberProfile?.id,
    coachProfileId: user.coachProfile?.id,
  };
}

/** Đăng nhập qua API, gắn token vào user. */
export async function login(user: TestUser): Promise<TestUser> {
  const res = await http("POST", "/auth/login", { body: { email: user.email, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`login ${user.email} => ${res.status} ${JSON.stringify(res.body)}`);
  user.token = res.body.data.accessToken;
  user.refreshToken = res.body.data.refreshToken;
  return user;
}

export async function createRoom(areaType: "INDOOR" | "POOL" | "OUTDOOR" = "INDOOR", capacity = 30) {
  seq++;
  return prisma.room.create({ data: { name: `${RUN}-room${seq}`, capacity, areaType } });
}

/** Khóa học + buổi học (offset tính theo giờ so với hiện tại). */
export async function createClass(
  coach: TestUser,
  opts: {
    status?: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
    price?: number;
    capacity?: number;
    fitness?: string;
    roomId?: string;
    sessions?: { startInHours: number; hours?: number; status?: "SCHEDULED" | "COMPLETED" | "CANCELLED" }[];
  } = {}
) {
  seq++;
  const room = opts.roomId ? { id: opts.roomId } : await createRoom();
  const cls = await prisma.class.create({
    data: {
      name: `${RUN}-class${seq}`,
      fitness: opts.fitness ?? `${RUN}-Yoga`,
      price: opts.price ?? 1_000_000,
      status: opts.status ?? "APPROVED",
      coachId: coach.coachProfileId!,
      capacity: opts.capacity ?? 10,
      areaType: "INDOOR",
    },
  });
  const now = Date.now();
  const schedules = [];
  for (const s of opts.sessions ?? []) {
    const start = new Date(now + s.startInHours * 3_600_000);
    schedules.push(
      await prisma.classSchedule.create({
        data: {
          classId: cls.id,
          roomId: room.id,
          startTime: start,
          endTime: new Date(start.getTime() + (s.hours ?? 1) * 3_600_000),
          status: s.status ?? "SCHEDULED",
        },
      })
    );
  }
  await prisma.coachWallet.upsert({
    where: { coachId: coach.coachProfileId! },
    create: { coachId: coach.coachProfileId!, balance: 0 },
    update: {},
  });
  return { cls, schedules, roomId: room.id };
}

/** Mô phỏng Member đã mua khóa: Payment SUCCESS + DEPOSIT 85% vào ví HLV + giữ chỗ các buổi. */
export async function purchase(member: TestUser, cls: { id: string; price: unknown; coachId: string }, scheduleIds: string[]) {
  const amount = Number(cls.price);
  const payment = await prisma.payment.create({
    data: {
      memberId: member.memberProfileId!,
      classId: cls.id,
      amount,
      method: "SEPAY",
      status: "SUCCESS",
      paidAt: new Date(),
      classNameSnapshot: "E2E",
      transactionCode: `${RUN}-${++seq}`.toUpperCase(),
    },
  });
  const wallet = await prisma.coachWallet.findUniqueOrThrow({ where: { coachId: cls.coachId } });
  const share = Math.round(amount * 0.85);
  await prisma.coachWallet.update({ where: { id: wallet.id }, data: { balance: { increment: share } } });
  await prisma.walletTransaction.create({
    data: { walletId: wallet.id, amount: share, type: "DEPOSIT", status: "COMPLETED", classId: cls.id, paymentId: payment.id },
  });
  for (const id of scheduleIds) {
    await prisma.enrollment.create({ data: { memberId: member.memberProfileId!, scheduleId: id, status: "BOOKED" } });
  }
  return payment;
}

/** Dọn mọi dữ liệu có tiền tố RUN (thứ tự theo khóa ngoại). */
export async function cleanupRun(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const classes = await prisma.class.findMany({
    where: { OR: [{ name: { startsWith: RUN } }, { coach: { userId: { in: userIds } } }] },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  const members = await prisma.memberProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const memberIds = members.map((m) => m.id);
  const scheduleWhere = { classId: { in: classIds } };

  await prisma.refund.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { memberId: { in: memberIds } }, { order: { userId: { in: userIds } } }] } });
  await prisma.walletTransaction.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { wallet: { coach: { userId: { in: userIds } } } }] } });
  const paymentOwner = { OR: [{ classId: { in: classIds } }, { memberId: { in: memberIds } }, { order: { userId: { in: userIds } } }] };
  await prisma.sepayWebhookEvent.deleteMany({ where: { payment: paymentOwner } });
  await prisma.sepayBankTransaction.deleteMany({ where: { payment: paymentOwner } });
  await prisma.payment.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { memberId: { in: memberIds } }, { order: { userId: { in: userIds } } }] } });
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.productReview.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.orderItem.deleteMany({ where: { product: { name: { startsWith: RUN } } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.attendancePenalty.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { memberId: { in: memberIds } }] } });
  await prisma.attendance.deleteMany({ where: { OR: [{ schedule: scheduleWhere }, { memberId: { in: memberIds } }] } });
  await prisma.attendanceManualCodeAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.attendanceManualCode.deleteMany({ where: { schedule: scheduleWhere } });
  await prisma.enrollment.deleteMany({ where: { OR: [{ schedule: scheduleWhere }, { memberId: { in: memberIds } }] } });
  await prisma.classSchedule.updateMany({ where: scheduleWhere, data: { makeupForId: null } });
  await prisma.classSchedule.deleteMany({ where: scheduleWhere });
  await prisma.coachFeedback.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { memberId: { in: memberIds } }] } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.trainingPlan.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { coach: { userId: { in: userIds } } }] } });
  await prisma.chatAttachment.deleteMany({ where: { OR: [{ ownerId: { in: userIds } }, { receiverId: { in: userIds } }] } });
  await prisma.chatMessage.deleteMany({ where: { OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationOutbox.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.room.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
