import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification } from "../notifications/notifications.service.js";

async function checkConflicts(
  roomId: string,
  classId: string,
  startTime: Date,
  endTime: Date,
  excludeScheduleId?: string
) {
  // Room conflict
  const roomConflict = await prisma.classSchedule.findFirst({
    where: {
      roomId,
      status: "SCHEDULED",
      id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    include: { class: true },
  });

  if (roomConflict) {
    throw new AppError(
      `Room is already booked for "${roomConflict.class.name}" from ${roomConflict.startTime.toISOString()} to ${roomConflict.endTime.toISOString()}`,
      409
    );
  }

  // Coach conflict – get coaches of this class
  const classCoaches = await prisma.classMember.findMany({ where: { classId } });
  for (const cm of classCoaches) {
    const coachConflict = await prisma.classSchedule.findFirst({
      where: {
        status: "SCHEDULED",
        id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        class: { coaches: { some: { coachId: cm.coachId } } },
      },
      include: {
        class: {
          include: {
            coaches: {
              where: { coachId: cm.coachId },
              include: { coach: { include: { user: { select: { fullName: true } } } } },
            },
          },
        },
      },
    });

    if (coachConflict) {
      const coachName =
        coachConflict.class.coaches[0]?.coach?.user?.fullName ?? "Coach";
      throw new AppError(
        `Coach "${coachName}" already has a class at this time: ${coachConflict.startTime.toISOString()} – ${coachConflict.endTime.toISOString()}`,
        409
      );
    }
  }
}

export async function listSchedules(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.classId) where.classId = query.classId;
  if (query.roomId) where.roomId = query.roomId;
  if (query.status) where.status = query.status;
  if (query.startAfter) where.startTime = { ...where.startTime, gte: new Date(query.startAfter) };
  if (query.startBefore) where.startTime = { ...where.startTime, lte: new Date(query.startBefore) };
  if (query.date) {
    const d = new Date(query.date);
    const nextDay = new Date(d);
    nextDay.setDate(d.getDate() + 1);
    where.startTime = { gte: d, lt: nextDay };
  }

  const [total, schedules] = await Promise.all([
    prisma.classSchedule.count({ where }),
    prisma.classSchedule.findMany({
      where, skip, take: limit,
      include: {
        class: { include: { sports: true } },
        room: true,
        _count: { select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } } },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);
  return { schedules, pagination: buildPaginationMeta(total, page, limit) };
}

export async function createSchedule(data: any) {
  const cls = await prisma.class.findUnique({ where: { id: data.classId } });
  if (!cls || !cls.isActive) throw new AppError("Class not found or inactive", 404);

  const room = await prisma.room.findUnique({ where: { id: data.roomId } });
  if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);

  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);

  if (endTime <= startTime) {
    throw new AppError("endTime must be strictly greater than startTime", 400);
  }

  if (room.capacity < cls.capacity) {
    throw new AppError("Room capacity is too small for this class", 400);
  }

  await checkConflicts(data.roomId, data.classId, startTime, endTime);

  return prisma.classSchedule.create({
    data: { classId: data.classId, roomId: data.roomId, startTime, endTime, status: "SCHEDULED" },
    include: { class: { include: { sports: true } }, room: true },
  });
}

export async function getScheduleById(id: string) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: {
      class: { include: { sports: true, coaches: { include: { coach: { include: { user: { select: { fullName: true } } } } } } } },
      room: true,
      _count: { select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } } },
    },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  return schedule;
}

export async function updateSchedule(id: string, data: any) {
  const existing = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true },
  });
  if (!existing) throw new AppError("Schedule not found", 404);

  const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
  const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
  const roomId = data.roomId ?? existing.roomId;
  const status = data.status ?? existing.status;

  if (endTime <= startTime) {
    throw new AppError("endTime must be strictly greater than startTime", 400);
  }

  if (data.roomId) {
    const room = await prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);
    if (room.capacity < existing.class.capacity) {
      throw new AppError("Room capacity is too small for this class", 400);
    }
  }

  if (
    data.startTime ||
    data.endTime ||
    data.roomId ||
    (status === "SCHEDULED" && existing.status === "CANCELLED")
  ) {
    await checkConflicts(roomId, existing.classId, startTime, endTime, id);
  }

  // If cancelling, cancel all BOOKED enrollments
  if (data.status === "CANCELLED" && existing.status !== "CANCELLED") {
    // Atomically update schedule and enrollments
    return prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { scheduleId: id, status: "BOOKED" },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      return tx.classSchedule.update({
        where: { id },
        data: { ...data, startTime, endTime, roomId },
        include: { class: { include: { sports: true } }, room: true },
      });
    });
  }

  return prisma.classSchedule.update({
    where: { id },
    data: { ...data, startTime, endTime, roomId },
    include: { class: { include: { sports: true } }, room: true },
  });
}

export async function deleteSchedule(id: string) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: {
      class: true,
      enrollments: {
        where: { status: "BOOKED" },
        include: { member: { include: { user: true } } },
      },
    },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);

  // Collect user IDs of enrolled members before cancellation
  const enrolledUserIds = schedule.enrollments.map((e) => e.member.userId);
  const startStr = schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: { scheduleId: id, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await tx.classSchedule.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });

  // Notify all enrolled members — fire-and-forget
  if (enrolledUserIds.length > 0) {
    broadcastNotification(
      enrolledUserIds,
      "SCHEDULE_CANCELLED",
      `Lịch học đã bị hủy: ${schedule.class.name}`,
      `Lịch học "${schedule.class.name}" vào lúc ${startStr} đã bị hủy. Vui lòng đặt lịch học khác.`,
      { metadata: { scheduleId: id, classId: schedule.classId } }
    ).catch(() => {});
  }

  return { id, status: "CANCELLED" };
}

/**
 * BR-22: Complete a schedule after the class has finished.
 * Only allowed after endTime has passed.
 * Auto-transitions all remaining BOOKED enrollments to COMPLETED.
 */
export async function completeSchedule(id: string) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: { include: { sports: true } }, room: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  if (schedule.status === "COMPLETED") return schedule; // idempotent
  if (schedule.status === "CANCELLED") throw new AppError("Cannot complete a cancelled schedule", 400);
  if (schedule.endTime > new Date()) {
    throw new AppError("Cannot complete a schedule that has not ended yet", 400);
  }

  return prisma.$transaction(async (tx) => {
    // Mark all still-BOOKED enrollments as COMPLETED
    await tx.enrollment.updateMany({
      where: { scheduleId: id, status: "BOOKED" },
      data: { status: "COMPLETED" },
    });

    return tx.classSchedule.update({
      where: { id },
      data: { status: "COMPLETED" },
      include: { class: { include: { sports: true } }, room: true },
    });
  });
}
