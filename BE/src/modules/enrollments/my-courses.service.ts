import { prisma } from "../../config/prisma.js";
import { sepayConfig } from "../../config/sepay.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { readClassSnapshot } from "../payments/purchase-snapshot.js";

/**
 * Trạng thái của một khóa học đối với MỘT hội viên (suy ra từ giao dịch + lịch + chỗ đặt):
 * - PENDING_PAYMENT: có giao dịch SePay đang chờ chuyển khoản (còn hạn).
 * - UPCOMING: đã thanh toán, khóa chưa khai giảng.
 * - ONGOING: đã thanh toán, khóa đang diễn ra (còn buổi chưa kết thúc).
 * - COMPLETED: đã thanh toán, MỌI buổi (chưa hủy) đã kết thúc.
 * - CANCELLED: đã hủy khóa (hoàn tiền hoặc hủy không hoàn).
 * - PAID_NOT_ENROLLED: đã thu tiền nhưng chưa có chỗ đặt nào (cần Quản lý xử lý).
 */
export type MemberCourseStatus =
  | "PENDING_PAYMENT"
  | "UPCOMING"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED"
  | "PAID_NOT_ENROLLED";

export const ACTIVE_COURSE_STATUSES: MemberCourseStatus[] = ["PENDING_PAYMENT", "UPCOMING", "ONGOING"];
const ALL_STATUSES: MemberCourseStatus[] = [...ACTIVE_COURSE_STATUSES, "COMPLETED", "CANCELLED", "PAID_NOT_ENROLLED"];

type SessionLite = { id: string; startTime: Date; endTime: Date; status: string };

/** Khóa đã kết thúc khi có ít nhất 1 buổi chưa hủy và mọi buổi chưa hủy đều đã COMPLETED hoặc qua giờ kết thúc. */
export function isCourseFinished(sessions: SessionLite[], now = new Date()): boolean {
  const live = sessions.filter((s) => s.status !== "CANCELLED");
  return live.length > 0 && live.every((s) => s.status === "COMPLETED" || s.endTime <= now);
}

/**
 * Hội viên "học xong khóa" ⇔ có giao dịch lớp SUCCESS (chưa hoàn toàn bộ), từng giữ chỗ (BOOKED/COMPLETED) trong khóa,
 * và khóa đã kết thúc (mọi buổi chưa hủy đã qua). Dùng chung cho màn lịch sử khóa học và luật đánh giá sao.
 */
export async function hasMemberCompletedClass(memberId: string, classId: string, now = new Date()): Promise<boolean> {
  const [paid, sessions, active] = await Promise.all([
    prisma.payment.findFirst({ where: { memberId, classId, status: "SUCCESS" }, select: { id: true } }),
    prisma.classSchedule.findMany({
      where: { classId },
      select: { id: true, startTime: true, endTime: true, status: true },
    }),
    prisma.enrollment.count({
      where: { memberId, status: { in: ["BOOKED", "COMPLETED"] }, schedule: { classId } },
    }),
  ]);
  return Boolean(paid) && active > 0 && isCourseFinished(sessions, now);
}

/** Danh sách lớp mà hội viên đã học xong (dùng khi đánh giá HLV không chỉ định lớp). */
export async function listMemberCompletedClassIds(memberId: string, coachId?: string, now = new Date()): Promise<string[]> {
  const payments = await prisma.payment.findMany({
    where: { memberId, status: "SUCCESS", classId: { not: null }, ...(coachId ? { class: { coachId } } : {}) },
    select: { classId: true },
    distinct: ["classId"],
  });
  const done: string[] = [];
  for (const p of payments) {
    if (p.classId && (await hasMemberCompletedClass(memberId, p.classId, now))) done.push(p.classId);
  }
  return done;
}

export interface MyCoursesQuery {
  status?: string;
  group?: "active" | "history";
  page?: string;
  limit?: string;
}

function parseStatuses(query: MyCoursesQuery): MemberCourseStatus[] | null {
  if (query.status) {
    const wanted = query.status
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean) as MemberCourseStatus[];
    const invalid = wanted.filter((s) => !ALL_STATUSES.includes(s));
    if (invalid.length > 0) {
      throw new AppError(`Invalid status: ${invalid.join(", ")}. Allowed: ${ALL_STATUSES.join(", ")}`, 400);
    }
    return wanted;
  }
  if (query.group === "active") return ACTIVE_COURSE_STATUSES;
  if (query.group === "history") return ["COMPLETED", "CANCELLED"];
  return null;
}

/**
 * GET /enrollments/my/courses — lịch sử khóa học của hội viên (đã mua / đang thanh toán / đang học / đã xong / đã hủy).
 * Mỗi khóa xuất hiện đúng 1 dòng, lấy từ giao dịch phù hợp nhất: SUCCESS > REFUNDED > PENDING còn hạn
 * (giao dịch FAILED/hết hạn không hiện). `group=active` dùng cho khối "đang thanh toán / đang diễn ra" ở đầu màn Khóa học.
 */
export async function getMyCourses(userId: string, query: MyCoursesQuery) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);
  const memberId = memberProfile.id;
  const now = new Date();
  const filter = parseStatuses(query);
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));

  const payments = await prisma.payment.findMany({
    where: { memberId, classId: { not: null }, status: { in: ["SUCCESS", "REFUNDED", "PENDING"] } },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      classId: true,
      status: true,
      method: true,
      gateway: true,
      amount: true,
      paidAt: true,
      createdAt: true,
      transactionCode: true,
      purchaseSnapshot: true,
      refunds: { select: { id: true, status: true, reason: true, amount: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });

  const ttlMs = sepayConfig().ttlMinutes * 60_000;
  const rank = (s: string) => (s === "SUCCESS" ? 3 : s === "REFUNDED" ? 2 : 1);
  const best = new Map<string, (typeof payments)[number]>();
  for (const p of payments) {
    if (!p.classId) continue;
    if (p.status === "PENDING" && p.createdAt.getTime() + ttlMs <= now.getTime()) continue; // hết hạn chờ chuyển khoản
    const cur = best.get(p.classId);
    if (!cur || rank(p.status) > rank(cur.status)) best.set(p.classId, p);
  }
  const classIds = [...best.keys()];
  if (classIds.length === 0) {
    return { courses: [], pagination: buildPaginationMeta(0, page, limit) };
  }

  const [classes, schedules, enrollments, feedbacks] = await Promise.all([
    prisma.class.findMany({
      where: { id: { in: classIds } },
      select: {
        id: true,
        name: true,
        fitness: true,
        goal: true,
        classType: true,
        areaType: true,
        price: true,
        coachId: true,
        coach: { select: { id: true, user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      },
    }),
    prisma.classSchedule.findMany({
      where: { classId: { in: classIds } },
      select: { id: true, classId: true, startTime: true, endTime: true, status: true, makeupForId: true },
      orderBy: { startTime: "asc" },
    }),
    // Kể cả chỗ đã ĐỔI sang khóa tương đương (`sourceClassId` = khóa đã mua).
    prisma.enrollment.findMany({
      where: { memberId, OR: [{ schedule: { classId: { in: classIds } } }, { sourceClassId: { in: classIds } }] },
      select: { scheduleId: true, status: true, sourceClassId: true, schedule: { select: { classId: true } } },
    }),
    prisma.coachFeedback.findMany({
      where: { memberId, classId: { in: classIds } },
      select: { id: true, classId: true, rating: true, comment: true, editCount: true },
    }),
  ]);
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const rows = classIds
    .map((classId) => {
      const cls = classMap.get(classId);
      if (!cls) return null;
      const payment = best.get(classId)!;
      const own = schedules.filter((s) => s.classId === classId);
      const live = own.filter((s) => s.status !== "CANCELLED");
      const mine = enrollments.filter((e) => (e.sourceClassId ?? e.schedule.classId) === classId);
      const activeMine = mine.filter((e) => e.status === "BOOKED" || e.status === "COMPLETED");
      const cancelledMine = mine.filter((e) => e.status === "CANCELLED");
      const completedCourseRefund = payment.refunds.find((r) => r.reason === "MEMBER_CANCEL_COURSE" && r.status === "COMPLETED");

      let courseStatus: MemberCourseStatus;
      if (payment.status === "PENDING") courseStatus = "PENDING_PAYMENT";
      else if (payment.status === "REFUNDED" || completedCourseRefund) courseStatus = "CANCELLED";
      else if (activeMine.length === 0) courseStatus = cancelledMine.length > 0 ? "CANCELLED" : "PAID_NOT_ENROLLED";
      else if (isCourseFinished(own, now)) courseStatus = "COMPLETED";
      else if (live.length > 0 && live[0].startTime > now) courseStatus = "UPCOMING";
      else courseStatus = "ONGOING";

      const next = live.find((s) => s.status === "SCHEDULED" && s.startTime > now) ?? null;
      const pendingRefund = payment.refunds.find((r) => r.status === "PENDING") ?? null;
      const feedback = feedbacks.find((f) => f.classId === classId) ?? null;
      const coachUser = cls.coach.user;
      // Thông tin khóa LÚC MUA (snapshot) — Coach/Manager sửa tên/giá sau này không đổi lịch sử của hội viên.
      const snap = readClassSnapshot(payment.purchaseSnapshot);
      return {
        classId,
        courseStatus,
        class: {
          id: cls.id,
          name: snap?.name ?? cls.name,
          fitness: snap?.fitness ?? cls.fitness,
          goal: snap?.goal !== undefined ? snap.goal : cls.goal,
          classType: snap?.classType ?? cls.classType,
          areaType: cls.areaType,
          price: snap?.price ?? Number(cls.price),
          /** Tên hiện tại (nếu khóa đã đổi tên sau khi mua). */
          currentName: cls.name,
          coach: {
            id: cls.coach.id,
            userId: coachUser.id,
            fullName: snap?.coach?.fullName ?? coachUser.fullName,
            avatarUrl: coachUser.avatarUrl,
          },
        },
        purchaseSnapshot: payment.purchaseSnapshot ?? null,
        payment: {
          id: payment.id,
          status: payment.status,
          method: payment.method,
          gateway: payment.gateway,
          amount: Number(payment.amount),
          paidAt: payment.paidAt,
          transactionCode: payment.transactionCode,
          pendingExpiresAt:
            payment.status === "PENDING" ? new Date(payment.createdAt.getTime() + ttlMs) : null,
        },
        startDate: live[0]?.startTime ?? null,
        endDate: live.length ? live.reduce((m, s) => (s.endTime > m ? s.endTime : m), live[0].endTime) : null,
        totalSessions: live.length,
        completedSessions: live.filter((s) => s.status === "COMPLETED" || s.endTime <= now).length,
        myBookedSessions: activeMine.length,
        nextSession: next ? { id: next.id, startTime: next.startTime, endTime: next.endTime } : null,
        pendingRefund: pendingRefund
          ? { id: pendingRefund.id, reason: pendingRefund.reason, amount: Number(pendingRefund.amount) }
          : null,
        // Đánh giá: học xong mới được đánh giá; 1 lần + sửa lại đúng 1 lần.
        canReview: courseStatus === "COMPLETED" && !feedback,
        canEditReview: courseStatus === "COMPLETED" && !!feedback && feedback.editCount < 1,
        myRating: feedback?.rating ?? null,
        myReview: feedback
          ? { id: feedback.id, rating: feedback.rating, comment: feedback.comment, editCount: feedback.editCount }
          : null,
        sortKey: courseStatus === "COMPLETED" || courseStatus === "CANCELLED" ? 1 : 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => !filter || filter.includes(r.courseStatus));

  // Khóa đang hoạt động lên trước; trong mỗi nhóm: mới nhất (ngày khai giảng) trước.
  rows.sort(
    (a, b) =>
      a.sortKey - b.sortKey ||
      (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0)
  );
  const total = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit).map(({ sortKey: _k, ...r }) => r);
  return { courses: paged, pagination: buildPaginationMeta(total, page, limit) };
}
