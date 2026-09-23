import { prisma } from "../../config/prisma.js";
import { Prisma, EnrollmentStatus } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification } from "../notifications/notifications.service.js";
import { ATTENDANCE } from "../../config/attendance.js";
import { scanAttendanceWarnings } from "../attendance/attendance.service.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

// Advisory lock theo resource để serialize Room/Coach trong cùng transaction.
// Tự release khi transaction commit/rollback (pg_advisory_xact_lock).
// Dùng $executeRaw thay vì $queryRaw vì function trả về void, không có row để deserialize.
async function lockScheduleResources(db: DbClient, roomIds: string[], coachIds: string[]) {
  for (const roomId of sortedUnique(roomIds)) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule:room:' || ${roomId}::text))`;
  }
  for (const coachId of sortedUnique(coachIds)) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule:coach:' || ${coachId}::text))`;
  }
}

async function getCoachIdsOfClass(db: DbClient, classId: string): Promise<string[]> {
  const rows = await db.classMember.findMany({ where: { classId }, select: { coachId: true } });
  return rows.map((r) => r.coachId);
}

async function checkConflicts(
  db: DbClient,
  roomId: string,
  classId: string,
  startTime: Date,
  endTime: Date,
  excludeScheduleId?: string
) {
  // Room conflict
  const roomConflict = await db.classSchedule.findFirst({
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
  const classCoaches = await db.classMember.findMany({ where: { classId } });
  for (const cm of classCoaches) {
    const coachConflict = await db.classSchedule.findFirst({
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

export async function checkScheduleConflicts(
  db: DbClient,
  roomId: string,
  classId: string,
  startTime: Date,
  endTime: Date,
  excludeScheduleId?: string
) {
  return checkConflicts(db, roomId, classId, startTime, endTime, excludeScheduleId);
}

export async function listSchedules(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.classId) where.classId = query.classId;
  if (query.roomId) where.roomId = query.roomId;
  if (query.status) where.status = query.status;
  // Legacy start-time filtering (giữ backward compatibility cho FE hiện tại).
  if (query.startAfter) where.startTime = { ...where.startTime, gte: new Date(query.startAfter) };
  if (query.startBefore) where.startTime = { ...where.startTime, lte: new Date(query.startBefore) };
  if (query.date) {
    const d = new Date(query.date);
    const nextDay = new Date(d);
    nextDay.setDate(d.getDate() + 1);
    where.startTime = { gte: d, lt: nextDay };
  }
  // Overlap-range filtering: schedule.startTime < to AND schedule.endTime > from.
  // Chạm biên (end == from, start == to) không tính overlap, thống nhất checkConflicts/transfer.
  if (query.from || query.to) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (query.from && Number.isNaN(from!.getTime())) throw new AppError("Invalid from datetime", 400);
    if (query.to && Number.isNaN(to!.getTime())) throw new AppError("Invalid to datetime", 400);
    delete where.startTime;
    if (from && to) {
      where.startTime = { lt: to };
      where.endTime = { gt: from };
    } else if (from) {
      where.endTime = { gt: from };
    } else if (to) {
      where.startTime = { lt: to };
    }
  }

  // Lọc Thứ 2..CN theo giờ VN (Asia/Ho_Chi_Minh), tính trên startTime.
  // Schema đã chuẩn hoá query.weekday/weekdays về mảng ISO 1..7 (Mon..Sun)
  // trong query.weekdayIso; tách riêng để chặn số lạ nếu validate bị bypass.
  const rawWeekdayIso: unknown = (query as { weekdayIso?: unknown }).weekdayIso;
  const weekdayIso: number[] | undefined = Array.isArray(rawWeekdayIso)
    ? [...new Set(rawWeekdayIso as unknown[])]
        .filter((v): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7)
        .sort((a, b) => a - b)
    : undefined;

  const include = {
    class: { include: { sports: true } },
    room: true,
    _count: {
      select: {
        enrollments: {
          where: { status: { in: [EnrollmentStatus.BOOKED, EnrollmentStatus.COMPLETED] } },
        },
      },
    },
  };

  if (!weekdayIso || weekdayIso.length === 0) {
    const [total, schedules] = await Promise.all([
      prisma.classSchedule.count({ where }),
      prisma.classSchedule.findMany({
        where, skip, take: limit,
        include,
        orderBy: { startTime: "asc" },
      }),
    ]);
    return { schedules, pagination: buildPaginationMeta(total, page, limit) };
  }

  // Weekday chỉ lọc được đúng theo múi giờ VN bằng SQL:
  // EXTRACT(ISODOW FROM startTime AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (...).
  const whereSql = buildWhereSql(where);
  const countRows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total FROM "ClassSchedule" AS s
    ${whereSql.fragment}
    AND EXTRACT(ISODOW FROM s."startTime" AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (${Prisma.join(weekdayIso)})`;
  const total = Number(countRows[0]?.total ?? 0);
  const schedules = await prisma.$queryRaw<any[]>`
    SELECT s.* FROM "ClassSchedule" AS s
    ${whereSql.fragment}
    AND EXTRACT(ISODOW FROM s."startTime" AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (${Prisma.join(weekdayIso)})
    ORDER BY s."startTime" ASC
    LIMIT ${limit} OFFSET ${skip}`;
  if (schedules.length === 0) {
    return { schedules: [], pagination: buildPaginationMeta(total, page, limit) };
  }
  const ids = schedules.map((s) => s.id);
  const rows = await prisma.classSchedule.findMany({
    where: { id: { in: ids } },
    include,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Giữ đúng thứ tự ORDER BY startTime từ query raw.
  const ordered = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);
  return { schedules: ordered, pagination: buildPaginationMeta(total, page, limit) };
}

// Dựng WHERE SQL từ object `where` của Prisma cho GET list (khi cần lọc weekday).
// Chỉ hỗ trợ đúng các key mà listSchedules đang dùng: classId/roomId/status + startTime/endTime.
function buildWhereSql(where: any): { fragment: Prisma.Sql } {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (where.classId) conds.push(Prisma.sql`s."classId" = ${where.classId}`);
  if (where.roomId) conds.push(Prisma.sql`s."roomId" = ${where.roomId}`);
  if (where.status) conds.push(Prisma.sql`s."status"::text = ${where.status}`);
  const st = where.startTime;
  if (st?.gte) conds.push(Prisma.sql`s."startTime" >= ${st.gte}`);
  if (st?.gt) conds.push(Prisma.sql`s."startTime" > ${st.gt}`);
  if (st?.lte) conds.push(Prisma.sql`s."startTime" <= ${st.lte}`);
  if (st?.lt) conds.push(Prisma.sql`s."startTime" < ${st.lt}`);
  const et = where.endTime;
  if (et?.gte) conds.push(Prisma.sql`s."endTime" >= ${et.gte}`);
  if (et?.gt) conds.push(Prisma.sql`s."endTime" > ${et.gt}`);
  if (et?.lte) conds.push(Prisma.sql`s."endTime" <= ${et.lte}`);
  if (et?.lt) conds.push(Prisma.sql`s."endTime" < ${et.lt}`);
  return { fragment: Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` };
}

function assertClassRoomAreaMatch(classAreaType: string, roomAreaType: string) {
  if (classAreaType !== roomAreaType) {
    throw new AppError(
      `Class area type "${classAreaType}" does not match Room area type "${roomAreaType}"`,
      400
    );
  }
}

export async function createSchedule(data: any) {
  return prisma.$transaction(async (tx) => {
    const cls = await tx.class.findUnique({ where: { id: data.classId } });
    if (!cls || !cls.isActive) throw new AppError("Class not found or inactive", 404);

    const room = await tx.room.findUnique({ where: { id: data.roomId } });
    if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new AppError("Invalid startTime or endTime", 400);
    }
    if (endTime <= startTime) {
      throw new AppError("endTime must be strictly greater than startTime", 400);
    }

    // Lock Room + toàn bộ Coach của Class theo thứ tự cố định trước khi check.
    const coachIds = await getCoachIdsOfClass(tx, data.classId);
    await lockScheduleResources(tx, [data.roomId], coachIds);

    // Business rule: Class.areaType phải khớp Room.areaType trước mọi check khác.
    assertClassRoomAreaMatch(cls.areaType, room.areaType);

    if (room.capacity < cls.capacity) {
      throw new AppError("Room capacity is too small for this class", 400);
    }

    await checkConflicts(tx, data.roomId, data.classId, startTime, endTime);

    return tx.classSchedule.create({
      data: { classId: data.classId, roomId: data.roomId, startTime, endTime, status: "SCHEDULED" },
      include: { class: { include: { sports: true } }, room: true },
    });
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

// Unified cancellation: SCHEDULED → CANCELLED + BOOKED enrollments → CANCELLED.
// Idempotent: CANCELLED gọi lại không update, không notify. COMPLETED → 400.
async function cancelScheduleTx(
  tx: Prisma.TransactionClient,
  schedule: { id: string; classId: string; class: { name: string } },
  reason?: string
) {
  await tx.enrollment.updateMany({
    where: { scheduleId: schedule.id, status: "BOOKED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  const updated = await tx.classSchedule.update({
    where: { id: schedule.id },
    data: { status: "CANCELLED" },
    include: { class: { include: { sports: true } }, room: true },
  });
  return { updated, reason: reason ?? "Lịch học bị hủy" };
}

export async function updateSchedule(id: string, data: any) {
  const existing = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true, room: true },
  });
  if (!existing) throw new AppError("Schedule not found", 404);

  // P0-2: CLOSED immutable qua PATCH thông thường.
  if (existing.status === "COMPLETED") throw new AppError("Schedule is already completed", 400);
  if (existing.status === "CANCELLED") throw new AppError("Schedule is already cancelled", 400);

  // P0-1: PATCH không được set COMPLETED trực tiếp.
  if (data.status === "COMPLETED") {
    throw new AppError("Use /class-schedules/:id/complete to complete a schedule", 400);
  }

  const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
  const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
  const roomId = data.roomId ?? existing.roomId;

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new AppError("Invalid startTime or endTime", 400);
  }
  if (endTime <= startTime) {
    throw new AppError("endTime must be strictly greater than startTime", 400);
  }

  const timeOrRoomChanged = Boolean(data.startTime || data.endTime || data.roomId);

  // Cancel qua PATCH: reuse unified cancel flow, không cho đổi room/time cùng lúc.
  if (data.status === "CANCELLED") {
    if (timeOrRoomChanged) {
      throw new AppError("Cannot change room/time when cancelling a schedule", 400);
    }
    const result = await prisma.$transaction(async (tx) => {
      return cancelScheduleTx(tx, existing as any, data.reason);
    });
    const enrolled = await prisma.enrollment.findMany({
      where: { scheduleId: id, status: "CANCELLED" },
      include: { member: { select: { userId: true } } },
    });
    const userIds = [...new Set(enrolled.map((e) => e.member.userId))];
    if (userIds.length > 0) {
      const startStr = result.updated.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      broadcastNotification(
        userIds,
        "SCHEDULE_CANCELLED",
        `Lịch học đã bị hủy: ${result.updated.class.name}`,
        `Lịch học "${result.updated.class.name}" vào lúc ${startStr} đã bị hủy. Vui lòng đặt lịch học khác.`,
        { reason: result.reason, metadata: { scheduleId: id, classId: result.updated.classId } }
      ).catch(() => {});
    }
    return result.updated;
  }

  // Đổi room/time: lock old room + new room + coaches rồi re-check trong tx.
  if (timeOrRoomChanged) {
    const updated = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);
      if (room.capacity < existing.class.capacity) {
        throw new AppError("Room capacity is too small for this class", 400);
      }
      assertClassRoomAreaMatch(existing.class.areaType, room.areaType);

      const coachIds = await getCoachIdsOfClass(tx, existing.classId);
      await lockScheduleResources(tx, [existing.roomId, roomId], coachIds);
      await checkConflicts(tx, roomId, existing.classId, startTime, endTime, id);

      return tx.classSchedule.update({
        where: { id },
        data: { startTime, endTime, roomId },
        include: { class: { include: { sports: true } }, room: true },
      });
    });

    // Thông báo cho hội viên đã đặt chỗ khi lịch bị dời giờ/phòng.
    // (Enum đã có SCHEDULE_UPDATED nhưng trước đây chưa nơi nào phát.)
    const enrollments = await prisma.enrollment.findMany({
      where: { scheduleId: id, status: "BOOKED" },
      include: { member: { select: { userId: true } } },
    });
    const userIds = [...new Set(enrollments.map((e) => e.member.userId))];
    if (userIds.length > 0) {
      const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      const changes: string[] = [];
      if (
        updated.startTime.getTime() !== existing.startTime.getTime() ||
        updated.endTime.getTime() !== existing.endTime.getTime()
      ) {
        changes.push(
          `Thời gian mới: ${fmt(updated.startTime)} – ${fmt(updated.endTime)} (trước đó: ${fmt(existing.startTime)} – ${fmt(existing.endTime)}).`
        );
      }
      if (updated.roomId !== existing.roomId) {
        changes.push(`Phòng mới: ${updated.room.name} (trước đó: ${existing.room.name}).`);
      }
      if (changes.length > 0) {
        broadcastNotification(
          userIds,
          "SCHEDULE_UPDATED",
          `Lịch học đã thay đổi: ${updated.class.name}`,
          `Lịch học "${updated.class.name}" mà bạn đã đặt có thay đổi. ${changes.join(" ")} Vui lòng kiểm tra lại lịch của bạn.`,
          { metadata: { scheduleId: id, classId: updated.classId } }
        ).catch(() => {});
      }
    }

    return updated;
  }

  // Không có gì để đổi (ví dụ status=SCHEDULED trong khi đã SCHEDULED): trả hiện tại.
  return prisma.classSchedule.findUnique({
    where: { id },
    include: { class: { include: { sports: true } }, room: true },
  });
}

export async function deleteSchedule(id: string) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  if (schedule.status === "COMPLETED") throw new AppError("Schedule is already completed", 400);
  if (schedule.status === "CANCELLED") {
    // Idempotent: không update, không notify lại.
    return { id, status: "CANCELLED" as const };
  }

  const enrolled = await prisma.enrollment.findMany({
    where: { scheduleId: id, status: "BOOKED" },
    include: { member: { select: { userId: true } } },
  });
  const enrolledUserIds = [...new Set(enrolled.map((e) => e.member.userId))];
  const startStr = schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const result = await prisma.$transaction(async (tx) => {
    return cancelScheduleTx(tx, schedule as any, "Lịch học bị hủy");
  });

  // Notify sau commit — fire-and-forget
  if (enrolledUserIds.length > 0) {
    broadcastNotification(
      enrolledUserIds,
      "SCHEDULE_CANCELLED",
      `Lịch học đã bị hủy: ${schedule.class.name}`,
      `Lịch học "${schedule.class.name}" vào lúc ${startStr} đã bị hủy. Vui lòng đặt lịch học khác.`,
      { reason: result.reason, metadata: { scheduleId: id, classId: schedule.classId } }
    ).catch(() => {});
  }

  return { id, status: "CANCELLED" as const };
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

  const completed = await prisma.$transaction(async (tx) => {
    // §4: No-show — tạo ABSENT hệ thống cho member BOOKED chưa được điểm danh.
    // Unique (scheduleId, memberId) + skipDuplicates chống tạo trùng.
    const booked = await tx.enrollment.findMany({
      where: { scheduleId: id, status: "BOOKED" },
      select: { memberId: true },
    });
    if (booked.length > 0) {
      const marked = await tx.attendance.findMany({
        where: { scheduleId: id },
        select: { memberId: true },
      });
      const markedSet = new Set(marked.map((m) => m.memberId));
      const missing = booked.filter((b) => !markedSet.has(b.memberId));
      if (missing.length > 0) {
        await tx.attendance.createMany({
          data: missing.map((m) => ({
            scheduleId: id,
            memberId: m.memberId,
            status: "ABSENT" as const,
            note: ATTENDANCE.SYSTEM_NO_SHOW_NOTE,
          })),
          skipDuplicates: true,
        });
      }
    }

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

  // §7: quét lại chuyên cần của lớp và gửi warning cho các bucket WARN (dedupe theo rate).
  // Fire-and-forget để không chặn response; không ảnh hưởng kết quả complete.
  scanAttendanceWarnings(schedule.classId).catch(() => {});

  return completed;
}
