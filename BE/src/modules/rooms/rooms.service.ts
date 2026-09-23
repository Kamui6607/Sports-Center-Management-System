import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification } from "../notifications/notifications.service.js";
import type { TransferSchedulesInput } from "./rooms.schema.js";

export async function listRooms(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.areaType) where.areaType = query.areaType;
  if (query.search) where.name = { contains: query.search, mode: "insensitive" };

  const [total, rooms] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
  ]);
  return { rooms, pagination: buildPaginationMeta(total, page, limit) };
}

export async function createRoom(data: any) {
  const existing = await prisma.room.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError("Room with this name already exists", 409);
  return prisma.room.create({ data });
}

export async function getRoomById(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError("Room not found", 404);
  return room;
}

export async function updateRoom(id: string, data: any) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError("Room not found", 404);
  if (data.isActive === false && room.isActive === true) {
    const scheduled = await prisma.classSchedule.count({
      where: { roomId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
    });
    if (scheduled > 0) throw new AppError("Cannot deactivate room with upcoming schedules", 400);
  }

  // Không được làm invalid các upcoming SCHEDULED khi đổi Room.areaType.
  if (data.areaType !== undefined && data.areaType !== room.areaType) {
    const mismatched = await prisma.classSchedule.count({
      where: {
        roomId: id,
        status: "SCHEDULED",
        startTime: { gte: new Date() },
        class: { areaType: { not: data.areaType } },
      },
    });
    if (mismatched > 0) {
      throw new AppError(
        `Cannot change Room area type to "${data.areaType}" because ${mismatched} upcoming schedule(s) use a Class with a different area type`,
        400
      );
    }
  }

  return prisma.room.update({ where: { id }, data });
}

export async function deleteRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError("Room not found", 404);
  const scheduled = await prisma.classSchedule.count({
    where: { roomId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
  });
  if (scheduled > 0) throw new AppError("Cannot deactivate room with upcoming schedules", 400);
  return prisma.room.update({ where: { id }, data: { isActive: false } });
}

// ─── BULK TRANSFER SCHEDULES (Room hư → Room khác) ───────────────────────────

interface TransferTarget {
  sourceRoomId: string;
  targetRoomId: string;
  from?: string;
  to?: string;
}

// Chỉ lấy SCHEDULED tương lai. Idempotent: schedule đã ở targetRoom sẽ không còn
// thuộc sourceRoom nên lần gọi lại tự bỏ qua, không lỗi.
async function loadTransferSchedules(sourceRoomId: string, input: TransferSchedulesInput) {
  const sourceRoom = await prisma.room.findUnique({ where: { id: sourceRoomId } });
  if (!sourceRoom) throw new AppError("Room not found", 404);

  const targetRoom = await prisma.room.findUnique({ where: { id: input.targetRoomId } });
  if (!targetRoom || !targetRoom.isActive) throw new AppError("Room not found or inactive", 404);
  if (targetRoom.id === sourceRoom.id) throw new AppError("Target room must be different from source room", 400);

  const from = input.from ? new Date(input.from) : new Date();
  const to = input.to ? new Date(input.to) : undefined;
  if (input.from && Number.isNaN(from.getTime())) throw new AppError("Invalid from datetime", 400);
  if (input.to && (to === undefined || Number.isNaN(to.getTime()))) throw new AppError("Invalid to datetime", 400);

  // Time-range overlap: lấy schedule giao với [from, to).
  // schedule.startTime < to AND schedule.endTime > from.
  // Chạm biên (end == from, start == to) không tính overlap.
  const schedules = await prisma.classSchedule.findMany({
    where: {
      roomId: sourceRoomId,
      status: "SCHEDULED",
      ...(to ? { startTime: { lt: to }, endTime: { gt: from } } : { endTime: { gt: from } }),
    },
    include: { class: true },
    orderBy: { startTime: "asc" },
  });

  return { sourceRoom, targetRoom, schedules };
}

// Validate 1 schedule đúng rule PATCH /class-schedules/:id (area + capacity).
// Room/coach conflict reuse checkScheduleConflicts(tx,...) trong cùng transaction.
async function checkOneTransferSchedule(
  db: { classMember: { findMany: (args: any) => Promise<{ coachId: string }[]> }; classSchedule: { findFirst: (args: any) => Promise<any> } },
  schedule: { id: string; classId: string; startTime: Date; endTime: Date; class: { capacity: number; areaType: string } },
  targetRoom: { id: string; capacity: number; areaType: string }
) {
  if (schedule.class.areaType !== targetRoom.areaType) {
    throw new AppError(
      `Class area type "${schedule.class.areaType}" does not match Room area type "${targetRoom.areaType}"`,
      400
    );
  }
  if (targetRoom.capacity < schedule.class.capacity) {
    throw new AppError("Room capacity is too small for this class", 400);
  }
  const { checkScheduleConflicts } = await import("../class-schedules/class-schedules.service.js");
  await checkScheduleConflicts(db as any, targetRoom.id, schedule.classId, schedule.startTime, schedule.endTime, schedule.id);
}

async function lockTransferResources(
  tx: { $executeRaw: any },
  targetRoomId: string,
  coachIds: string[]
) {
  const rooms = [targetRoomId].sort();
  for (const roomId of rooms) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule:room:' || ${roomId}::text))`;
  }
  for (const coachId of [...new Set(coachIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule:coach:' || ${coachId}::text))`;
  }
}

export async function previewTransferSchedules(sourceRoomId: string, input: TransferSchedulesInput) {
  const { sourceRoom, targetRoom, schedules } = await loadTransferSchedules(sourceRoomId, input);

  const conflicts: { scheduleId: string; startTime: Date; endTime: Date; reason: string; statusCode: number }[] = [];
  for (const s of schedules) {
    try {
      await checkOneTransferSchedule(prisma as any, s as any, targetRoom as any);
    } catch (e: any) {
      conflicts.push({
        scheduleId: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        reason: e?.message ?? "Transfer not allowed",
        statusCode: e?.statusCode ?? 400,
      });
    }
  }

  return {
    canTransfer: conflicts.length === 0,
    totalSchedules: schedules.length,
    validSchedules: schedules.length - conflicts.length,
    invalidSchedules: conflicts.length,
    conflicts,
    sourceRoom: { id: sourceRoom.id, name: sourceRoom.name },
    targetRoom: { id: targetRoom.id, name: targetRoom.name },
  };
}

export async function transferSchedules(
  sourceRoomId: string,
  input: TransferSchedulesInput,
  actor: { id: string; role: string }
) {
  const { sourceRoom, targetRoom } = await loadTransferSchedules(sourceRoomId, input);
  const reason = input.reason ?? "Room damaged";

  // ALL OR NOTHING: lock target room + toàn bộ coach liên quan, re-check trong tx rồi update.
  // Overlap range giống preview: startTime < to AND endTime > from.
  const updated = await prisma.$transaction(async (tx) => {
    const from = input.from ? new Date(input.from) : new Date();
    const to = input.to ? new Date(input.to) : undefined;
    const schedules = await tx.classSchedule.findMany({
      where: {
        roomId: sourceRoomId,
        status: "SCHEDULED",
        ...(to ? { startTime: { lt: to }, endTime: { gt: from } } : { endTime: { gt: from } }),
      },
      include: { class: true },
      orderBy: { startTime: "asc" },
    });

    const classIds = [...new Set(schedules.map((s) => s.classId))];
    const members = await tx.classMember.findMany({
      where: { classId: { in: classIds } },
      select: { coachId: true },
    });
    await lockTransferResources(tx as any, targetRoom.id, members.map((m) => m.coachId));

    for (const s of schedules) {
      await checkOneTransferSchedule(tx as any, s as any, targetRoom as any);
    }

    const results: { id: string; startTime: Date; endTime: Date }[] = [];
    for (const s of schedules) {
      const row = await tx.classSchedule.update({
        where: { id: s.id },
        data: { roomId: targetRoom.id },
        select: { id: true, startTime: true, endTime: true },
      });
      results.push(row);
    }
    return { schedules, results };
  });

  // Chỉ gửi notification sau khi transaction commit. Dùng Notification.metadata làm audit:
  // action + oldRoomId/newRoomId + scheduleId + actor + timestamp + reason.
  const detailSchedules = await prisma.classSchedule.findMany({
    where: { id: { in: updated.results.map((r) => r.id) } },
    include: {
      class: { select: { id: true, name: true } },
      enrollments: {
        where: { status: "BOOKED" },
        include: { member: { select: { userId: true } } },
      },
    },
  });

  for (const s of detailSchedules) {
    const userIds = [...new Set(s.enrollments.map((e) => e.member.userId))];
    if (userIds.length === 0) continue;
    const startStr = s.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const endStr = s.endTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    await broadcastNotification(
      userIds,
      "SCHEDULE_ROOM_CHANGED",
      `Đổi phòng học: ${s.class.name}`,
      `${s.class.name} lúc ${startStr} – ${endStr} đã được chuyển từ ${sourceRoom.name} sang ${targetRoom.name}.`,
      {
        reason,
        metadata: {
          action: "SCHEDULE_ROOM_CHANGED",
          scheduleId: s.id,
          classId: s.class.id,
          oldRoomId: sourceRoom.id,
          oldRoomName: sourceRoom.name,
          newRoomId: targetRoom.id,
          newRoomName: targetRoom.name,
          actorId: actor.id,
          actorRole: actor.role,
          transferredAt: new Date().toISOString(),
        },
      }
    ).catch(() => {});
  }

  return {
    sourceRoom: { id: sourceRoom.id, name: sourceRoom.name },
    targetRoom: { id: targetRoom.id, name: targetRoom.name },
    transferredCount: updated.results.length,
    schedules: updated.results,
  };
}
