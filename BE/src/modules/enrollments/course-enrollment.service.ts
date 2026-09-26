import { Prisma, EnrollmentStatus, MemberTier } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockMemberClass, lockMemberQuota, lockSchedules } from "../../utils/dbLocks.js";
import { createNotification } from "../notifications/notifications.service.js";
import { findActivePenalty } from "../attendance/attendance-penalties.service.js";
import {
  CONCURRENT_CLASS_LIMIT_CODE,
  findActiveSubscription,
  getMemberConcurrentClassQuota,
} from "./enrollment-quota.service.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Error code trả về khi đăng ký trọn khóa thất bại (HTTP 409) kèm `errors.details[]`. */
export const COURSE_ENROLLMENT_FAILED_CODE = "COURSE_ENROLLMENT_FAILED";

/** Buổi học tối thiểu cho việc đánh giá điều kiện đăng ký trọn khóa (đã sắp theo startTime). */
export interface CourseSessionRef {
  id: string;
  startTime: Date;
  endTime: Date;
  roomId: string;
  room: { id: string; name: string };
}

/**
 * Một lý do khiến KHÔNG thể đăng ký trọn khóa.
 * `sessionId` chỉ có khi lý do thuộc về một buổi cụ thể (hết chỗ / trùng giờ);
 * các lý do ở cấp khóa (gói tập, tier, quota, hình phạt) không có `sessionId`.
 */
export interface CourseEnrollmentBlocker {
  code: string;
  message: string;
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  roomId?: string;
  roomName?: string;
  details?: Record<string, unknown>;
}

export interface CourseEligibilitySession {
  scheduleId: string;
  startTime: Date;
  endTime: Date;
  roomId: string;
  roomName: string;
  bookedCount: number;
  remainingSlots: number;
  isFull: boolean;
  /** Enrollment hiện tại của member cho buổi này (kể cả CANCELLED) — dùng để SKIP / BR-07 kích hoạt lại. */
  myEnrollment: { id: string; status: EnrollmentStatus } | null;
  /** Buổi khác (Class khác) của cùng member bị trùng giờ với buổi này. */
  conflictWith?: {
    classId: string;
    className: string;
    scheduleId: string;
    startTime: Date;
    endTime: Date;
  };
}

export interface CourseEligibility {
  sessions: CourseEligibilitySession[];
  blockers: CourseEnrollmentBlocker[];
  subscription: { tier: MemberTier; endDate: Date; planName: string | null } | null;
  quota: {
    tier: MemberTier | null;
    limit: number;
    used: number;
    remaining: number;
    alreadyHoldingClass: boolean;
  } | null;
  penalty: { id: string; blockedUntil: Date | null; attendanceRate: number; sampleSize: number } | null;
}

const vnDate = (d: Date) => d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const vnDateTime = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/**
 * Đánh giá điều kiện đăng ký TRỌN KHÓA (tất cả buổi sắp diễn ra của một Class).
 *
 * Đây là NGUỒN DUY NHẤT của bộ luật "all-or-nothing" dùng chung cho:
 * - `GET /classes/:id/course-plan` (preview cho FE, chỉ đọc);
 * - `POST /enrollments/bulk` (ghi thật, lỗi thì rollback toàn bộ).
 *
 * Luật áp dụng (giống `assertCanBook` của đặt từng buổi, siết thêm mốc buổi CUỐI):
 * gói ACTIVE và `endDate >= startTime buổi cuối`, PREMIUM class cần tier PREMIUM,
 * không bị hình phạt chuyên cần ở Class này, quota lớp học song song (DISTINCT Class),
 * còn sức chứa ở MỌI buổi, không trùng giờ với buổi khác của member.
 * Buổi member đã BOOKED/COMPLETED được coi là hợp lệ (idempotent), không sinh blocker.
 *
 * Hàm KHÔNG mutate dữ liệu và KHÔNG tự lock — caller phải giữ advisory lock
 * (memberQuota -> memberClass -> schedules) trước khi gọi trong transaction ghi.
 */
export async function evaluateCourseEligibility(
  db: DbClient,
  memberProfileId: string,
  cls: { id: string; classType: string; capacity: number },
  sessions: CourseSessionRef[],
  options: { now?: Date } = {}
): Promise<CourseEligibility> {
  const now = options.now ?? new Date();

  if (sessions.length === 0) {
    return {
      sessions: [],
      blockers: [
        {
          code: "NO_UPCOMING_SESSION",
          message: "Lớp học chưa có buổi nào sắp diễn ra để đăng ký.",
        },
      ],
      subscription: null,
      quota: null,
      penalty: null,
    };
  }

  const lastSession = sessions[sessions.length - 1];
  const sessionIds = sessions.map((s) => s.id);

  const [activeSub, quotaUsage, penalty, bookedCounts, myEnrollments, conflicts] = await Promise.all([
    findActiveSubscription(db, memberProfileId, now),
    getMemberConcurrentClassQuota(db, memberProfileId, { now }),
    findActivePenalty(db, memberProfileId, cls.id, now),
    db.enrollment.groupBy({
      by: ["scheduleId"],
      where: { scheduleId: { in: sessionIds }, status: { in: ["BOOKED", "COMPLETED"] } },
      _count: { _all: true },
    }),
    db.enrollment.findMany({
      where: { memberId: memberProfileId, scheduleId: { in: sessionIds } },
      select: { id: true, scheduleId: true, status: true },
    }),
    db.enrollment.findMany({
      where: {
        memberId: memberProfileId,
        // Cùng Class không tính là trùng giờ: đó chính là các buổi đang đăng ký.
        classId: { not: cls.id },
        status: { in: ["BOOKED", "COMPLETED"] },
        schedule: {
          status: "SCHEDULED",
          startTime: { lt: lastSession.endTime },
          endTime: { gt: sessions[0].startTime },
        },
      },
      select: {
        classId: true,
        scheduleId: true,
        schedule: {
          select: {
            startTime: true,
            endTime: true,
            class: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const blockers: CourseEnrollmentBlocker[] = [];

  // ── Cấp KHÓA: gói tập / tier / hình phạt / quota ──────────────────────────
  if (!activeSub) {
    blockers.push({
      code: "NO_ACTIVE_SUBSCRIPTION",
      message:
        "Bạn không có gói tập đang hoạt động. Vui lòng mua gói để đăng ký trọn khóa học.",
    });
  } else if (activeSub.endDate < lastSession.startTime) {
    const coveredSessions = sessions.filter((s) => s.startTime <= activeSub.endDate).length;
    blockers.push({
      code: "SUBSCRIPTION_ENDS_BEFORE_COURSE_END",
      message:
        `Gói tập của bạn hết hạn ngày ${vnDate(activeSub.endDate)}, trước buổi cuối của khóa ngày ` +
        `${vnDate(lastSession.startTime)}. Vui lòng gia hạn gói để đăng ký trọn khóa.`,
      details: {
        planEndDate: activeSub.endDate,
        lastSessionStartTime: lastSession.startTime,
        coveredSessions,
        totalSessions: sessions.length,
      },
    });
  } else if (cls.classType === "PREMIUM" && activeSub.tier !== "PREMIUM") {
    blockers.push({
      code: "PREMIUM_REQUIRED",
      message: "Khóa học Premium yêu cầu gói tập hạng PREMIUM.",
    });
  }

  if (penalty) {
    blockers.push({
      code: "ATTENDANCE_PENALTY_ACTIVE",
      message:
        `Bạn đang bị tạm khoá đặt chỗ lớp này đến ` +
        `${penalty.blockedUntil ? vnDateTime(penalty.blockedUntil) : "khi có thông báo mới"} ` +
        `do chuyên cần ${penalty.attendanceRate}% (${penalty.sampleSize} buổi được tính). ` +
        `Vui lòng liên hệ quản lý nếu cần khiếu nại.`,
      details: {
        penaltyId: penalty.id,
        blockedUntil: penalty.blockedUntil,
        attendanceRate: penalty.attendanceRate,
        sampleSize: penalty.sampleSize,
      },
    });
  }

  const alreadyHoldingClass = quotaUsage.classes.some((c) => c.classId === cls.id);
  if (
    quotaUsage.hasActiveSubscription &&
    !alreadyHoldingClass &&
    quotaUsage.used >= quotaUsage.limit
  ) {
    blockers.push({
      code: CONCURRENT_CLASS_LIMIT_CODE,
      message:
        `Bạn đã đạt giới hạn ${quotaUsage.limit} lớp học song song của gói ` +
        `${quotaUsage.tier ?? "hiện tại"}. Vui lòng hủy hoặc chuyển một lớp đang đặt trước khi đăng ký khóa mới.`,
      details: {
        tier: quotaUsage.tier,
        limit: quotaUsage.limit,
        used: quotaUsage.used,
        remaining: quotaUsage.remaining,
      },
    });
  }

  // ── Cấp BUỔI: sức chứa + trùng giờ ───────────────────────────────────────
  const bookedBySchedule = new Map(bookedCounts.map((row) => [row.scheduleId, row._count._all]));
  const myBySchedule = new Map(myEnrollments.map((row) => [row.scheduleId, row]));

  const eligibilitySessions: CourseEligibilitySession[] = sessions.map((session) => {
    const bookedCount = bookedBySchedule.get(session.id) ?? 0;
    const remainingSlots = Math.max(0, cls.capacity - bookedCount);
    const mine = myBySchedule.get(session.id) ?? null;
    const conflict = conflicts.find(
      (row) => row.schedule.startTime < session.endTime && row.schedule.endTime > session.startTime
    );

    return {
      scheduleId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      roomId: session.roomId,
      roomName: session.room.name,
      bookedCount,
      remainingSlots,
      isFull: remainingSlots === 0,
      myEnrollment: mine ? { id: mine.id, status: mine.status } : null,
      ...(conflict
        ? {
            conflictWith: {
              classId: conflict.classId,
              className: conflict.schedule.class.name,
              scheduleId: conflict.scheduleId,
              startTime: conflict.schedule.startTime,
              endTime: conflict.schedule.endTime,
            },
          }
        : {}),
    };
  });

  for (const state of eligibilitySessions) {
    // Buổi member đã đặt trước đó (BOOKED/COMPLETED) => idempotent, không chặn cả khóa.
    const alreadyMine =
      state.myEnrollment?.status === "BOOKED" || state.myEnrollment?.status === "COMPLETED";
    if (alreadyMine) continue;

    if (state.isFull) {
      blockers.push({
        code: "SESSION_FULL",
        message: `Buổi ${vnDateTime(state.startTime)} (${state.roomName}) đã hết chỗ.`,
        sessionId: state.scheduleId,
        startTime: state.startTime,
        endTime: state.endTime,
        roomId: state.roomId,
        roomName: state.roomName,
        details: { bookedCount: state.bookedCount, capacity: cls.capacity },
      });
      continue;
    }

    if (state.conflictWith) {
      blockers.push({
        code: "TIME_CONFLICT",
        message:
          `Buổi ${vnDateTime(state.startTime)} trùng giờ với lớp "${state.conflictWith.className}" ` +
          `(${vnDateTime(state.conflictWith.startTime)}).`,
        sessionId: state.scheduleId,
        startTime: state.startTime,
        endTime: state.endTime,
        roomId: state.roomId,
        roomName: state.roomName,
        details: { ...state.conflictWith },
      });
    }
  }

  return {
    sessions: eligibilitySessions,
    blockers,
    subscription: activeSub
      ? { tier: activeSub.tier, endDate: activeSub.endDate, planName: activeSub.plan?.name ?? null }
      : null,
    quota: {
      tier: quotaUsage.tier,
      limit: quotaUsage.limit,
      used: quotaUsage.used,
      remaining: quotaUsage.remaining,
      alreadyHoldingClass,
    },
    penalty: penalty
      ? {
          id: penalty.id,
          blockedUntil: penalty.blockedUntil,
          attendanceRate: penalty.attendanceRate,
          sampleSize: penalty.sampleSize,
        }
      : null,
  };
}

export interface WholeCourseSessionResult {
  scheduleId: string;
  startTime: Date;
  endTime: Date;
  roomId: string;
  roomName: string;
  enrollmentId: string;
  /** BOOKED = tạo mới, REACTIVATED = kích hoạt lại chỗ đã hủy (BR-07), ALREADY_BOOKED = đã đặt từ trước. */
  status: "BOOKED" | "REACTIVATED" | "ALREADY_BOOKED";
}

/**
 * Đăng ký TRỌN KHÓA: tạo (hoặc kích hoạt lại) Enrollment cho TẤT CẢ buổi `SCHEDULED` sắp diễn ra
 * của một Class — ALL-OR-NOTHING.
 *
 * - Kiểm tra mọi điều kiện của cả tập buổi trước khi ghi; chỉ cần 1 điều kiện fail =>
 *   throw 409 `COURSE_ENROLLMENT_FAILED` kèm `errors.details[]` (sessionId + code + message)
 *   và transaction rollback: KHÔNG buổi nào được tạo.
 * - Buổi member đã BOOKED/COMPLETED: bỏ qua (idempotent, gọi lại không lỗi, không tạo trùng).
 * - Buổi member từng hủy: kích hoạt lại đúng Enrollment cũ (BR-07) thay vì tạo mới.
 * - Serialize bằng advisory lock đúng thứ tự memberQuota -> memberClass -> schedules
 *   (`lockSchedules` sắp xếp cố định) để không overbooking khi nhiều member cùng đăng ký.
 */
export async function enrollWholeCourse(classId: string, memberProfileId: string) {
  // 0. Member phải tồn tại, đang hoạt động và đúng role MEMBER (giống bookClass).
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { id: memberProfileId },
    include: { user: { select: { id: true, isActive: true, role: true } } },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot enroll: user is not an active MEMBER", 400);
  }

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, classType: true, capacity: true, isActive: true },
  });
  if (!cls) throw new AppError("Class not found", 404);
  if (!cls.isActive) throw new AppError("Class is inactive", 400);

  const sessions = await prisma.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: new Date() } },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      roomId: true,
      room: { select: { id: true, name: true } },
    },
  });
  if (sessions.length === 0) {
    throw new AppError("This class has no upcoming sessions to enroll", 400);
  }

  const outcome = await prisma.$transaction(
    async (tx) => {
      // Lock TRƯỚC khi đọc để các request đồng thời của cùng member phải xếp hàng.
      await lockMemberQuota(tx, memberProfileId);
      await lockMemberClass(tx, memberProfileId, classId);
      await lockSchedules(tx, sessions.map((s) => s.id));

      // Đọc lại sức chứa / điều kiện SAU lock (chống overbooking & vượt quota khi concurrent).
      const eligibility = await evaluateCourseEligibility(tx, memberProfileId, cls, sessions);

      if (eligibility.blockers.length > 0) {
        throw new AppError(
          `Không thể đăng ký trọn khóa "${cls.name}": ${eligibility.blockers.length} điều kiện chưa đạt.`,
          409,
          {
            code: COURSE_ENROLLMENT_FAILED_CODE,
            classId,
            className: cls.name,
            totalSessions: sessions.length,
            failedCount: eligibility.blockers.length,
            details: eligibility.blockers,
          }
        );
      }

      const now = new Date();
      const results: WholeCourseSessionResult[] = [];
      let enrolledNow = 0;

      for (const state of eligibility.sessions) {
        if (
          state.myEnrollment &&
          (state.myEnrollment.status === "BOOKED" || state.myEnrollment.status === "COMPLETED")
        ) {
          results.push({
            scheduleId: state.scheduleId,
            startTime: state.startTime,
            endTime: state.endTime,
            roomId: state.roomId,
            roomName: state.roomName,
            enrollmentId: state.myEnrollment.id,
            status: "ALREADY_BOOKED",
          });
          continue;
        }

        if (state.myEnrollment) {
          // BR-07: unique (memberId, scheduleId) — kích hoạt lại chỗ đã hủy thay vì tạo mới.
          const reactivated = await tx.enrollment.update({
            where: { id: state.myEnrollment.id },
            data: { status: "BOOKED", bookedAt: now, cancelledAt: null },
            select: { id: true },
          });
          results.push({
            scheduleId: state.scheduleId,
            startTime: state.startTime,
            endTime: state.endTime,
            roomId: state.roomId,
            roomName: state.roomName,
            enrollmentId: reactivated.id,
            status: "REACTIVATED",
          });
        } else {
          const created = await tx.enrollment.create({
            data: {
              memberId: memberProfileId,
              classId,
              scheduleId: state.scheduleId,
              status: "BOOKED",
            },
            select: { id: true },
          });
          results.push({
            scheduleId: state.scheduleId,
            startTime: state.startTime,
            endTime: state.endTime,
            roomId: state.roomId,
            roomName: state.roomName,
            enrollmentId: created.id,
            status: "BOOKED",
          });
        }
        enrolledNow += 1;
      }

      return { results, enrolledNow };

    },
    { timeout: 30_000 }
  );

  const firstSession = sessions[0];
  const lastSession = sessions[sessions.length - 1];
  const alreadyBooked = outcome.results.length - outcome.enrolledNow;

  // Một notification duy nhất cho cả khóa (không spam N notification như đặt từng buổi).
  if (outcome.enrolledNow > 0) {
    createNotification(
      memberProfile.user.id,
      "ENROLLMENT_CONFIRMED",
      `Đăng ký trọn khóa thành công: ${cls.name}`,
      `Bạn đã đăng ký ${outcome.enrolledNow} buổi của khóa "${cls.name}", từ ` +
        `${vnDateTime(firstSession.startTime)} đến ${vnDateTime(lastSession.startTime)}. ` +
        `Chúc bạn tập luyện vui vẻ!`,
      {
        metadata: {
          classId,
          totalSessions: sessions.length,
          scheduleIds: outcome.results.map((r) => r.scheduleId),
          enrollmentIds: outcome.results.map((r) => r.enrollmentId),
        },
      }
    ).catch(() => {});
  }

  // Quota sau khi ghi để FE cập nhật ngay mà không cần gọi thêm API.
  const quota = await getMemberConcurrentClassQuota(prisma, memberProfileId);

  return {
    classId,
    className: cls.name,
    summary: {
      totalSessions: sessions.length,
      enrolledNow: outcome.enrolledNow,
      alreadyBooked,
      totalRegistered: outcome.results.length,
      firstSessionStart: firstSession.startTime,
      lastSessionEnd: lastSession.endTime,
    },
    quota,
    sessions: outcome.results,
  };
}




