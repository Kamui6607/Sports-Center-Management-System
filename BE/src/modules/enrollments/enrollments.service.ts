import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

async function getEffectiveTier(memberId: string) {
  const activeSub = await prisma.membershipSubscription.findFirst({
    where: {
      memberId,
      status: "ACTIVE",
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

  // 2. Tier check
  const effectiveTier = await getEffectiveTier(memberProfileId);
  if (effectiveTier === "FREE")
    throw new AppError(
      "Active membership required to book classes. Please purchase a membership plan.",
      403
    );
  if (schedule.class.classType === "PREMIUM" && effectiveTier !== "PREMIUM")
    throw new AppError(
      "Premium membership required to book this class.",
      403
    );

  // 3. Capacity check
  const bookedCount = await prisma.enrollment.count({
    where: {
      scheduleId,
      status: { in: ["BOOKED", "COMPLETED"] },
    },
  });
  if (bookedCount >= schedule.class.capacity)
    throw new AppError("This class is full", 409);

  // 4. Duplicate check (unique constraint will also catch this, but explicit is cleaner)
  const existing = await prisma.enrollment.findUnique({
    where: { memberId_scheduleId: { memberId: memberProfileId, scheduleId } },
  });
  if (existing && existing.status === "BOOKED")
    throw new AppError("You are already enrolled in this class", 409);

  // 5. Time conflict check
  const conflict = await prisma.enrollment.findFirst({
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

  // 6. Create enrollment
  return prisma.enrollment.create({
    data: {
      memberId: memberProfileId,
      classId: schedule.classId,
      scheduleId,
      status: "BOOKED",
    },
    include: {
      schedule: { include: { class: { include: { sport: true } }, room: true } },
    },
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
  if (role === "MEMBER" && enrollment.member.userId !== userId)
    throw new AppError("Forbidden", 403);

  if (enrollment.status !== "BOOKED")
    throw new AppError("Only BOOKED enrollments can be cancelled", 400);

  if (enrollment.schedule.startTime <= new Date())
    throw new AppError("Cannot cancel enrollment for a past or ongoing class", 400);

  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
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
          include: { class: { include: { sport: true } }, room: true },
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
