import type { MakeupRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { memberAbsenceReason } from "../../config/attendance.js";
import { MAKEUP, guestSeatCap } from "../../config/makeup.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockMemberClass, lockSchedule } from "../../utils/dbLocks.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";
import { createMemberSessionRefundTx, notifyManagersNewRefunds, SESSION_REFUND_MIN_HOURS } from "../refunds/refunds.service.js";
import { assertCanBook } from "../enrollments/enrollments.service.js";

/**
 * Yêu cầu học bù (Doc/MAKEUP_ABSENCE_PLAN.md §3.3): học viên đã báo vắng xin một buổi khác để học bù;
 * HLV phụ trách khóa xếp vào buổi có sẵn / buổi bù mở, hoặc từ chối. Học viên tự chọn được buổi bù mở của khóa mình.
 * Từ chối / hết hạn mà yêu cầu gửi ≥ 24h trước buổi vắng ⇒ hoàn 80% tiền buổi (như hủy buổi đúng hạn).
 */

type Db = typeof prisma | Prisma.TransactionClient;
export type MakeupActor = { id: string; role: string };

const ACTIVE: MakeupRequestStatus[] = ["PENDING", "SCHEDULED"];
const ACTIVE_ENROLLMENT = { in: ["BOOKED", "COMPLETED"] as ("BOOKED" | "COMPLETED")[] };
const DAY = 86_400_000;

const SESSION_SELECT = {
  id: true,
  classId: true,
  startTime: true,
  endTime: true,
  status: true,
  isMakeupSlot: true,
  class: { select: { id: true, name: true } },
  room: { select: { name: true } },
} satisfies Prisma.ClassScheduleSelect;

const REQUEST_INCLUDE = {
  member: { select: { id: true, userId: true, user: { select: { fullName: true, avatarUrl: true } } } },
  missedEnrollment: { select: { id: true, schedule: { select: SESSION_SELECT } } },
  targetSchedule: { select: SESSION_SELECT },
} satisfies Prisma.MakeupRequestInclude;

type RequestRow = Prisma.MakeupRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type SessionRow = Prisma.ClassScheduleGetPayload<{ select: typeof SESSION_SELECT }>;

function sessionView(s: SessionRow | null) {
  if (!s) return null;
  return {
    id: s.id,
    classId: s.classId,
    className: s.class.name,
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    roomName: s.room?.name ?? null,
    isMakeupSlot: s.isMakeupSlot,
  };
}

export function makeupRequestView(r: RequestRow) {
  return {
    id: r.id,
    status: r.status,
    reason: r.reason,
    requestedAt: r.requestedAt,
    expiresAt: r.expiresAt,
    resolvedAt: r.resolvedAt,
    rejectReason: r.rejectReason,
    refundEligible: r.refundEligible,
    refundId: r.refundId,
    paidClassId: r.paidClassId,
    missedEnrollmentId: r.missedEnrollmentId,
    member: { id: r.member.id, userId: r.member.userId, fullName: r.member.user.fullName, avatarUrl: r.member.user.avatarUrl },
    missedSession: sessionView(r.missedEnrollment.schedule),
    targetSession: sessionView(r.targetSchedule),
  };
}

const fmtSession = (d: Date) =>
  d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

async function loadRequest(db: Db, id: string) {
  const r = await db.makeupRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
  if (!r) throw new AppError("Không tìm thấy yêu cầu học bù.", 404, { code: "MAKEUP_NOT_FOUND" });
  return r;
}

async function coachProfileIdOf(userId: string) {
  const coach = await prisma.coachProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!coach) throw new AppError("Không tìm thấy hồ sơ HLV.", 404);
  return coach.id;
}

/** HLV phụ trách khóa (hoặc Quản lý) mới xử lý được; học viên chỉ đụng tới yêu cầu của mình. */
async function assertCanHandle(r: RequestRow, actor: MakeupActor) {
  if (actor.role === "MANAGER") return;
  if (actor.role === "COACH" && (await coachProfileIdOf(actor.id)) === r.coachId) return;
  throw new AppError("Bạn không phụ trách khóa của yêu cầu này.", 403, { code: "NOT_CLASS_COACH" });
}

function assertOwner(r: RequestRow, actor: MakeupActor) {
  if (actor.role !== "MEMBER" || r.member.userId !== actor.id) throw new AppError("Forbidden", 403);
}

// ─── Tạo yêu cầu ────────────────────────────────────────────────────────────

type MissedEnrollment = {
  id: string;
  memberId: string;
  sourceClassId: string | null;
  scheduleId: string;
  schedule: { classId: string; startTime: Date };
};

/**
 * Tạo yêu cầu học bù cho chỗ [e] (đã báo vắng) trong transaction của người gọi (đã khóa member × khóa).
 * Mỗi chỗ chỉ có MỘT yêu cầu đang hoạt động. Hạn = ngày kết thúc khóa đã mua + N ngày.
 */
export async function createMakeupRequestTx(tx: Prisma.TransactionClient, e: MissedEnrollment, reason: string, now = new Date()) {
  const paidClassId = e.sourceClassId ?? e.schedule.classId;
  const paid = await tx.class.findUnique({
    where: { id: paidClassId },
    select: { id: true, name: true, coachId: true, endDate: true, coach: { select: { userId: true } } },
  });
  if (!paid) throw new AppError("Class not found", 404);
  const active = await tx.makeupRequest.findFirst({ where: { missedEnrollmentId: e.id, status: { in: ACTIVE } } });
  if (active) throw new AppError("Buổi này đã có yêu cầu học bù.", 409, { code: "MAKEUP_ALREADY_REQUESTED" });

  const courseEnd = paid.endDate ?? e.schedule.startTime;
  const expiresAt = new Date(courseEnd.getTime() + MAKEUP.REQUEST_EXPIRE_DAYS_AFTER_COURSE * DAY);
  if (expiresAt <= now) {
    throw new AppError("Khóa đã kết thúc quá lâu — không xin học bù được nữa.", 400, { code: "MAKEUP_WINDOW_CLOSED" });
  }
  const request = await tx.makeupRequest.create({
    data: {
      memberId: e.memberId,
      missedEnrollmentId: e.id,
      missedScheduleId: e.scheduleId,
      paidClassId,
      coachId: paid.coachId,
      reason,
      requestedAt: now,
      refundEligible: e.schedule.startTime.getTime() - now.getTime() >= SESSION_REFUND_MIN_HOURS * 3_600_000,
      expiresAt,
    },
  });
  return { request, coachUserId: paid.coach.userId, className: paid.name };
}

export function notifyCoachMakeupRequested(coachUserId: string, memberName: string, className: string, missedStart: Date, requestId: string) {
  createNotification(
    coachUserId,
    "MAKEUP_REQUESTED",
    `Xin học bù: ${className}`,
    `${memberName} báo vắng buổi ${fmtSession(missedStart)} và xin một buổi học bù. Vào "Yêu cầu học bù" để xếp buổi.`,
    { metadata: { makeupRequestId: requestId } }
  ).catch(() => {});
}

/** Học viên xin học bù cho một buổi ĐÃ báo vắng (chưa xin lúc báo vắng). */
export async function requestMakeupForAbsence(enrollmentId: string, userId: string) {
  const e = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { member: { select: { userId: true, user: { select: { fullName: true } } } }, schedule: true },
  });
  if (!e) throw new AppError("Enrollment not found", 404);
  if (e.member.userId !== userId) throw new AppError("Forbidden", 403);
  if (e.status !== "BOOKED" && e.status !== "COMPLETED") throw new AppError("Chỉ xin học bù cho buổi đang giữ chỗ.", 400);
  const paidClassId = e.sourceClassId ?? e.schedule.classId;
  const created = await prisma.$transaction(async (tx) => {
    await lockMemberClass(tx, e.memberId, paidClassId);
    const absence = await tx.attendance.findUnique({ where: { scheduleId_memberId: { scheduleId: e.scheduleId, memberId: e.memberId } } });
    const reason = absence?.status === "EXCUSED" ? memberAbsenceReason(absence.note) : null;
    if (reason === null) {
      throw new AppError("Hãy báo vắng buổi này trước khi xin học bù.", 400, { code: "ABSENCE_REQUIRED" });
    }
    return createMakeupRequestTx(tx, e, reason);
  });
  notifyCoachMakeupRequested(created.coachUserId, e.member.user.fullName, created.className, e.schedule.startTime, created.request.id);
  return makeupRequestView(await loadRequest(prisma, created.request.id));
}

// ─── Đóng yêu cầu (từ chối / hết hạn) + hoàn tiền ──────────────────────────

/** PENDING ⇒ REJECTED / EXPIRED; đủ điều kiện ⇒ hoàn 80% tiền buổi vắng (tính theo lúc gửi yêu cầu). */
async function closeWithRefund(r: RequestRow, status: "REJECTED" | "EXPIRED", actorId: string | null, rejectReason: string | null) {
  const refund = await prisma.$transaction(async (tx) => {
    await lockMemberClass(tx, r.memberId, r.paidClassId);
    const closed = await tx.makeupRequest.updateMany({
      where: { id: r.id, status: "PENDING" },
      data: { status, resolvedAt: new Date(), resolvedById: actorId, rejectReason },
    });
    if (closed.count !== 1) throw new AppError("Yêu cầu không còn chờ xử lý.", 409, { code: "MAKEUP_NOT_PENDING" });
    if (!r.refundEligible) return null;
    const created = await createMemberSessionRefundTx(tx, {
      memberId: r.memberId,
      userId: r.member.userId,
      classId: r.paidClassId,
      scheduleId: r.missedScheduleId,
      startTime: r.missedEnrollment.schedule.startTime,
      now: r.requestedAt,
      note:
        status === "REJECTED"
          ? "Yêu cầu học bù bị HLV từ chối — hoàn 80% tiền buổi (đã báo vắng trước ≥ 24h)."
          : "Yêu cầu học bù hết hạn chưa được xếp — hoàn 80% tiền buổi (đã báo vắng trước ≥ 24h).",
    });
    if (created) await tx.makeupRequest.update({ where: { id: r.id }, data: { refundId: created.id } });
    return created;
  });

  const missed = r.missedEnrollment.schedule;
  const money = refund ? ` Bạn được hoàn ${Number(refund.amount).toLocaleString("vi-VN")}đ (chờ Quản lý chuyển khoản).` : "";
  createNotification(
    r.member.userId,
    "MAKEUP_REJECTED",
    status === "REJECTED" ? `HLV chưa xếp được buổi học bù: ${missed.class.name}` : `Yêu cầu học bù đã hết hạn: ${missed.class.name}`,
    (status === "REJECTED"
      ? `Yêu cầu học bù cho buổi ${fmtSession(missed.startTime)} bị từ chối${rejectReason ? `: ${rejectReason}` : ""}.`
      : `Yêu cầu học bù cho buổi ${fmtSession(missed.startTime)} đã hết hạn mà chưa được xếp buổi.`) + money,
    { metadata: { makeupRequestId: r.id, refundId: refund?.id ?? null } }
  ).catch(() => {});
  if (refund) {
    void notifyManagersNewRefunds(`Yêu cầu học bù "${missed.class.name}" không được xếp — cần hoàn ${Number(refund.amount).toLocaleString("vi-VN")}đ.`, {
      refundId: refund.id,
      classId: r.paidClassId,
      scheduleId: r.missedScheduleId,
    });
  }
  return refund;
}

/** Hết hạn mọi yêu cầu PENDING đã quá `expiresAt` (gọi lười ở API danh sách + job bảo trì lớp học). */
export async function expireMakeupRequests(now = new Date()) {
  const due = await prisma.makeupRequest.findMany({ where: { status: "PENDING", expiresAt: { lte: now } }, include: REQUEST_INCLUDE, take: 200 });
  let expired = 0;
  for (const r of due) {
    try {
      await closeWithRefund(r, "EXPIRED", null, null);
      expired++;
    } catch (err) {
      if (!(err instanceof AppError && err.statusCode === 409)) throw err;
    }
  }
  return { expired };
}

export async function rejectMakeupRequest(id: string, actor: MakeupActor, reason: string) {
  const r = await loadRequest(prisma, id);
  await assertCanHandle(r, actor);
  if (r.status !== "PENDING") throw new AppError("Yêu cầu không còn chờ xử lý.", 409, { code: "MAKEUP_NOT_PENDING" });
  const refund = await closeWithRefund(r, "REJECTED", actor.id, reason.trim());
  return { request: makeupRequestView(await loadRequest(prisma, id)), refund: refund ? { id: refund.id, amount: Number(refund.amount) } : null };
}

export async function cancelMyMakeupRequest(id: string, actor: MakeupActor) {
  const r = await loadRequest(prisma, id);
  assertOwner(r, actor);
  const res = await prisma.makeupRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED", resolvedAt: new Date(), resolvedById: actor.id },
  });
  if (res.count !== 1) throw new AppError("Chỉ rút được yêu cầu đang chờ xử lý.", 409, { code: "MAKEUP_NOT_PENDING" });
  return makeupRequestView(await loadRequest(prisma, id));
}

/**
 * Chỗ ở buổi [scheduleId] sắp bị hủy / đổi / hủy báo vắng: yêu cầu PENDING ⇒ CANCELLED;
 * đã xếp học bù (SCHEDULED) ⇒ 409 (phải hủy buổi học bù trước).
 */
export async function releaseMakeupForMissedTx(tx: Prisma.TransactionClient, memberId: string, scheduleId: string) {
  const active = await tx.makeupRequest.findMany({ where: { memberId, missedScheduleId: scheduleId, status: { in: ACTIVE } } });
  if (active.some((r) => r.status === "SCHEDULED")) {
    throw new AppError("Buổi này đã được xếp học bù — hủy buổi học bù trước.", 409, { code: "MAKEUP_ALREADY_SCHEDULED" });
  }
  if (active.length > 0) {
    await tx.makeupRequest.updateMany({
      where: { id: { in: active.map((r) => r.id) } },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
  }
}

// ─── Danh sách ──────────────────────────────────────────────────────────────

export async function listMyMakeupRequests(userId: string) {
  await expireMakeupRequests();
  const member = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!member) throw new AppError("Member profile not found", 404);
  const rows = await prisma.makeupRequest.findMany({
    where: { memberId: member.id },
    include: REQUEST_INCLUDE,
    orderBy: { requestedAt: "desc" },
    take: 100,
  });
  return rows.map(makeupRequestView);
}

export async function listMakeupRequests(actor: MakeupActor, query: { status?: string; classId?: string; page?: string; limit?: string }) {
  await expireMakeupRequests();
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const where: Prisma.MakeupRequestWhereInput = {
    ...(actor.role === "COACH" ? { coachId: await coachProfileIdOf(actor.id) } : {}),
    ...(query.status ? { status: query.status as MakeupRequestStatus } : {}),
    ...(query.classId ? { paidClassId: query.classId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.makeupRequest.count({ where }),
    prisma.makeupRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { requests: rows.map(makeupRequestView), pagination: buildPaginationMeta(total, page, limit) };
}

export async function countPendingForCoach(coachProfileId: string) {
  return prisma.makeupRequest.count({ where: { coachId: coachProfileId, status: "PENDING" } });
}

// ─── Buổi có thể xếp ────────────────────────────────────────────────────────

type TargetSchedule = Prisma.ClassScheduleGetPayload<{
  include: { class: { select: { id: true; name: true; capacity: true; coachId: true; classType: true; status: true; isActive: true } } };
}>;

/** Buổi đích hợp lệ: học viên ⇒ chỉ buổi bù mở của khóa đã mua; HLV ⇒ thêm buổi khóa đó + khóa cùng HLV, cùng hạng. */
function isEligibleTarget(
  r: { paidClassId: string; missedScheduleId: string },
  paid: { coachId: string; classType: string },
  t: TargetSchedule,
  forMember: boolean,
  now: Date
) {
  if (t.status !== "SCHEDULED" || t.id === r.missedScheduleId) return false;
  if (t.startTime.getTime() <= now.getTime() + MAKEUP.ASSIGN_MIN_LEAD_MINUTES * 60_000) return false;
  if (forMember) return t.classId === r.paidClassId && t.isMakeupSlot;
  if (t.classId === r.paidClassId) return true;
  return t.class.coachId === paid.coachId && t.class.classType === paid.classType && t.class.status === "APPROVED" && t.class.isActive;
}

const capacityOf = (t: { isMakeupSlot: boolean; slotCapacity: number | null; class: { capacity: number } }) =>
  t.isMakeupSlot ? (t.slotCapacity ?? t.class.capacity) : t.class.capacity;

/** Danh sách buổi có thể xếp cho yêu cầu (học viên: buổi bù mở; HLV: mọi buổi hợp lệ) kèm chỗ trống / xung đột. */
export async function getMakeupOptions(id: string, actor: MakeupActor) {
  const r = await loadRequest(prisma, id);
  const forMember = actor.role === "MEMBER";
  if (forMember) assertOwner(r, actor);
  else await assertCanHandle(r, actor);
  const paid = await prisma.class.findUniqueOrThrow({ where: { id: r.paidClassId }, select: { coachId: true, classType: true } });
  const now = new Date();

  const targets = await prisma.classSchedule.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gt: new Date(now.getTime() + MAKEUP.ASSIGN_MIN_LEAD_MINUTES * 60_000) },
      id: { not: r.missedScheduleId },
      OR: forMember
        ? [{ classId: r.paidClassId, isMakeupSlot: true }]
        : [{ classId: r.paidClassId }, { class: { coachId: paid.coachId, classType: paid.classType, status: "APPROVED", isActive: true } }],
    },
    include: {
      class: { select: { id: true, name: true, capacity: true, coachId: true, classType: true, status: true, isActive: true } },
      room: { select: { name: true } },
      _count: { select: { enrollments: { where: { status: ACTIVE_ENROLLMENT } } } },
    },
    orderBy: { startTime: "asc" },
    take: 100,
  });
  const ids = targets.map((t) => t.id);
  const [guests, mine] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["scheduleId"],
      where: { scheduleId: { in: ids }, status: ACTIVE_ENROLLMENT, sourceClassId: { not: null } },
      _count: { _all: true },
    }),
    prisma.enrollment.findMany({
      where: { memberId: r.memberId, status: ACTIVE_ENROLLMENT, id: { not: r.missedEnrollmentId }, schedule: { status: "SCHEDULED", endTime: { gt: now } } },
      select: { scheduleId: true, schedule: { select: { startTime: true, endTime: true, class: { select: { name: true } } } } },
    }),
  ]);
  const guestBy = new Map(guests.map((g) => [g.scheduleId, g._count._all]));
  const pending = r.status === "PENDING";

  const options = targets
    .filter((t) => isEligibleTarget(r, paid, t, forMember, now))
    .filter((t) => !mine.some((m) => m.scheduleId === t.id))
    .map((t) => {
      const capacity = capacityOf(t);
      const booked = t._count.enrollments;
      const cross = t.classId !== r.paidClassId;
      const guestCap = cross && !t.isMakeupSlot ? guestSeatCap(capacity) : null;
      const guestFull = guestCap !== null && (guestBy.get(t.id) ?? 0) >= guestCap;
      const conflict = mine.find((m) => m.schedule.startTime < t.endTime && m.schedule.endTime > t.startTime);
      const isFull = booked >= capacity;
      return {
        scheduleId: t.id,
        classId: t.classId,
        className: t.class.name,
        isSameClass: !cross,
        isMakeupSlot: t.isMakeupSlot,
        startTime: t.startTime,
        endTime: t.endTime,
        roomName: t.room?.name ?? null,
        capacity,
        bookedCount: booked,
        remainingSlots: Math.max(0, capacity - booked),
        isFull,
        guestSeatsFull: guestFull,
        conflictWith: conflict ? { scheduleId: conflict.scheduleId, className: conflict.schedule.class.name } : null,
        canSelect: pending && !isFull && !guestFull && !conflict,
      };
    });
  return { request: makeupRequestView(r), options };
}

// ─── Xếp buổi ───────────────────────────────────────────────────────────────

/**
 * Xếp yêu cầu [id] vào buổi [scheduleId] (HLV) hoặc học viên tự chọn buổi bù mở.
 * Áp dụng đủ luật đặt chỗ (đã mua khóa, sức chứa, trùng giờ, đã hoàn tiền) + chỗ khách trên buổi chính.
 * Tạo chỗ mới (`makeupRequestId`, `sourceClassId` nếu khác khóa); chỗ ở buổi vắng giữ nguyên.
 */
export async function assignMakeup(id: string, scheduleId: string, actor: MakeupActor) {
  const r = await loadRequest(prisma, id);
  const forMember = actor.role === "MEMBER";
  if (forMember) assertOwner(r, actor);
  else await assertCanHandle(r, actor);
  if (r.status !== "PENDING") throw new AppError("Yêu cầu không còn chờ xử lý.", 409, { code: "MAKEUP_NOT_PENDING" });

  const target = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    include: { class: { select: { id: true, name: true, capacity: true, coachId: true, classType: true, status: true, isActive: true } } },
  });
  if (!target) throw new AppError("Schedule not found", 404);
  const paid = await prisma.class.findUniqueOrThrow({ where: { id: r.paidClassId }, select: { coachId: true, classType: true } });
  if (!isEligibleTarget(r, paid, target, forMember, new Date())) {
    throw new AppError(
      forMember
        ? "Chỉ chọn được buổi bù đang mở của khóa bạn đã mua."
        : "Chỉ xếp vào buổi sắp tới của khóa này, buổi bù mở, hoặc khóa cùng HLV, cùng hạng.",
      400,
      { code: "MAKEUP_TARGET_NOT_ELIGIBLE" }
    );
  }
  const cross = target.classId !== r.paidClassId;
  const capacity = capacityOf(target);

  await prisma.$transaction(async (tx) => {
    await lockMemberClass(tx, r.memberId, r.paidClassId);
    await lockSchedule(tx, target.id);
    const fresh = await tx.makeupRequest.findUnique({ where: { id }, select: { status: true } });
    if (fresh?.status !== "PENDING") throw new AppError("Yêu cầu không còn chờ xử lý.", 409, { code: "MAKEUP_NOT_PENDING" });

    const existing = await assertCanBook(
      tx,
      r.memberId,
      { id: target.id, startTime: target.startTime, endTime: target.endTime, class: { id: target.classId, classType: target.class.classType, capacity } },
      { excludeEnrollmentId: r.missedEnrollmentId, quotaExemptClassId: r.paidClassId, paidClassId: r.paidClassId }
    );
    if (cross && !target.isMakeupSlot) {
      const guests = await tx.enrollment.count({ where: { scheduleId: target.id, status: ACTIVE_ENROLLMENT, sourceClassId: { not: null } } });
      if (guests >= guestSeatCap(capacity)) {
        throw new AppError("Buổi này đã đủ chỗ dành cho học viên khóa khác.", 409, { code: "GUEST_SEATS_FULL" });
      }
    }
    const data = {
      status: "BOOKED" as const,
      bookedAt: new Date(),
      cancelledAt: null,
      sourceClassId: cross ? r.paidClassId : null,
      transferredFromId: null,
      makeupRequestId: r.id,
    };
    if (existing) await tx.enrollment.update({ where: { id: existing.id }, data });
    else await tx.enrollment.create({ data: { memberId: r.memberId, scheduleId: target.id, ...data } });
    await tx.makeupRequest.update({
      where: { id },
      data: { status: "SCHEDULED", targetScheduleId: target.id, resolvedAt: new Date(), resolvedById: actor.id },
    });
  });

  const view = makeupRequestView(await loadRequest(prisma, id));
  const when = fmtSession(target.startTime);
  if (forMember) {
    const coach = await prisma.coachProfile.findUnique({ where: { id: r.coachId }, select: { userId: true } });
    if (coach) {
      createNotification(
        coach.userId,
        "MAKEUP_SCHEDULED",
        `Học viên chọn buổi học bù: ${target.class.name}`,
        `${r.member.user.fullName} đã chọn học bù buổi ${when}.`,
        { metadata: { makeupRequestId: id, scheduleId: target.id } }
      ).catch(() => {});
    }
  } else {
    createNotification(
      r.member.userId,
      "MAKEUP_SCHEDULED",
      `Đã xếp buổi học bù: ${target.class.name}`,
      `HLV đã xếp bạn học bù buổi ${when} (thay cho buổi ${fmtSession(r.missedEnrollment.schedule.startTime)}).`,
      { metadata: { makeupRequestId: id, scheduleId: target.id } }
    ).catch(() => {});
  }
  return view;
}

/** Yêu cầu đang hoạt động của một chỗ (để màn chi tiết buổi hiện trạng thái). */
export async function activeRequestOfEnrollment(enrollmentId: string) {
  const r = await prisma.makeupRequest.findFirst({
    where: { missedEnrollmentId: enrollmentId, status: { in: ACTIVE } },
    include: REQUEST_INCLUDE,
    orderBy: { requestedAt: "desc" },
  });
  if (r) return makeupRequestView(r);
  // Yêu cầu gần nhất đã đóng (từ chối / hết hạn) — để hiện lý do + tiền hoàn.
  const last = await prisma.makeupRequest.findFirst({
    where: { missedEnrollmentId: enrollmentId, status: { in: ["REJECTED", "EXPIRED"] } },
    include: REQUEST_INCLUDE,
    orderBy: { requestedAt: "desc" },
  });
  return last ? makeupRequestView(last) : null;
}
