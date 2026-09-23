import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { ATTENDANCE, addDays } from "../../config/attendance.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { lockMemberClass, lockMemberQuota, lockSchedules } from "../../utils/dbLocks.js";
import { createNotification } from "../notifications/notifications.service.js";
import { buildPenaltyReason, computeAttendanceBuckets } from "./attendance-analytics.service.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/** APPLIED đã quá blockedUntil -> EXPIRED (giữ lịch sử, không xoá). */
export async function expireStalePenalties(now = new Date()) {
  return prisma.attendancePenalty.updateMany({
    where: { status: "APPLIED", blockedUntil: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

/** Penalty còn hiệu lực của (member × class) — dùng để chặn đặt lại chỗ. */
export async function findActivePenalty(
  db: DbClient,
  memberId: string,
  classId: string,
  now = new Date()
) {
  return db.attendancePenalty.findFirst({
    where: { memberId, classId, status: "APPLIED", blockedUntil: { gt: now } },
  });
}

/**
 * PREVIEW: chỉ đọc, không mutate DB / không notification.
 * Trả về các (member × class) đủ điều kiện RELEASE + số chỗ sắp bị thu hồi.
 */
export async function previewPenalties() {
  const now = new Date();
  const buckets = await computeAttendanceBuckets(prisma, { now });
  const release = buckets.filter((b) => b.status === "RELEASE");
  if (release.length === 0) return { items: [], totalPreviewed: 0, thresholds: { ...ATTENDANCE } };

  const pairs = release.map((b) => ({ memberId: b.memberId, classId: b.classId }));
  const [activePenalties, futureCounts] = await Promise.all([
    prisma.attendancePenalty.findMany({
      // Read-only: coi penalty đã hết hạn chặn (blockedUntil <= now) như KHÔNG còn hiệu lực,
      // không mutate DB trong preview (lazy-expire chỉ chạy ở list/summary).
      where: {
        AND: [
          { OR: pairs },
          { OR: [{ status: "PENDING" }, { status: "APPLIED", blockedUntil: { gt: now } }] },
        ],
      },
      select: { memberId: true, classId: true, status: true, blockedUntil: true },
    }),
    prisma.enrollment.groupBy({
      by: ["memberId", "classId"],
      where: {
        status: "BOOKED",
        OR: pairs,
        schedule: { startTime: { gt: now }, status: "SCHEDULED" },
      },
      _count: { _all: true },
    }),
  ]);

  const blockedPair = new Set(activePenalties.map((p) => `${p.memberId}|${p.classId}`));
  const futureMap = new Map(futureCounts.map((f) => [`${f.memberId}|${f.classId}`, f._count._all]));

  const items = release
    .filter((b) => !blockedPair.has(`${b.memberId}|${b.classId}`))
    .map((b) => ({
      memberId: b.memberId,
      memberName: b.memberName,
      classId: b.classId,
      className: b.className,
      attendanceRate: b.attendanceRate,
      sampleSize: b.sampleSize,
      presentCount: b.presentCount,
      lateCount: b.lateCount,
      absentCount: b.absentCount,
      noShowCount: b.noShowCount,
      excusedCount: b.excusedCount,
      reason: buildPenaltyReason(b),
      futureBookedEnrollmentCount: futureMap.get(`${b.memberId}|${b.classId}`) ?? 0,
      proposedBlockedUntil: addDays(now, ATTENDANCE.PENALTY_BLOCK_DAYS),
    }));

  return { items, totalPreviewed: items.length, thresholds: { ...ATTENDANCE } };
}

/**
 * APPLY: một transaction atomic — tạo AttendancePenalty + thu hồi toàn bộ slot tương lai
 * của (member × class). Cùng commit hoặc cùng rollback.
 * Lock theo lock order chung: memberQuota -> (memberId, classId) giống bookClass/transferEnrollment
 * để penalty và booking không chen nhau (thu hồi chỗ làm giảm quota `used`).
 */
export async function applyPenalty(input: {
  memberId: string;
  classId: string;
  reason?: string;
  decidedByUserId: string;
}) {
  const decidedAt = new Date();

  // Lazy-expire trước khi kiểm tra trùng: penalty APPLIED đã hết blockedUntil không được
  // coi là "đang hiệu lực" để chặn việc apply lại (nhất quán với findActivePenalty).
  await expireStalePenalties(decidedAt);

  const penalty = await prisma.$transaction(async (tx) => {
    // Lock order: memberQuota -> memberClass (không lock schedule: chỉ thu hồi chỗ, không giành chỗ mới).
    await lockMemberQuota(tx, input.memberId);
    await lockMemberClass(tx, input.memberId, input.classId);

    const buckets = await computeAttendanceBuckets(tx, {
      memberId: input.memberId,
      classId: input.classId,
      now: decidedAt,
    });
    const bucket = buckets[0];
    if (!bucket) {
      throw new AppError("Không tìm thấy dữ liệu chuyên cần cho hội viên và lớp này", 404);
    }
    if (bucket.status !== "RELEASE") {
      throw new AppError(
        `Chỉ áp dụng hình phạt khi chuyên cần < ${ATTENDANCE.RELEASE_THRESHOLD}% và có tối thiểu ${ATTENDANCE.MIN_SAMPLE} buổi được tính ` +
          `(hiện tại: ${bucket.attendanceRate}% / ${bucket.sampleSize} buổi -> ${bucket.status})`,
        400
      );
    }

    const existing = await tx.attendancePenalty.findFirst({
      where: { memberId: input.memberId, classId: input.classId, status: { in: ["PENDING", "APPLIED"] } },
    });
    if (existing) {
      throw new AppError("Đã tồn tại hình phạt đang hiệu lực cho hội viên và lớp này", 409);
    }

    const created = await tx.attendancePenalty.create({
      data: {
        memberId: input.memberId,
        classId: input.classId,
        reason: input.reason?.trim() || buildPenaltyReason(bucket),
        attendanceRate: bucket.attendanceRate,
        sampleSize: bucket.sampleSize,
        blockedUntil: addDays(decidedAt, ATTENDANCE.PENALTY_BLOCK_DAYS),
        status: "APPLIED",
        decidedBy: input.decidedByUserId,
        decidedAt,
      },
    });

    // §11.2: chỉ cancel BOOKED ở các buổi CHƯA bắt đầu của đúng lớp này.
    const future = await tx.enrollment.findMany({
      where: {
        memberId: input.memberId,
        classId: input.classId,
        status: "BOOKED",
        schedule: { startTime: { gt: decidedAt }, status: "SCHEDULED" },
      },
      select: { id: true },
    });
    if (future.length > 0) {
      await tx.enrollment.updateMany({
        where: { id: { in: future.map((f) => f.id) } },
        data: { status: "CANCELLED", cancelledAt: decidedAt },
      });
    }

    return tx.attendancePenalty.update({
      where: { id: created.id },
      data: { releasedCount: future.length, releasedEnrollmentIds: future.map((f) => f.id) },
      include: {
        member: { include: { user: { select: { id: true, fullName: true } } } },
        class: { select: { id: true, name: true } },
      },
    });
  });

  // Notification (reuse helper) — fire-and-forget
  createNotification(
    penalty.member.user.id,
    "ATTENDANCE_PENALTY",
    `Hình phạt chuyên cần: ${penalty.class.name}`,
    `Bạn bị thu hồi ${penalty.releasedCount} chỗ đặt lớp "${penalty.class.name}" do chuyên cần ${penalty.attendanceRate}% (${penalty.sampleSize} buổi được tính). ` +
      `Lý do: ${penalty.reason} Bạn không thể đặt lại lớp này đến ${penalty.blockedUntil ? fmt(penalty.blockedUntil) : "khi có thông báo mới"}. ` +
      `Nếu có lý do chính đáng, hãy gửi khiếu nại trong ${ATTENDANCE.APPEAL_WINDOW_HOURS} giờ.`,
    {
      metadata: {
        penaltyId: penalty.id,
        memberId: penalty.memberId,
        classId: penalty.classId,
        attendanceRate: penalty.attendanceRate,
        blockedUntil: penalty.blockedUntil?.toISOString() ?? null,
      },
    }
  ).catch(() => {});

  return {
    id: penalty.id,
    memberId: penalty.memberId,
    memberName: penalty.member.user.fullName,
    classId: penalty.classId,
    className: penalty.class.name,
    reason: penalty.reason,
    attendanceRate: penalty.attendanceRate,
    sampleSize: penalty.sampleSize,
    status: penalty.status,
    decidedBy: penalty.decidedBy,
    decidedAt: penalty.decidedAt,
    blockedUntil: penalty.blockedUntil,
    releasedCount: penalty.releasedCount,
    releasedEnrollmentIds: (penalty.releasedEnrollmentIds as string[] | null) ?? [],
  };
}

/** Danh sách hình phạt (MANAGER). Lazy-expire các penalty đã hết hạn chặn. */
export async function listPenalties(query: any) {
  await expireStalePenalties();

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.memberId) where.memberId = query.memberId;
  if (query.classId) where.classId = query.classId;

  const [total, penalties] = await Promise.all([
    prisma.attendancePenalty.count({ where }),
    prisma.attendancePenalty.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        member: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        class: { select: { id: true, name: true } },
        decider: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  return { penalties, pagination: buildPaginationMeta(total, page, limit) };
}

/**
 * APPEAL (MEMBER, chỉ hình phạt của chính mình, trong cửa sổ APPEAL_WINDOW_HOURS).
 * Không tự động gỡ hình phạt — chỉ lưu audit (appealReason/appealedAt) + notify người quyết định.
 */
export async function appealPenalty(penaltyId: string, memberUserId: string, reason: string) {
  const penalty = await prisma.attendancePenalty.findUnique({
    where: { id: penaltyId },
    include: {
      member: { include: { user: { select: { id: true, fullName: true } } } },
      class: { select: { id: true, name: true } },
    },
  });
  if (!penalty) throw new AppError("Hình phạt không tồn tại", 404);
  if (penalty.member.userId !== memberUserId) {
    throw new AppError("Forbidden: Bạn chỉ có thể khiếu nại hình phạt của chính mình", 403);
  }
  if (penalty.status !== "APPLIED") {
    throw new AppError(
      `Chỉ khiếu nại được hình phạt đang hiệu lực (trạng thái hiện tại: ${penalty.status})`,
      400
    );
  }
  if (penalty.appealedAt) {
    throw new AppError("Bạn đã gửi khiếu nại cho hình phạt này", 409);
  }
  const decidedAt = penalty.decidedAt ?? penalty.createdAt;
  const deadline = new Date(decidedAt.getTime() + ATTENDANCE.APPEAL_WINDOW_HOURS * 3600000);
  if (new Date() > deadline) {
    throw new AppError(
      `Đã quá cửa sổ khiếu nại ${ATTENDANCE.APPEAL_WINDOW_HOURS} giờ (hạn: ${fmt(deadline)})`,
      400
    );
  }

  const updated = await prisma.attendancePenalty.update({
    where: { id: penaltyId },
    data: { appealReason: reason.trim(), appealedAt: new Date() },
  });

  if (penalty.decidedBy) {
    createNotification(
      penalty.decidedBy,
      "GENERAL",
      `Khiếu nại hình phạt chuyên cần: ${penalty.class.name}`,
      `${penalty.member.user.fullName} khiếu nại hình phạt chuyên cần của lớp "${penalty.class.name}" (chuyên cần ${penalty.attendanceRate}%). Lý do: ${reason.trim()}`,
      { metadata: { penaltyId, memberId: penalty.memberId, classId: penalty.classId } }
    ).catch(() => {});
  }

  return updated;
}

/**
 * REVOKE (MANAGER): gỡ hình phạt -> status REVOKED, không còn block.
 * restoreSlots = true: chỉ khôi phục chỗ đã thu hồi khi còn AN TOÀN
 * (buổi chưa bắt đầu, SCHEDULED, còn capacity, không trùng giờ) — ưu tiên không overbooking.
 * Không áp quota cho restore: đây là chỗ hội viên đã từng giữ, không phải Class mới.
 */
export async function revokePenalty(
  penaltyId: string,
  managerUserId: string,
  options: { reason?: string; restoreSlots?: boolean } = {}
) {
  const result = await prisma.$transaction(async (tx) => {
    const penalty = await tx.attendancePenalty.findUnique({
      where: { id: penaltyId },
      include: {
        member: { include: { user: { select: { id: true } } } },
        class: { select: { id: true, name: true } },
      },
    });
    if (!penalty) throw new AppError("Hình phạt không tồn tại", 404);
    if (penalty.status !== "APPLIED" && penalty.status !== "PENDING") {
      throw new AppError(`Không thể gỡ hình phạt ở trạng thái ${penalty.status}`, 409);
    }

    // Lock order chung: memberQuota -> (memberId, classId) -> schedules.
    // Restore slot giành lại chỗ nên phải khóa quota của member trước khi sửa Enrollment.
    await lockMemberQuota(tx, penalty.memberId);
    await lockMemberClass(tx, penalty.memberId, penalty.classId);

    const revoked = await tx.attendancePenalty.update({
      where: { id: penaltyId },
      data: {
        status: "REVOKED",
        revokedBy: managerUserId,
        revokedAt: new Date(),
        revokedReason: options.reason?.trim() || "Quản lý gỡ hình phạt",
      },
    });

    let restoredCount = 0;
    const skipped: { scheduleId: string; reason: string }[] = [];
    if (options.restoreSlots) {
      const ids = (penalty.releasedEnrollmentIds as string[] | null) ?? [];
      const enrollments = ids.length
        ? await tx.enrollment.findMany({
            where: { id: { in: ids } },
            include: {
              schedule: {
                select: {
                  id: true,
                  startTime: true,
                  endTime: true,
                  status: true,
                  class: { select: { capacity: true } },
                },
              },
            },
          })
        : [];
      // Lock toàn bộ buổi liên quan theo thứ tự cố định (luôn SAU lockMemberClass).
      await lockSchedules(tx, enrollments.map((e) => e.scheduleId));

      const now = new Date();
      for (const enrollment of enrollments) {
        if (enrollment.status !== "CANCELLED") {
          skipped.push({
            scheduleId: enrollment.scheduleId,
            reason: "chỗ đặt không còn ở trạng thái CANCELLED (đã được đặt lại trước đó)",
          });
          continue;
        }
        if (enrollment.schedule.status !== "SCHEDULED" || enrollment.schedule.startTime <= now) {
          skipped.push({
            scheduleId: enrollment.scheduleId,
            reason: "buổi đã bắt đầu hoặc không còn SCHEDULED",
          });
          continue;
        }
        const booked = await tx.enrollment.count({
          where: { scheduleId: enrollment.scheduleId, status: { in: ["BOOKED", "COMPLETED"] } },
        });
        if (booked >= enrollment.schedule.class.capacity) {
          skipped.push({
            scheduleId: enrollment.scheduleId,
            reason: "lớp đã đầy — không khôi phục để tránh overbooking",
          });
          continue;
        }
        const conflict = await tx.enrollment.findFirst({
          where: {
            memberId: penalty.memberId,
            id: { not: enrollment.id },
            status: { in: ["BOOKED", "COMPLETED"] },
            schedule: {
              status: "SCHEDULED",
              startTime: { lt: enrollment.schedule.endTime },
              endTime: { gt: enrollment.schedule.startTime },
            },
          },
          select: { id: true },
        });
        if (conflict) {
          skipped.push({
            scheduleId: enrollment.scheduleId,
            reason: "trùng giờ với buổi khác của hội viên",
          });
          continue;
        }
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: "BOOKED", bookedAt: now, cancelledAt: null },
        });
        restoredCount++;
      }
    }

    return {
      penalty: revoked,
      memberUserId: penalty.member.user.id,
      className: penalty.class.name,
      restoredCount,
      skipped,
    };
  });

  createNotification(
    result.memberUserId,
    "ATTENDANCE_PENALTY_REVOKED",
    `Đã gỡ hình phạt chuyên cần: ${result.className}`,
    `Hình phạt chuyên cần cho lớp "${result.className}" đã được quản lý gỡ. Bạn có thể đặt lại lớp này.` +
      (result.restoredCount > 0 ? ` Hệ thống đã khôi phục ${result.restoredCount} chỗ đặt sắp tới.` : "") +
      (result.skipped.length > 0
        ? ` ${result.skipped.length} chỗ không thể khôi phục (buổi đã bắt đầu hoặc lớp đã đầy).`
        : ""),
    { metadata: { penaltyId: result.penalty.id, classId: result.penalty.classId } }
  ).catch(() => {});

  return {
    id: result.penalty.id,
    memberId: result.penalty.memberId,
    classId: result.penalty.classId,
    className: result.className,
    status: result.penalty.status,
    revokedAt: result.penalty.revokedAt,
    revokedReason: result.penalty.revokedReason,
    restoredCount: result.restoredCount,
    skipped: result.skipped,
  };
}

