import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

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
        class: { include: { sport: true } },
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

  await checkConflicts(data.roomId, data.classId, startTime, endTime);

  return prisma.classSchedule.create({
    data: { classId: data.classId, roomId: data.roomId, startTime, endTime, status: "SCHEDULED" },
    include: { class: { include: { sport: true } }, room: true },
  });
}

export async function getScheduleById(id: string) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: {
      class: { include: { sport: true, coaches: { include: { coach: { include: { user: { select: { fullName: true } } } } } } } },
      room: true,
      _count: { select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } } },
    },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  return schedule;
}

export async function updateSchedule(id: string, data: any) {
  const existing = await prisma.classSchedule.findUnique({ where: { id } });
  if (!existing) throw new AppError("Schedule not found", 404);

  const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
  const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
  const roomId = data.roomId ?? existing.roomId;

  if (data.startTime || data.endTime || data.roomId) {
    await checkConflicts(roomId, existing.classId, startTime, endTime, id);
  }

  // If cancelling, cancel all BOOKED enrollments
  if (data.status === "CANCELLED" && existing.status !== "CANCELLED") {
    await prisma.enrollment.updateMany({
      where: { scheduleId: id, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  }

  return prisma.classSchedule.update({
    where: { id },
    data: { ...data, startTime, endTime, roomId },
    include: { class: { include: { sport: true } }, room: true },
  });
}

export async function deleteSchedule(id: string) {
  const schedule = await prisma.classSchedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError("Schedule not found", 404);

  await prisma.enrollment.updateMany({
    where: { scheduleId: id, status: "BOOKED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return prisma.classSchedule.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}
