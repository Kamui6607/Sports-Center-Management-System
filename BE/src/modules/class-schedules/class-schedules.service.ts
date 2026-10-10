import { prisma } from "../../config/prisma.js";
import { Prisma, EnrollmentStatus } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification } from "../notifications/notifications.service.js";
import { ATTENDANCE } from "../../config/attendance.js";
import { scanAttendanceWarnings } from "../attendance/attendance.service.js";
import { lockSchedule } from "../../utils/dbLocks.js";
import { createSessionRefundsTx, notifyManagersNewRefunds } from "../refunds/refunds.service.js";
import {
  
} from "../attendance/attendance-analytics.service.js";

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

/** HLV phụ trách lớp (mỗi lớp đúng 1 HLV) — trả mảng để dùng chung với lockScheduleResources. */
async function getCoachIdsOfClass(db: DbClient, classId: string): Promise<string[]> {
  const cls = await db.class.findUnique({ where: { id: classId }, select: { coachId: true } });
  return cls ? [cls.coachId] : [];
}

/** Người gọi API lịch học (lấy từ JWT ở controller). */
export type ScheduleActor = { id: string; role: string };

/** Giờ Việt Nam dễ đọc cho thông báo lỗi / notification. */
function fmtVn(d: Date): string {
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

/**
 * Quyền thao tác lịch (tạo/sửa/xóa/hủy/hoàn tất buổi) của MỘT lớp: CHỈ COACH phụ trách lớp (Class.coachId).
 * Manager chỉ quản lý nền tảng, không thao tác lịch học.
 * Chặn Coach A tạo/dời/hủy/hoàn tất buổi học (và giữ phòng) dưới tên lớp của Coach B.
 */
async function assertCanManageClassSchedule(db: DbClient, actor: ScheduleActor, classId: string) {
  if (actor.role !== "COACH") throw new AppError("Forbidden", 403);
  const assigned = await db.class.findFirst({
    where: { id: classId, coach: { userId: actor.id } },
    select: { id: true },
  });
  if (!assigned) {
    throw new AppError("Bạn không phải HLV của lớp này nên không được thao tác lịch học của lớp.", 403, {
      code: "NOT_CLASS_COACH",
    });
  }
}

/** Chỉ lớp đã được duyệt mới được xếp lịch / giữ phòng (lớp PENDING, REJECTED, COMPLETED thì không). */
function assertClassApprovedForScheduling(cls: { status: string }) {
  if (cls.status !== "APPROVED") {
    throw new AppError(
      `Lớp đang ở trạng thái ${cls.status} — chỉ lớp đã được duyệt (APPROVED) mới được xếp lịch và giữ phòng.`,
      400,
      { code: "CLASS_NOT_APPROVED", classStatus: cls.status }
    );
  }
}

/** Không cho tạo / dời buổi học vào thời điểm đã qua. */
function assertStartsInFuture(startTime: Date) {
  if (startTime.getTime() <= Date.now()) {
    throw new AppError(`Giờ bắt đầu (${fmtVn(startTime)}) đã qua — chỉ được xếp lịch trong tương lai.`, 400, {
      code: "SCHEDULE_IN_PAST",
    });
  }
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
      // BE-10: lịch của khóa PENDING giữ phòng; khóa REJECTED thì không.
      class: { status: { not: "REJECTED" } },
      id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    include: { class: { select: { id: true, name: true } }, room: { select: { id: true, name: true } } },
    orderBy: { startTime: "asc" },
  });

  if (roomConflict) {
    throw new AppError(
      `Phòng "${roomConflict.room.name}" đã được lớp "${roomConflict.class.name}" đặt từ ` +
        `${fmtVn(roomConflict.startTime)} đến ${fmtVn(roomConflict.endTime)}.`,
      409,
      {
        code: "ROOM_CONFLICT",
        conflict: {
          scheduleId: roomConflict.id,
          classId: roomConflict.class.id,
          className: roomConflict.class.name,
          roomId: roomConflict.room.id,
          roomName: roomConflict.room.name,
          startTime: roomConflict.startTime,
          endTime: roomConflict.endTime,
        },
      }
    );
  }

  // Coach conflict — HLV phụ trách lớp (mỗi lớp đúng 1 HLV) không được dạy 2 buổi trùng giờ
  const cls = await db.class.findUnique({ where: { id: classId }, select: { coachId: true } });
  if (!cls) return;
  const coachConflict = await db.classSchedule.findFirst({
    where: {
      status: "SCHEDULED",
      id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      class: { coachId: cls.coachId, status: { not: "REJECTED" } },
    },
    include: {
      class: { include: { coach: { include: { user: { select: { fullName: true } } } } } },
    },
  });

  if (coachConflict) {
    const coachName = coachConflict.class.coach.user.fullName ?? "HLV";
    throw new AppError(
      `HLV "${coachName}" đã có lịch dạy lớp "${coachConflict.class.name}" từ ` +
        `${fmtVn(coachConflict.startTime)} đến ${fmtVn(coachConflict.endTime)}.`,
      409,
      {
        code: "COACH_CONFLICT",
        conflict: {
          scheduleId: coachConflict.id,
          classId: coachConflict.classId,
          className: coachConflict.class.name,
          coachId: cls.coachId,
          coachName,
          roomId: coachConflict.roomId,
          startTime: coachConflict.startTime,
          endTime: coachConflict.endTime,
        },
      }
    );
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

export async function listSchedules(query: any, actor?: ScheduleActor) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.classId) where.classId = query.classId;
  if (query.roomId) where.roomId = query.roomId;
  if (query.status) where.status = query.status;
  // BE-15: `mine=true` — COACH: buổi các khóa mình phụ trách; MEMBER: buổi mình đang/đã giữ chỗ.
  if (query.mine === "true" && actor) {
    if (actor.role === "COACH") {
      const own = await prisma.class.findMany({ where: { coach: { userId: actor.id } }, select: { id: true } });
      const ids = own.map((c) => c.id).filter((id) => !query.classId || id === query.classId);
      where.classId = { in: ids };
    } else if (actor.role === "MEMBER") {
      const rows = await prisma.enrollment.findMany({
        where: { member: { userId: actor.id }, status: { in: ["BOOKED", "COMPLETED"] } },
        select: { scheduleId: true },
      });
      where.id = { in: rows.map((r) => r.scheduleId) };
    }
  }
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
    class: true,
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
  if (typeof where.classId === "string") conds.push(Prisma.sql`s."classId" = ${where.classId}`);
  if (where.classId?.in) {
    conds.push(where.classId.in.length ? Prisma.sql`s."classId" IN (${Prisma.join(where.classId.in)})` : Prisma.sql`FALSE`);
  }
  if (where.id?.in) {
    conds.push(where.id.in.length ? Prisma.sql`s."id" IN (${Prisma.join(where.id.in)})` : Prisma.sql`FALSE`);
  }
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

export async function createSchedule(data: any, actor: ScheduleActor) {
  return prisma.$transaction(async (tx) => {
    const cls = await tx.class.findUnique({ where: { id: data.classId } });
    if (!cls || !cls.isActive) throw new AppError("Class not found or inactive", 404);
    await assertCanManageClassSchedule(tx, actor, cls.id);
    assertClassApprovedForScheduling(cls);

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
    assertStartsInFuture(startTime);

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
      include: { class: true, room: true },
    });
  });
}

/**
 * Quick-planner của COACH: tạo lớp (phòng) trong MỘT transaction.
 * Coach tạo lớp ⇒ là HLV phụ trách lớp (Class.coachId); lớp PENDING chờ Manager duyệt,
 * nên CHƯA tạo buổi học — Coach thêm lịch sau khi lớp được APPROVED (POST /class-schedules).
 * Manager không tạo lớp (chỉ quản lý nền tảng + duyệt lớp).
 */
type ActivityPlanInput = {
  class: {
    name: string;
    fitness: string;
    description?: string;
    capacity: number;
    classType: "REGULAR" | "PREMIUM";
    areaType: "POOL" | "INDOOR" | "OUTDOOR";
    price?: number;
  };
  roomId: string;
  schedules: { startTime: string; endTime: string }[];
};

/** Phòng của kế hoạch: đang hoạt động, đúng khu vực, đủ sức chứa. */
async function assertPlanRoom(tx: Prisma.TransactionClient, data: ActivityPlanInput) {
  const room = await tx.room.findUnique({ where: { id: data.roomId } });
  if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);
  assertClassRoomAreaMatch(data.class.areaType, room.areaType);
  if (room.capacity < data.class.capacity) {
    throw new AppError("Room capacity is too small for this class", 400);
  }
}

/**
 * BE-10: ghi các buổi của kế hoạch cho khóa (PENDING) — mỗi buổi phải ở tương lai, không trùng phòng
 * và không trùng lịch dạy của HLV (kể cả buổi của khóa PENDING khác; khóa REJECTED không giữ chỗ).
 */
async function persistPlanSchedules(
  tx: Prisma.TransactionClient,
  classId: string,
  coachId: string,
  data: ActivityPlanInput
): Promise<number> {
  await lockScheduleResources(tx, [data.roomId], [coachId]);
  const slots = data.schedules
    .map((s) => ({ startTime: new Date(s.startTime), endTime: new Date(s.endTime) }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (const slot of slots) {
    assertStartsInFuture(slot.startTime);
    await checkConflicts(tx, data.roomId, classId, slot.startTime, slot.endTime);
  }
  const created = await tx.classSchedule.createMany({
    data: slots.map((slot) => ({ classId, roomId: data.roomId, ...slot, status: "SCHEDULED" as const })),
  });
  return created.count;
}

function planClassData(data: ActivityPlanInput) {
  return {
    name: data.class.name,
    fitness: data.class.fitness.trim(),
    description: data.class.description || null,
    capacity: data.class.capacity,
    classType: data.class.classType,
    areaType: data.class.areaType,
    price: data.class.price ?? 0,
  };
}

async function notifyManagersClassToReview(className: string, classId: string, resubmitted: boolean) {
  const managers = await prisma.user.findMany({
    where: { role: { name: "MANAGER" }, isActive: true },
    select: { id: true },
  });
  broadcastNotification(
    managers.map((m) => m.id),
    "GENERAL",
    resubmitted ? `Khóa học gửi lại chờ duyệt: ${className}` : `Khóa học mới chờ duyệt: ${className}`,
    resubmitted
      ? `Coach đã sửa và gửi lại khóa học "${className}". Vui lòng xét duyệt.`
      : `Coach đã tạo khóa học "${className}" và đang chờ xác nhận của bạn.`,
    { metadata: { classId } }
  ).catch(() => {});
}

/**
 * Coach tạo khóa học + toàn bộ lịch buổi trong MỘT giao dịch (BE-10).
 * Khóa ở trạng thái PENDING chờ Manager duyệt; lịch được lưu ngay (giữ phòng) để Manager xem đủ thông tin.
 */
export async function createActivityPlan(data: ActivityPlanInput, actor: { id: string; role: string }) {
  if (actor.role !== "COACH") throw new AppError("Chỉ Coach được tạo lớp học", 403);
  const result = await prisma.$transaction(async (tx) => {
    const coachProfile = await tx.coachProfile.findUnique({ where: { userId: actor.id } });
    if (!coachProfile) throw new AppError("Coach profile not found", 404);
    await assertPlanRoom(tx, data);

    const cls = await tx.class.create({
      data: { ...planClassData(data), status: "PENDING", coachId: coachProfile.id },
    });
    const schedulesCreated = await persistPlanSchedules(tx, cls.id, coachProfile.id, data);

    // Đảm bảo CoachWallet tồn tại cho HLV của lớp
    await tx.coachWallet.upsert({
      where: { coachId: coachProfile.id },
      create: { coachId: coachProfile.id, balance: 0 },
      update: {},
    });

    return { class: cls, schedulesCreated, status: "PENDING" as const };
  }, { timeout: 30_000 });

  void notifyManagersClassToReview(result.class.name, result.class.id, false);
  return result;
}

/**
 * BE-3: Coach sửa & gửi lại khóa PENDING/REJECTED — thay thông tin + TOÀN BỘ lịch (khóa chưa bán nên
 * chưa có chỗ đặt), xóa lý do từ chối, quay về PENDING chờ duyệt lại.
 */
export async function resubmitActivityPlan(classId: string, data: ActivityPlanInput, actor: { id: string; role: string }) {
  if (actor.role !== "COACH") throw new AppError("Forbidden", 403);
  const result = await prisma.$transaction(async (tx) => {
    const cls = await tx.class.findUnique({ where: { id: classId }, include: { coach: { select: { userId: true } } } });
    if (!cls) throw new AppError("Class not found", 404);
    if (cls.coach.userId !== actor.id) throw new AppError("Forbidden: You can only edit your own classes", 403);
    if (cls.status !== "PENDING" && cls.status !== "REJECTED") {
      throw new AppError("Chỉ sửa & gửi lại được khóa đang chờ duyệt hoặc bị từ chối.", 400, {
        code: "CLASS_NOT_EDITABLE",
        classStatus: cls.status,
      });
    }
    const booked = await tx.enrollment.count({ where: { schedule: { classId } } });
    if (booked > 0) throw new AppError("Khóa đã có học viên giữ chỗ — không thể thay lịch.", 409, { code: "CLASS_HAS_ENROLLMENTS" });

    await assertPlanRoom(tx, data);
    await tx.classSchedule.updateMany({ where: { classId }, data: { makeupForId: null } });
    await tx.classSchedule.deleteMany({ where: { classId } });
    const updated = await tx.class.update({
      where: { id: classId },
      data: { ...planClassData(data), status: "PENDING", rejectReason: null },
    });
    const schedulesCreated = await persistPlanSchedules(tx, classId, cls.coachId, data);
    return { class: updated, schedulesCreated, status: "PENDING" as const };
  }, { timeout: 30_000 });

  void notifyManagersClassToReview(result.class.name, classId, true);
  return result;
}


export async function getScheduleById(id: string) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: {
      class: { include: { coach: { include: { user: { select: { fullName: true } } } } } },
      room: true,
      _count: { select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } } },
    },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  return schedule;
}

// Unified cancellation: SCHEDULED → CANCELLED + BOOKED enrollments → CANCELLED.
// A12: lock theo schedule (cùng khoá với booking) + re-read + CAS trạng thái.
// Idempotent: CANCELLED gọi lại không update, không notify. COMPLETED → 400.
// Buổi đã có hội viên giữ chỗ ⇒ chỉ được hủy qua `cancelScheduleWithResolution` (dạy bù / hoàn tiền):
// các đường hủy cũ (PATCH status=CANCELLED, DELETE) bị chặn 400 SCHEDULE_CANCEL_RESOLUTION_REQUIRED.
async function cancelScheduleTx(
  tx: Prisma.TransactionClient,
  schedule: { id: string; classId: string; class: { name: string } },
  reason?: string,
  opts?: { allowBooked?: boolean }
) {
  await lockSchedule(tx, schedule.id);
  const fresh = await tx.classSchedule.findUnique({ where: { id: schedule.id } });
  if (!fresh) throw new AppError("Schedule not found", 404);
  if (fresh.status === "COMPLETED") {
    throw new AppError("Cannot cancel a completed schedule", 400);
  }
  if (fresh.status === "CANCELLED") {
    const current = await tx.classSchedule.findUnique({
      where: { id: schedule.id },
      include: { class: true, room: true },
    });
    return { updated: current!, reason: reason ?? "Lịch học bị hủy" };
  }

  if (!opts?.allowBooked) {
    const bookedCount = await tx.enrollment.count({ where: { scheduleId: schedule.id, status: "BOOKED" } });
    if (bookedCount > 0) {
      throw new AppError(
        "Buổi học đã có hội viên đặt chỗ — phải chọn DẠY BÙ hoặc HOÀN TIỀN qua POST /class-schedules/:id/cancel.",
        400,
        { code: "SCHEDULE_CANCEL_RESOLUTION_REQUIRED", bookedCount }
      );
    }
  }

  await tx.enrollment.updateMany({
    where: { scheduleId: schedule.id, status: "BOOKED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  const cancelled = await tx.classSchedule.updateMany({
    where: { id: schedule.id, status: "SCHEDULED" },
    // BE-20: lưu lý do hủy để Member/HLV xem lại.
    data: { status: "CANCELLED", cancelReason: reason?.trim() || null },
  });
  if (cancelled.count === 0) {
    throw new AppError("Lịch học đã thay đổi trạng thái, vui lòng tải lại.", 409, {
      code: "SCHEDULE_STATE_CHANGED",
    });
  }
  const updated = await tx.classSchedule.findUnique({
    where: { id: schedule.id },
    include: { class: true, room: true },
  });
  return { updated: updated!, reason: reason ?? "Lịch học bị hủy" };
}

/**
 * A11 — Dời giờ lịch có booking: mọi member đang giữ chỗ phải giữ được chỗ sau khi dời.
 * - Không trùng giờ với booking khác của chính họ.
 * - Vẫn nằm trong khoảng quyền lợi (A10) tại thời điểm học mới.
 * Vi phạm ⇒ 409 kèm danh sách member để FE/CSKH xử lý (không tự ý phá chỗ đã đặt).
 */
async function assertScheduleMoveKeepsBookingsValid(
  tx: Prisma.TransactionClient,
  params: { scheduleId: string; startTime: Date; endTime: Date }
) {
  const booked = await tx.enrollment.findMany({
    where: { scheduleId: params.scheduleId, status: "BOOKED" },
    select: { memberId: true, member: { select: { user: { select: { fullName: true } } } } },
  });
  if (booked.length === 0) return;

  const memberIds = booked.map((b) => b.memberId);
  const [conflicts] = await Promise.all([
    tx.enrollment.findMany({
      where: {
        memberId: { in: memberIds },
        status: "BOOKED",
        scheduleId: { not: params.scheduleId },
        schedule: {
          status: { not: "CANCELLED" },
          startTime: { lt: params.endTime },
          endTime: { gt: params.startTime },
        },
      },
      select: { memberId: true },
    })
  ]);

  const conflicted = new Set(conflicts.map((c: any) => c.memberId));
  const uncovered: string[] = [];
  if (conflicted.size === 0 && uncovered.length === 0) return;

  const nameOf = (memberId: string) =>
    booked.find((b) => b.memberId === memberId)?.member.user.fullName ?? memberId;
  throw new AppError(
    "Không thể dời lịch: một số hội viên đã giữ chỗ sẽ bị trùng giờ hoặc ngoài hạn gói.",
    409,
    {
      code: "SCHEDULE_MOVE_IMPACT",
      conflicts: [...conflicted].map(nameOf),
      uncovered: uncovered.map((u: any) => nameOf(u)),
    }
  );
}

export type ScheduleCancelResolution =
  | { mode: "MAKEUP"; startTime: string; endTime: string; roomId?: string }
  | { mode: "REFUND" };

/**
 * Hủy MỘT buổi học kèm xử lý quyền lợi hội viên (chỉ COACH phụ trách lớp).
 *
 * - Buổi đã có hội viên giữ chỗ ⇒ BẮT BUỘC chọn `resolution`, thiếu ⇒ 400 SCHEDULE_CANCEL_RESOLUTION_REQUIRED:
 *   - `MAKEUP`: tạo buổi DẠY BÙ (giờ + phòng mới; kiểm tra trùng phòng/HLV và trùng lịch của hội viên),
 *     tự chuyển toàn bộ hội viên đã đặt sang buổi bù.
 *   - `REFUND`: mỗi hội viên đã thanh toán lớp nhận 1 yêu cầu hoàn tiền 1 buổi (PENDING, chờ Manager duyệt).
 * - Buổi chưa ai đặt ⇒ hủy tự do; gửi `MAKEUP` vẫn tạo buổi bù như dời lịch.
 * Toàn bộ chạy trong MỘT transaction dưới `lockSchedule` (cùng khoá với booking).
 */
export async function cancelScheduleWithResolution(
  id: string,
  data: { reason?: string; resolution?: ScheduleCancelResolution },
  actor: { id: string; role: string }
) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true, room: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);

  await assertCanManageClassSchedule(prisma, actor, schedule.classId);

  const reason = data.reason?.trim() || "Lịch học bị hủy";
  const resolution = data.resolution;

  const result = await prisma.$transaction(async (tx) => {
    await lockSchedule(tx, id);
    const fresh = await tx.classSchedule.findUnique({ where: { id } });
    if (!fresh) throw new AppError("Schedule not found", 404);
    if (fresh.status === "COMPLETED") throw new AppError("Cannot cancel a completed schedule", 400);
    if (fresh.status === "CANCELLED") {
      throw new AppError("Schedule is already cancelled", 400, { code: "SCHEDULE_ALREADY_CANCELLED" });
    }

    const booked = await tx.enrollment.findMany({
      where: { scheduleId: id, status: "BOOKED" },
      select: { memberId: true, member: { select: { userId: true } } },
    });
    if (booked.length > 0 && !resolution) {
      throw new AppError(
        "Buổi học đã có hội viên đặt chỗ — phải chọn DẠY BÙ (MAKEUP) hoặc HOÀN TIỀN (REFUND).",
        400,
        { code: "SCHEDULE_CANCEL_RESOLUTION_REQUIRED", bookedCount: booked.length }
      );
    }
    const memberIds = booked.map((b) => b.memberId);
    const cancelTarget = { id, classId: fresh.classId, class: schedule.class };

    let makeup: { id: string; startTime: Date; endTime: Date; room: { name: string } } | null = null;
    let refunds: { id: string; memberId: string; amount: number }[] = [];

    if (resolution?.mode === "MAKEUP") {
      const startTime = new Date(resolution.startTime);
      const endTime = new Date(resolution.endTime);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        throw new AppError("Invalid startTime or endTime", 400);
      }
      if (endTime <= startTime) throw new AppError("endTime must be strictly greater than startTime", 400);
      if (startTime <= new Date()) throw new AppError("Buổi dạy bù phải ở thời điểm trong tương lai", 400);
      // Buổi bù là một buổi mới giữ phòng ⇒ cùng luật với tạo lịch: lớp phải APPROVED.
      assertClassApprovedForScheduling(schedule.class);

      const roomId = resolution.roomId ?? fresh.roomId;
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);
      if (room.capacity < schedule.class.capacity) {
        throw new AppError("Room capacity is too small for this class", 400);
      }
      assertClassRoomAreaMatch(schedule.class.areaType, room.areaType);

      // Lock Room + Coaches (thứ tự cố định) rồi kiểm tra trùng — loại trừ chính buổi sắp hủy.
      const coachIds = await getCoachIdsOfClass(tx, fresh.classId);
      await lockScheduleResources(tx, [roomId], coachIds);
      await checkConflicts(tx, roomId, fresh.classId, startTime, endTime, id);
      // Hội viên đang giữ chỗ không được bị trùng giờ với lịch khác của họ ở giờ dạy bù.
      await assertScheduleMoveKeepsBookingsValid(tx, { scheduleId: id, startTime, endTime });

      await cancelScheduleTx(tx, cancelTarget, reason, { allowBooked: true });
      makeup = await tx.classSchedule.create({
        data: { classId: fresh.classId, roomId, startTime, endTime, status: "SCHEDULED", makeupForId: id },
        include: { class: true, room: true },
      });
      if (memberIds.length > 0) {
        await tx.enrollment.createMany({
          data: memberIds.map((memberId) => ({
            memberId,
            scheduleId: makeup!.id,
            status: "BOOKED" as const,
          })),
          skipDuplicates: true,
        });
      }
    } else if (resolution?.mode === "REFUND") {
      // Tạo yêu cầu hoàn TRƯỚC khi hủy chỗ: giữ thứ tự lock schedule → payment → enrollment (refunds.service).
      refunds = await createSessionRefundsTx(tx, {
        scheduleId: id,
        classId: fresh.classId,
        memberIds,
        requestedById: actor.id,
        note: reason,
      });
      await cancelScheduleTx(tx, cancelTarget, reason, { allowBooked: true });
    } else {
      await cancelScheduleTx(tx, cancelTarget, reason, { allowBooked: true });
    }

    // BE-20: phương án xử lý (dạy bù / hoàn tiền) — null khi buổi chưa ai đặt.
    await tx.classSchedule.update({
      where: { id },
      data: { cancelReason: data.reason?.trim() || null, cancelResolution: resolution?.mode ?? null },
    });
    const cancelled = await tx.classSchedule.findUnique({
      where: { id },
      include: { class: true, room: true },
    });
    return { cancelled, makeup, refunds, userIds: [...new Set(booked.map((b) => b.member.userId))] };
  });

  // Thông báo sau commit — fire-and-forget.
  const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const className = schedule.class.name;
  if (result.userIds.length > 0) {
    let body = `Lịch học "${className}" vào lúc ${fmt(schedule.startTime)} đã bị hủy.`;
    if (result.makeup) {
      body +=
        ` Buổi dạy bù: ${fmt(result.makeup.startTime)} – ${fmt(result.makeup.endTime)} tại ${result.makeup.room.name}.` +
        " Bạn đã được tự động giữ chỗ ở buổi bù.";
    } else if (resolution?.mode === "REFUND") {
      body += " Nếu bạn đã thanh toán khóa học, tiền của buổi này sẽ được hoàn sau khi quản lý xác nhận.";
    }
    broadcastNotification(result.userIds, "SCHEDULE_CANCELLED", `Lịch học đã bị hủy: ${className}`, body, {
      reason,
      metadata: { scheduleId: id, classId: schedule.classId, makeupScheduleId: result.makeup?.id ?? null },
    }).catch(() => {});
  }
  if (result.refunds.length > 0) {
    const total = result.refunds.reduce((sum, r) => sum + r.amount, 0);
    void notifyManagersNewRefunds(
      `Buổi học lớp "${className}" lúc ${fmt(schedule.startTime)} bị hủy (không dạy bù) — ` +
        `${result.refunds.length} hội viên cần hoàn tổng ${total.toLocaleString("vi-VN")}đ.`,
      { scheduleId: id, classId: schedule.classId, refundIds: result.refunds.map((r) => r.id) }
    );
  }

  return { schedule: result.cancelled, makeup: result.makeup, refunds: result.refunds };
}

export async function updateSchedule(id: string, data: any, actor: ScheduleActor) {
  const existing = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true, room: true },
  });
  if (!existing) throw new AppError("Schedule not found", 404);
  await assertCanManageClassSchedule(prisma, actor, existing.classId);

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

  // Đổi room/time: lock theo SCHEDULE (cùng khoá với booking — A12) rồi tới room/coaches, re-check trong tx.
  if (timeOrRoomChanged) {
    assertClassApprovedForScheduling(existing.class);
    assertStartsInFuture(startTime);
    const updated = await prisma.$transaction(async (tx) => {
      // A12: mọi mutation lịch phải xếp hàng trên cùng advisory lock với booking.
      await lockSchedule(tx, id);
      const fresh = await tx.classSchedule.findUnique({ where: { id } });
      if (!fresh) throw new AppError("Schedule not found", 404);
      if (fresh.status !== "SCHEDULED") {
        throw new AppError("Lịch học đã thay đổi trạng thái, vui lòng tải lại.", 409, {
          code: "SCHEDULE_STATE_CHANGED",
        });
      }

      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);
      if (room.capacity < existing.class.capacity) {
        throw new AppError("Room capacity is too small for this class", 400);
      }
      assertClassRoomAreaMatch(existing.class.areaType, room.areaType);

      const coachIds = await getCoachIdsOfClass(tx, existing.classId);
      await lockScheduleResources(tx, [fresh.roomId, roomId], coachIds);
      await checkConflicts(tx, roomId, existing.classId, startTime, endTime, id);

      // A11: không dời lịch nếu phá chỗ đã hợp lệ (trùng giờ / ngoài hạn gói của member đang giữ chỗ).
      await assertScheduleMoveKeepsBookingsValid(tx, { scheduleId: id, startTime, endTime });

      // A12: CAS trạng thái — lịch vừa bị hủy/hoàn tất trong lúc chờ lock thì không ghi.
      const moved = await tx.classSchedule.updateMany({
        where: { id, status: "SCHEDULED" },
        data: { startTime, endTime, roomId },
      });
      if (moved.count === 0) {
        throw new AppError("Lịch học đã thay đổi trạng thái, vui lòng tải lại.", 409, {
          code: "SCHEDULE_STATE_CHANGED",
        });
      }

      return tx.classSchedule.findUnique({
        where: { id },
        include: { class: true, room: true },
      });
    });
    if (!updated) throw new AppError("Schedule not found", 404);

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
    include: { class: true, room: true },
  });
}

export async function deleteSchedule(id: string, actor: ScheduleActor) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  await assertCanManageClassSchedule(prisma, actor, schedule.classId);
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
export async function completeSchedule(id: string, actor: ScheduleActor) {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id },
    include: { class: true, room: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  await assertCanManageClassSchedule(prisma, actor, schedule.classId);
  if (schedule.status === "COMPLETED") return schedule; // idempotent
  if (schedule.status === "CANCELLED") throw new AppError("Cannot complete a cancelled schedule", 400);
  if (schedule.endTime > new Date()) {
    throw new AppError("Cannot complete a schedule that has not ended yet", 400);
  }

  const completed = await prisma.$transaction(async (tx) => {
    // A12: lock cùng khoá với booking + CAS trạng thái (không hoàn tất lịch vừa bị hủy).
    await lockSchedule(tx, id);
    const fresh = await tx.classSchedule.findUnique({ where: { id } });
    if (!fresh) throw new AppError("Schedule not found", 404);
    if (fresh.status === "CANCELLED") {
      throw new AppError("Cannot complete a cancelled schedule", 400);
    }
    if (fresh.status === "COMPLETED") {
      throw new AppError("Lịch học đã được hoàn tất bởi thao tác khác.", 409, {
        code: "SCHEDULE_STATE_CHANGED",
      });
    }

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

    const closed = await tx.classSchedule.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "COMPLETED" },
    });
    if (closed.count === 0) {
      throw new AppError("Lịch học đã thay đổi trạng thái, vui lòng tải lại.", 409, {
        code: "SCHEDULE_STATE_CHANGED",
      });
    }

    return tx.classSchedule.findUnique({
      where: { id },
      include: { class: true, room: true },
    });
  });
  if (!completed) throw new AppError("Schedule not found", 404);

  // §7: quét lại chuyên cần của lớp và gửi warning cho các bucket WARN (dedupe theo rate).
  // Fire-and-forget để không chặn response; không ảnh hưởng kết quả complete.
  scanAttendanceWarnings(schedule.classId).catch(() => {});

  return completed;
}
