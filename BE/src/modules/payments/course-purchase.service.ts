import type { Payment, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockMemberClass, lockSchedules } from "../../utils/dbLocks.js";
import { evaluateCourseEligibility, COURSE_ENROLLMENT_FAILED_CODE } from "../enrollments/course-enrollment.service.js";
import { pendingCourseHolds, quoteMoment } from "../classes/class-summary.service.js";
import { quoteCourse, saleStateOf, SALE_STATE_LABEL, type CourseQuote } from "../classes/course-sale.js";
import { readClassSnapshot } from "./purchase-snapshot.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Lý do hoàn ở cấp KHÓA — đã có (đang chờ / đã hoàn) ⇒ giao dịch không còn quyền học. */
export const COURSE_LEVEL_REFUND_REASONS = ["MEMBER_CANCEL_COURSE_LATE", "COURSE_NOT_FULFILLED"] as const;

/**
 * Giao dịch mua khóa CÒN HIỆU LỰC của hội viên: SUCCESS (mới nhất) và hội viên còn giữ ≥ 1 chỗ ở buổi sắp tới.
 * Đã hủy khóa (mọi chỗ sắp tới bị hủy) ⇒ không còn hiệu lực ⇒ được mua lại.
 */
export async function findActiveCoursePurchase(db: DbClient, memberId: string, classId: string, now = new Date()) {
  const paid = await db.payment.findFirst({
    where: { memberId, classId, status: "SUCCESS" },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
  if (!paid) return null;
  const holding = await db.enrollment.count({
    where: { memberId, status: "BOOKED", schedule: { classId, status: "SCHEDULED", startTime: { gt: now } } },
  });
  return holding > 0 ? paid : null;
}

/**
 * Giao dịch SUCCESS dùng được để đặt chỗ lẻ / ghi danh lại: chưa bị hoàn ở cấp khóa
 * (hoàn ngoại lệ, hoàn do không ghi danh đủ). Trả null nếu không có.
 */
export async function findUsableCoursePayment(db: DbClient, memberId: string, classId: string) {
  const paid = await db.payment.findFirst({
    where: { memberId, classId, status: "SUCCESS" },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    include: {
      refunds: {
        where: { reason: { in: [...COURSE_LEVEL_REFUND_REASONS] }, status: { in: ["PENDING", "COMPLETED"] } },
        select: { id: true },
      },
    },
  });
  return paid && paid.refunds.length === 0 ? paid : null;
}

const SALE_ERROR: Record<string, { status: number; code: string; message: string }> = {
  FULL: { status: 409, code: "COURSE_FULL", message: "Khóa học đã hết chỗ ở các buổi còn lại." },
  SALE_CLOSED: {
    status: 409,
    code: "COURSE_SALE_CLOSED",
    message: "Khóa học đã diễn ra quá nửa chặng hoặc còn quá ít buổi nên ngừng nhận học viên mới.",
  },
  ENDED: { status: 409, code: "COURSE_ENDED", message: "Khóa học đã kết thúc, không còn buổi nào sắp diễn ra." },
  NOT_OPEN: { status: 400, code: "COURSE_NOT_OPEN", message: "Khóa học chưa được duyệt mở bán." },
};

export interface PreparedCourseCheckout {
  cls: { id: string; name: string; price: Prisma.Decimal; capacity: number; classType: string };
  quote: CourseQuote;
}

/**
 * Kiểm tra TOÀN BỘ điều kiện mua khóa ở BE (Doc/BUSINESS_HARDENING_PLAN.md §3.1) và trả báo giá.
 * Gọi TRONG transaction tạo giao dịch: lock (member × class) rồi lock các buổi được bán — hai người cùng mua chỗ cuối
 * phải xếp hàng, người sau thấy giao dịch PENDING của người trước như một chỗ đã giữ (§3.2).
 */
export async function prepareCourseCheckout(
  tx: Prisma.TransactionClient,
  memberId: string,
  classId: string,
  now = new Date(),
  /** Mốc tính buổi được bán: mặc định lúc mã QR hết hạn; thu tiền tại quầy ⇒ `now`. */
  at: Date = quoteMoment(now)
): Promise<PreparedCourseCheckout> {
  await lockMemberClass(tx, memberId, classId);
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, price: true, capacity: true, classType: true, status: true, isActive: true },
  });
  if (!cls || (!cls.isActive && cls.status !== "APPROVED")) throw new AppError("Class not found or inactive", 404);
  if (Number(cls.price) <= 0) throw new AppError("Khóa học miễn phí, không cần thanh toán.", 400);

  const sessions = await tx.classSchedule.findMany({
    where: { classId },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      makeupForId: true,
      roomId: true,
      room: { select: { id: true, name: true } },
    },
  });
  const quote = quoteCourse(Number(cls.price), sessions, at);
  await lockSchedules(tx, quote.scheduleIds);

  if (await findActiveCoursePurchase(tx, memberId, classId, now)) {
    throw new AppError("Bạn đã mua khóa học này rồi.", 409, { code: "COURSE_ALREADY_PURCHASED", classId });
  }

  // Sức chứa còn lại = sức chứa − chỗ đang giữ cho giao dịch chờ chuyển khoản của người khác.
  const held = (await pendingCourseHolds(tx, [classId], now, memberId)).get(classId) ?? 0;
  const bookedRows = await tx.enrollment.groupBy({
    by: ["scheduleId"],
    where: { scheduleId: { in: quote.scheduleIds }, status: { in: ["BOOKED", "COMPLETED"] } },
    _count: { _all: true },
  });
  const remaining = quote.scheduleIds.map(
    (id) => cls.capacity - held - (bookedRows.find((r) => r.scheduleId === id)?._count._all ?? 0)
  );
  const state = saleStateOf({
    status: cls.status,
    isActive: cls.isActive,
    sessions,
    minRemainingSlots: remaining.length ? Math.min(...remaining) : null,
    now,
  });
  if (state !== "ON_SALE" || quote.sessionsPurchased === 0) {
    const err = SALE_ERROR[state] ?? SALE_ERROR.ENDED;
    throw new AppError(err.message, err.status, { code: err.code, saleState: state, saleStateLabel: SALE_STATE_LABEL[state] });
  }

  const bought = sessions.filter((s) => quote.scheduleIds.includes(s.id));
  const eligibility = await evaluateCourseEligibility(
    tx,
    memberId,
    { id: cls.id, classType: cls.classType, capacity: cls.capacity - held },
    bought,
    { now }
  );
  if (eligibility.blockers.length > 0) {
    throw new AppError(
      `Không thể mua khóa "${cls.name}": ${eligibility.blockers.map((b) => b.message).join(" ")}`,
      409,
      { code: COURSE_ENROLLMENT_FAILED_CODE, classId, details: eligibility.blockers }
    );
  }
  return { cls, quote };
}

export interface CourseFulfillment {
  /** Số buổi đã tính tiền (theo snapshot). */
  expected: number;
  /** Số buổi hội viên đang giữ chỗ sau khi ghi danh. */
  enrolled: number;
  shortfall: number;
}

/**
 * Ghi danh sau khi tiền về (thay `autoEnrollAfterPayment` cũ): lock + kiểm sức chứa + KÍCH HOẠT LẠI chỗ đã hủy.
 * Không chặn trùng giờ (hội viên đã được kiểm khi tạo QR); khóa không còn mở / buổi hết chỗ ⇒ bỏ qua buổi đó
 * và trả `shortfall` để caller tạo yêu cầu hoàn phần thiếu (§3.3).
 */
export async function enrollPaidCourse(
  tx: Prisma.TransactionClient,
  payment: Pick<Payment, "classId" | "memberId" | "purchaseSnapshot">,
  now = new Date()
): Promise<CourseFulfillment> {
  const classId = payment.classId!;
  const memberId = payment.memberId!;
  const snap = readClassSnapshot(payment.purchaseSnapshot);
  await lockMemberClass(tx, memberId, classId);
  const cls = await tx.class.findUnique({ where: { id: classId }, select: { capacity: true, status: true, isActive: true } });
  const sessions = await tx.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: now } },
    orderBy: { startTime: "asc" },
    select: { id: true },
  });
  const expected = snap?.pricing?.sessionsPurchased ?? sessions.length;
  if (!cls || cls.status !== "APPROVED" || sessions.length === 0) {
    return { expected, enrolled: 0, shortfall: expected };
  }
  await lockSchedules(tx, sessions.map((s) => s.id));

  let enrolled = 0;
  for (const s of sessions) {
    const mine = await tx.enrollment.findUnique({ where: { memberId_scheduleId: { memberId, scheduleId: s.id } } });
    if (mine && (mine.status === "BOOKED" || mine.status === "COMPLETED")) {
      enrolled++;
      continue;
    }
    const booked = await tx.enrollment.count({ where: { scheduleId: s.id, status: { in: ["BOOKED", "COMPLETED"] } } });
    if (booked >= cls.capacity) continue;
    if (mine) {
      await tx.enrollment.update({ where: { id: mine.id }, data: { status: "BOOKED", bookedAt: now, cancelledAt: null } });
    } else {
      await tx.enrollment.create({ data: { memberId, scheduleId: s.id, status: "BOOKED" } });
    }
    enrolled++;
  }
  const counted = Math.min(enrolled, expected);
  return { expected, enrolled, shortfall: Math.max(0, expected - counted) };
}
