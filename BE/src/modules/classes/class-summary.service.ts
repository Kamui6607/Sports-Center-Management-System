import { prisma } from "../../config/prisma.js";
import { sepayConfig } from "../../config/sepay.js";
import { AppError } from "../../middlewares/errorHandler.js";

/**
 * BE-12: Tóm tắt lịch + học viên của khóa học, trả kèm `GET /classes` / `GET /classes/:id`
 * (trước đây client phải tải lịch từng khóa — N+1 request).
 */
export interface ClassSummary {
  /** Số buổi CHÍNH (không tính buổi dạy bù) — dùng tính tiền hoàn 1 buổi. */
  mainSessionCount: number;
  completedSessionCount: number;
  upcomingSessionCount: number;
  /** Buổi chính đầu tiên chưa hủy (ngày khai giảng). */
  firstSessionStart: Date | null;
  nextSessionStart: Date | null;
  lastSessionEnd: Date | null;
  /** Chỗ trống ít nhất trong các buổi sắp tới (null nếu không còn buổi). */
  minRemainingSlots: number | null;
  /** Số học viên (khác nhau) đang/đã giữ chỗ trong khóa. */
  studentCount: number;
}

const ACTIVE_ENROLLMENT = { status: { in: ["BOOKED", "COMPLETED"] as ("BOOKED" | "COMPLETED")[] } };

/** Tính tóm tắt cho nhiều khóa trong 2 truy vấn. */
export async function buildClassSummaries(
  classes: { id: string; capacity: number }[],
  now = new Date()
): Promise<Map<string, ClassSummary>> {
  const ids = classes.map((c) => c.id);
  const result = new Map<string, ClassSummary>();
  if (ids.length === 0) return result;

  const [schedules, enrollments] = await Promise.all([
    prisma.classSchedule.findMany({
      where: { classId: { in: ids } },
      select: {
        classId: true,
        startTime: true,
        endTime: true,
        status: true,
        makeupForId: true,
        _count: { select: { enrollments: { where: ACTIVE_ENROLLMENT } } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { ...ACTIVE_ENROLLMENT, schedule: { classId: { in: ids } } },
      select: { memberId: true, schedule: { select: { classId: true } } },
    }),
  ]);

  const students = new Map<string, Set<string>>();
  for (const e of enrollments) {
    const set = students.get(e.schedule.classId) ?? new Set<string>();
    set.add(e.memberId);
    students.set(e.schedule.classId, set);
  }

  for (const cls of classes) {
    const own = schedules.filter((s) => s.classId === cls.id);
    const live = own.filter((s) => s.status !== "CANCELLED");
    const main = live.filter((s) => s.makeupForId === null);
    const upcoming = live.filter((s) => s.status === "SCHEDULED" && s.startTime > now);
    const remaining = upcoming.map((s) => Math.max(0, cls.capacity - s._count.enrollments));
    result.set(cls.id, {
      mainSessionCount: own.filter((s) => s.makeupForId === null).length,
      completedSessionCount: live.filter((s) => s.status === "COMPLETED").length,
      upcomingSessionCount: upcoming.length,
      firstSessionStart: (main[0] ?? live[0])?.startTime ?? null,
      nextSessionStart: upcoming[0]?.startTime ?? null,
      lastSessionEnd: live.length ? live.reduce((m, s) => (s.endTime > m ? s.endTime : m), live[0].endTime) : null,
      minRemainingSlots: remaining.length ? Math.min(...remaining) : null,
      studentCount: students.get(cls.id)?.size ?? 0,
    });
  }
  return result;
}

/** Điểm đánh giá trung bình theo HLV (`CoachFeedback`). */
export async function buildCoachRatings(coachIds: string[]): Promise<Map<string, { ratingAverage: number; ratingCount: number }>> {
  const map = new Map<string, { ratingAverage: number; ratingCount: number }>();
  if (coachIds.length === 0) return map;
  const rows = await prisma.coachFeedback.groupBy({
    by: ["coachId"],
    where: { coachId: { in: [...new Set(coachIds)] } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  for (const r of rows) {
    map.set(r.coachId, {
      ratingAverage: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : 0,
      ratingCount: r._count.rating,
    });
  }
  return map;
}

/** Gắn `summary` + điểm HLV vào khóa học (giữ nguyên các field cũ — chỉ THÊM field). */
export async function withClassSummaries<
  T extends { id: string; capacity: number; coachId: string; coach?: Record<string, unknown> | null },
>(classes: T[], opts: { hideCoachEmail?: boolean } = {}) {
  const [summaries, ratings] = await Promise.all([
    buildClassSummaries(classes),
    buildCoachRatings(classes.map((c) => c.coachId)),
  ]);
  return classes.map((c) => {
    const rating = ratings.get(c.coachId) ?? { ratingAverage: 0, ratingCount: 0 };
    let coach: Record<string, unknown> | null | undefined = c.coach ? { ...c.coach, ...rating } : c.coach;
    if (coach && opts.hideCoachEmail && typeof coach.user === "object" && coach.user) {
      const { email: _email, ...user } = coach.user as Record<string, unknown>;
      coach = { ...coach, user };
    }
    return { ...c, coach, summary: summaries.get(c.id) };
  });
}

/**
 * BE-13: tình trạng mua khóa của Member.
 * - PURCHASED: có giao dịch SUCCESS (chưa bị hoàn toàn bộ).
 * - PENDING_PAYMENT: có giao dịch SePay PENDING còn hạn (client mở lại QR bằng `paymentId`).
 * - NONE: chưa mua (hoặc đã được hoàn tiền toàn bộ).
 */
export async function getMemberPurchase(memberId: string, classId: string, now = new Date()) {
  const [paid, pending] = await Promise.all([
    prisma.payment.findFirst({
      where: { memberId, classId, status: "SUCCESS" },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, amount: true, paidAt: true, createdAt: true },
    }),
    prisma.payment.findFirst({
      where: { memberId, classId, status: "PENDING", gateway: "SEPAY" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    }),
  ]);
  const ttlMs = sepayConfig().ttlMinutes * 60_000;
  const pendingValid = pending && pending.createdAt.getTime() + ttlMs > now.getTime() ? pending : null;

  let refunds: { status: string; amount: unknown; reason: string }[] = [];
  if (paid) {
    refunds = await prisma.refund.findMany({
      where: { paymentId: paid.id, status: { not: "REJECTED" } },
      select: { status: true, amount: true, reason: true },
    });
  }
  return {
    status: paid ? "PURCHASED" : pendingValid ? "PENDING_PAYMENT" : "NONE",
    paymentId: paid?.id ?? pendingValid?.id ?? null,
    amountPaid: paid ? Number(paid.amount) : null,
    paidAt: paid?.paidAt ?? paid?.createdAt ?? null,
    pendingPaymentExpiresAt: pendingValid ? new Date(pendingValid.createdAt.getTime() + ttlMs) : null,
    refundedAmount: refunds.reduce((s, r) => s + Number(r.amount), 0),
    hasPendingRefund: refunds.some((r) => r.status === "PENDING" && r.reason === "MEMBER_CANCEL_COURSE"),
  };
}

/**
 * L12 (BE-19b): học viên của MỘT khóa + chuyên cần + doanh thu thật — `GET /classes/:id/students`.
 * Quyền: COACH phụ trách khóa hoặc MANAGER. EXCUSED không tính vào số buổi đã qua (L5).
 */
export async function getClassStudents(classId: string, actor: { id: string; role: string }, now = new Date()) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, coachId: true, coach: { select: { userId: true } } },
  });
  if (!cls) throw new AppError("Class not found", 404);
  if (actor.role !== "MANAGER" && cls.coach.userId !== actor.id) {
    throw new AppError("Forbidden: You can only view your own classes", 403);
  }

  const [enrollments, attendance, payments, deposits] = await Promise.all([
    prisma.enrollment.findMany({
      where: { schedule: { classId }, status: { in: ["BOOKED", "COMPLETED"] } },
      select: {
        memberId: true,
        scheduleId: true,
        schedule: { select: { endTime: true, status: true } },
        member: {
          select: {
            id: true,
            userId: true,
            fitnessGoal: true,
            trainingLevel: true,
            trainingPreference: true,
            user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
          },
        },
      },
    }),
    prisma.attendance.findMany({ where: { schedule: { classId } }, select: { memberId: true, scheduleId: true, status: true } }),
    prisma.payment.findMany({
      where: { classId, status: { in: ["SUCCESS", "REFUNDED"] } },
      select: { amount: true, refunds: { where: { status: "COMPLETED" }, select: { amount: true } } },
    }),
    prisma.walletTransaction.aggregate({
      where: { classId, type: "DEPOSIT", status: "COMPLETED" },
      _sum: { amount: true },
    }),
  ]);

  const statusOf = new Map(attendance.map((a) => [`${a.memberId}|${a.scheduleId}`, a.status]));
  const students = new Map<string, any>();
  for (const e of enrollments) {
    const row = students.get(e.memberId) ?? { ...e.member, attendedCount: 0, excusedCount: 0, pastSessionCount: 0, bookedCount: 0 };
    row.bookedCount++;
    if (e.schedule.status !== "CANCELLED" && e.schedule.endTime <= now) {
      const st = statusOf.get(`${e.memberId}|${e.scheduleId}`);
      if (st === "EXCUSED") row.excusedCount++;
      else {
        row.pastSessionCount++;
        if (st === "PRESENT" || st === "LATE") row.attendedCount++;
      }
    }
    students.set(e.memberId, row);
  }

  const gross = payments.reduce((s, p) => s + Number(p.amount), 0);
  const refunded = payments.reduce((s, p) => s + p.refunds.reduce((r, x) => r + Number(x.amount), 0), 0);
  return {
    classId,
    students: [...students.values()].sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, "vi")),
    grossRevenue: gross,
    refundedAmount: refunded,
    coachRevenue: Number(deposits._sum.amount ?? 0),
  };
}
