import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";

async function getEffectiveTier(memberId: string) {
  const activeSub = await prisma.membershipSubscription.findFirst({
    where: {
      memberId,
      status: "ACTIVE",
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
    orderBy: [{ tier: "desc" }, { endDate: "desc" }],
  });
  return activeSub ? activeSub.tier : "FREE";
}

export async function bookClass(
  scheduleId: string,
  memberProfileId: string,
  bookedByRole: string
) {
  // 0. Verify member profile and role
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { id: memberProfileId },
    include: { user: true },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot book class: user is not an active MEMBER", 400);
  }

  // 1. Find schedule

  const schedule = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    include: { class: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  if (schedule.status !== "SCHEDULED")
    throw new AppError("This schedule is not available for booking", 400);
  if (schedule.startTime <= new Date())
    throw new AppError("Cannot book a past class", 400);

  // 2. Tier check + Chốt chặn 1: Subscription phải còn hạn đến ngày lớp học diễn ra
  const activeSub = await prisma.membershipSubscription.findFirst({
    where: {
      memberId: memberProfileId,
      status: "ACTIVE",
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
    orderBy: [{ tier: "desc" }, { endDate: "desc" }],
  });

  if (!activeSub) {
    throw new AppError(
      "Bạn không có gói tập đang hoạt động. Vui lòng mua gói để đặt lịch.",
      403
    );
  }

  // Gói phải còn hạn đến lúc lớp học bắt đầu
  if (activeSub.endDate < schedule.startTime) {
    const expiredDate = activeSub.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const classDate = schedule.startTime.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    throw new AppError(
      `Gói tập của bạn sẽ hết hạn ngày ${expiredDate}, trước khi lớp học diễn ra ngày ${classDate}. Vui lòng gia hạn gói để đặt lịch.`,
      403
    );
  }

  const effectiveTier = activeSub.tier;
  if (schedule.class.classType === "PREMIUM" && effectiveTier !== "PREMIUM")
    throw new AppError(
      "Premium membership required to book this class.",
      403
    );

  return prisma.$transaction(async (tx) => {
    // 3. Capacity check
    const bookedCount = await tx.enrollment.count({
      where: {
        scheduleId,
        status: { in: ["BOOKED", "COMPLETED"] },
      },
    });
    if (bookedCount >= schedule.class.capacity)
      throw new AppError("This class is full", 409);

    // 4. Duplicate check (BR-07: handle CANCELLED re-booking)
    const existing = await tx.enrollment.findUnique({
      where: { memberId_scheduleId: { memberId: memberProfileId, scheduleId } },
    });
    if (existing && (existing.status === "BOOKED" || existing.status === "COMPLETED"))
      throw new AppError("You are already enrolled in this class", 409);

    // 5. Time conflict check
    const conflict = await tx.enrollment.findFirst({
      where: {
        memberId: memberProfileId,
        status: { in: ["BOOKED", "COMPLETED"] },
        schedule: {
          status: "SCHEDULED",
          startTime: { lt: schedule.endTime },
          endTime: { gt: schedule.startTime },
        },
      },
      include: { schedule: { include: { class: true } } },
    });
    if (conflict)
      throw new AppError(
        `You have a conflicting class "${conflict.schedule.class.name}" at this time`,
        409
      );

    // 6. Create or Reactivate enrollment
    let enrolled;
    if (existing) {
      enrolled = await tx.enrollment.update({
        where: { id: existing.id },
        data: { status: "BOOKED", bookedAt: new Date(), cancelledAt: null },
        include: {
          schedule: { include: { class: { include: { sports: true } }, room: true } },
          member: { include: { user: true } },
        },
      });
    } else {
      enrolled = await tx.enrollment.create({
        data: {
          memberId: memberProfileId,
          classId: schedule.classId,
          scheduleId,
          status: "BOOKED",
        },
        include: {
          schedule: { include: { class: { include: { sports: true } }, room: true } },
          member: { include: { user: true } },
        },
      });
    }

    // Notify member — fire-and-forget
    const startStr = schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    createNotification(
      enrolled.member.userId,
      "ENROLLMENT_CONFIRMED",
      `Đặt lớp thành công: ${schedule.class.name}`,
      `Bạn đã đặt lớp "${schedule.class.name}" thành công vào lúc ${startStr}. Chúc bạn tập luyện vui vẻ!`,
      { metadata: { scheduleId, classId: schedule.classId, enrollmentId: enrolled.id } }
    ).catch(() => {});

    // Return without user for consistent shape
    const { member: _m, ...enrolledData } = enrolled as any;
    return enrolledData;
  });
}

export async function cancelEnrollment(
  enrollmentId: string,
  userId: string,
  role: string
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { member: true, schedule: true },
  });
  if (!enrollment) throw new AppError("Enrollment not found", 404);

  // MEMBER can only cancel their own enrollment
  if (role === "MEMBER" && enrollment.member.userId !== userId) {
    throw new AppError("Forbidden: You can only cancel your own enrollments", 403);
  } else if (role === "COACH") {
    throw new AppError("Forbidden: Coaches cannot cancel member enrollments", 403);
  }

  if (enrollment.status !== "BOOKED")
    throw new AppError("Only BOOKED enrollments can be cancelled", 400);

  if (enrollment.schedule.startTime <= new Date())
    throw new AppError("Cannot cancel enrollment for a past or ongoing class", 400);

  const cancelled = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    include: { member: { include: { user: true } }, schedule: { include: { class: true } } },
  });

  // Notify member — fire-and-forget
  const startStr = cancelled.schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  createNotification(
    cancelled.member.userId,
    "ENROLLMENT_CANCELLED",
    `Đã hủy đặt lớp: ${cancelled.schedule.class.name}`,
    `Lịch học "${cancelled.schedule.class.name}" vào lúc ${startStr} đã được hủy thành công.`,
    { metadata: { enrollmentId, scheduleId: cancelled.scheduleId } }
  ).catch(() => {});

  return cancelled;
}

export async function getMyEnrollments(userId: string, query: any) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;

  const [total, enrollments] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where, skip, take: limit,
      include: {
        schedule: {
          include: { class: { include: { sports: true } }, room: true },
        },
      },
      orderBy: { bookedAt: "desc" },
    }),
  ]);
  return { enrollments, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getScheduleEnrollments(scheduleId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { scheduleId };
  if (query.status) where.status = query.status;

  const [total, enrollments] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where, skip, take: limit,
      include: {
        member: {
          include: { user: { select: { fullName: true, email: true, phone: true } } },
        },
      },
      orderBy: { bookedAt: "asc" },
    }),
  ]);
  return { enrollments, pagination: buildPaginationMeta(total, page, limit) };
}
