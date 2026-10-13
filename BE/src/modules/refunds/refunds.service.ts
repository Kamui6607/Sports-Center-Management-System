import { Prisma, type Payment } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { lockMemberClass, lockPaymentWebhook } from "../../utils/dbLocks.js";
import { createNotification } from "../notifications/notifications.service.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import type { RefundQueryInput } from "./refunds.schema.js";
import { onOrderRefundApprovedTx, onOrderRefundRejectedTx } from "../shop/orders.service.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Hủy khóa trước buổi khai giảng ≥ ngần này giờ (3 ngày) ⇒ hoàn 100%; muộn hơn vẫn hủy được nhưng KHÔNG hoàn tiền. */
export const COURSE_FULL_REFUND_MIN_HOURS = 72;
/** Hủy MỘT buổi lẻ trước giờ học ≥ ngần này giờ ⇒ hoàn `SESSION_REFUND_PERCENT`% tiền của buổi đó. */
export const SESSION_REFUND_MIN_HOURS = 24;
export const SESSION_REFUND_PERCENT = 80;

/** Tỷ lệ hoàn khi hủy khóa: 100 nếu còn ≥ 72h trước buổi khai giảng (hoặc khóa chưa có lịch), ngược lại 0. */
export function courseRefundPercent(firstSessionStart: Date | null, now = new Date()): 100 | 0 {
  if (!firstSessionStart) return 100;
  const hoursLeft = (firstSessionStart.getTime() - now.getTime()) / 3_600_000;
  return hoursLeft >= COURSE_FULL_REFUND_MIN_HOURS ? 100 : 0;
}

/** Số tiền VND (số nguyên) — Decimal của Prisma trả về object/string. */
function money(value: unknown): number {
  return Math.round(Number(value));
}

function vnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

const refundInclude = {
  member: {
    select: { id: true, user: { select: { id: true, fullName: true, email: true, phone: true } } },
  },
  class: {
    select: { id: true, name: true, coach: { select: { id: true, user: { select: { id: true, fullName: true } } } } },
  },
  schedule: { select: { id: true, startTime: true, endTime: true } },
  payment: {
    select: { id: true, amount: true, method: true, status: true, transactionCode: true, paidAt: true },
  },
  processedBy: { select: { id: true, fullName: true } },
  // Hoàn tiền đơn hàng (lý do ORDER_*): mã đơn + người mua (HLV mua hàng không có `member`).
  order: {
    select: {
      id: true,
      code: true,
      status: true,
      fulfillmentType: true,
      totalPrice: true,
      user: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  },
} satisfies Prisma.RefundInclude;

/** Người nhận tiền hoàn: hội viên (khóa học) hoặc người mua đơn hàng. */
function refundRecipientUserId(refund: { member: { userId: string } | null; order: { userId: string } | null }): string | null {
  return refund.member?.userId ?? refund.order?.userId ?? null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Giao dịch lớp học ĐÃ THU TIỀN gần nhất của hội viên (chưa bị hoàn toàn bộ). */
async function findPaidClassPayment(db: DbClient, memberId: string, classId: string) {
  return db.payment.findFirst({
    where: { memberId, classId, status: "SUCCESS" },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
}

/** Số tiền còn hoàn được = đã trả − tổng các yêu cầu hoàn chưa bị từ chối của cùng giao dịch. */
async function remainingRefundable(db: DbClient, payment: { id: string; amount: Prisma.Decimal }) {
  const agg = await db.refund.aggregate({
    where: { paymentId: payment.id, status: { notIn: ["REJECTED", "CANCELLED"] } },
    _sum: { amount: true },
  });
  return money(payment.amount) - money(agg._sum.amount ?? 0);
}

/**
 * Phần trừ ví HLV cho một khoản hoàn: tỷ lệ theo số tiền HLV THỰC SỰ được cộng từ giao dịch gốc
 * (DEPOSIT gắn `paymentId`; dữ liệu cũ chưa có `paymentId` thì tìm theo ghi chú chứa id giao dịch).
 * VD lớp 1.000.000đ, HLV được cộng 850.000đ, hoàn 1 buổi 100.000đ ⇒ trừ ví 85.000đ.
 */
async function computeCoachDebit(
  db: DbClient,
  payment: { id: string; amount: Prisma.Decimal; classId: string | null },
  refundAmount: number
): Promise<{ coachWalletId: string | null; coachDebitAmount: number }> {
  const deposit =
    (await db.walletTransaction.findFirst({
      where: { paymentId: payment.id, type: "DEPOSIT", status: "COMPLETED" },
    })) ??
    (payment.classId
      ? await db.walletTransaction.findFirst({
          where: {
            classId: payment.classId,
            type: "DEPOSIT",
            status: "COMPLETED",
            paymentId: null,
            note: { contains: payment.id },
          },
        })
      : null);
  if (!deposit) return { coachWalletId: null, coachDebitAmount: 0 };

  const paid = money(payment.amount);
  const debit = paid > 0 ? Math.floor((Number(deposit.amount) * refundAmount) / paid) : 0;
  return { coachWalletId: deposit.walletId, coachDebitAmount: debit };
}

/** Báo cho mọi Manager đang hoạt động có yêu cầu hoàn tiền mới cần xử lý (fire-and-forget). */
export async function notifyManagersNewRefunds(body: string, metadata: Record<string, unknown>) {
  try {
    const managers = await prisma.user.findMany({
      where: { role: { name: "MANAGER" }, isActive: true },
      select: { id: true },
    });
    for (const manager of managers) {
      createNotification(manager.id, "GENERAL", "Yêu cầu hoàn tiền mới", body, { metadata }).catch(() => {});
    }
  } catch {
    // Thông báo không được làm hỏng nghiệp vụ chính.
  }
}

// ── Hội viên hủy khóa học ────────────────────────────────────────────────────

/**
 * MEMBER hủy khóa học. Luật hoàn tiền theo thời điểm hủy so với buổi khai giảng (buổi CHÍNH sớm nhất chưa hủy):
 * - Còn ≥ 72h (3 ngày) ⇒ tạo yêu cầu hoàn 100% phần còn lại của giao dịch (PENDING, chờ Manager chuyển khoản tay
 *   rồi duyệt). Chỗ đã đặt giữ tới khi Manager duyệt; duyệt xong mới hủy chỗ + Payment → REFUNDED.
 * - Muộn hơn (hoặc khóa đã khai giảng) ⇒ vẫn hủy được NGAY nhưng KHÔNG hoàn tiền: các chỗ đặt trong tương lai của
 *   hội viên trong khóa chuyển CANCELLED, giao dịch giữ SUCCESS, ví HLV không bị trừ.
 */
export async function requestCourseRefund(userId: string, classId: string, note?: string) {
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
    select: { id: true, user: { select: { fullName: true } } },
  });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true } });
  if (!cls) throw new AppError("Class not found", 404);

  const now = new Date();
  const firstSession = await prisma.classSchedule.findFirst({
    where: { classId, makeupForId: null, status: { not: "CANCELLED" } },
    orderBy: { startTime: "asc" },
    select: { startTime: true },
  });
  const percent = courseRefundPercent(firstSession?.startTime ?? null, now);

  const outcome = await prisma.$transaction(async (tx) => {
    const found = await findPaidClassPayment(tx, memberProfile.id, classId);
    if (!found) {
      throw new AppError("Bạn chưa có giao dịch thanh toán thành công cho khóa học này.", 404, {
        code: "PAID_PAYMENT_NOT_FOUND",
      });
    }
    // Serialize với duyệt hoàn tiền / webhook trên cùng giao dịch, rồi đọc lại sau lock.
    await lockPaymentWebhook(tx, found.id);
    const payment = await tx.payment.findUnique({ where: { id: found.id } });
    if (!payment || payment.status !== "SUCCESS") {
      throw new AppError("Giao dịch đã thay đổi trạng thái, vui lòng tải lại.", 409);
    }

    const existing = await tx.refund.findFirst({
      where: { paymentId: payment.id, reason: "MEMBER_CANCEL_COURSE", status: { notIn: ["REJECTED", "CANCELLED"] } },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new AppError("Bạn đã gửi yêu cầu hủy khóa học này.", 409, {
        code: "REFUND_ALREADY_REQUESTED",
        refundId: existing.id,
        status: existing.status,
      });
    }

    if (percent === 100) {
      const amount = await remainingRefundable(tx, payment);
      if (amount <= 0) {
        throw new AppError("Giao dịch này không còn số tiền nào để hoàn.", 400);
      }
      const debit = await computeCoachDebit(tx, payment, amount);
      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          memberId: memberProfile.id,
          classId,
          reason: "MEMBER_CANCEL_COURSE",
          amount,
          coachWalletId: debit.coachWalletId,
          coachDebitAmount: debit.coachDebitAmount,
          note: note ?? null,
          memberNote: note ?? null,
          requestedById: userId,
        },
        include: refundInclude,
      });
      return { refund, cancelledEnrollments: 0 };
    }

    // < 72h: hủy ngay, không hoàn tiền. Thứ tự lock: payment → member-class (khớp luồng webhook ghi danh).
    await lockMemberClass(tx, memberProfile.id, classId);
    const cancelled = await tx.enrollment.updateMany({
      where: {
        memberId: memberProfile.id,
        status: "BOOKED",
        schedule: { classId, startTime: { gt: now } },
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    if (cancelled.count === 0) {
      throw new AppError("Bạn không còn buổi học nào sắp tới trong khóa này để hủy.", 400, {
        code: "NO_ACTIVE_BOOKINGS",
      });
    }
    return { refund: null, cancelledEnrollments: cancelled.count };
  });

  if (outcome.refund) {
    void notifyManagersNewRefunds(
      `Hội viên ${memberProfile.user.fullName} xin hủy khóa "${cls.name}" — cần hoàn ${vnd(money(outcome.refund.amount))}.`,
      { refundId: outcome.refund.id, classId }
    );
  } else {
    createNotification(
      userId,
      "ENROLLMENT_CANCELLED",
      `Đã hủy khóa: ${cls.name}`,
      `Bạn đã hủy ${outcome.cancelledEnrollments} buổi sắp tới của khóa "${cls.name}". Do hủy trong vòng 3 ngày trước khai giảng nên không được hoàn tiền.`,
      { metadata: { classId } }
    ).catch(() => {});
  }
  return {
    mode: percent === 100 ? ("REFUND_REQUESTED" as const) : ("CANCELLED_NO_REFUND" as const),
    refundPercent: percent,
    refundAmount: outcome.refund ? money(outcome.refund.amount) : 0,
    cancelledEnrollments: outcome.cancelledEnrollments,
    refund: outcome.refund,
  };
}

// ── Hội viên hủy MỘT buổi lẻ: hoàn 80% nếu hủy trước ≥ 24h ───────────────────

/**
 * Gọi TRONG transaction hủy chỗ của `enrollments.cancelEnrollment`. Hủy buổi lẻ trước giờ học ≥ 24h ⇒ tạo yêu cầu
 * hoàn `SESSION_REFUND_PERCENT`% tiền của buổi đó (= đã trả ÷ số buổi CHÍNH, tối đa bằng phần còn hoàn được).
 * Trả `null` (không hoàn) khi: hủy muộn < 24h, không có giao dịch lớp đã thu tiền, buổi này đã có khoản hoàn,
 * hoặc không còn tiền để hoàn. Mỗi (giao dịch × buổi) chỉ một khoản hoàn.
 */
export async function createMemberSessionRefundTx(
  tx: Prisma.TransactionClient,
  params: { memberId: string; userId: string; classId: string; scheduleId: string; startTime: Date; now?: Date }
) {
  const now = params.now ?? new Date();
  const hoursLeft = (params.startTime.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < SESSION_REFUND_MIN_HOURS) return null;

  const found = await findPaidClassPayment(tx, params.memberId, params.classId);
  if (!found) return null;
  await lockPaymentWebhook(tx, found.id);
  const payment = await tx.payment.findUnique({ where: { id: found.id } });
  if (!payment || payment.status !== "SUCCESS") return null;

  const dup = await tx.refund.findUnique({
    where: { paymentId_scheduleId: { paymentId: payment.id, scheduleId: params.scheduleId } },
    select: { id: true },
  });
  if (dup) return null;

  const mainSessions = await tx.classSchedule.count({ where: { classId: params.classId, makeupForId: null } });
  const perSession = Number(payment.amount) / Math.max(1, mainSessions);
  const amount = Math.min(money((perSession * SESSION_REFUND_PERCENT) / 100), await remainingRefundable(tx, payment));
  if (amount <= 0) return null;
  const debit = await computeCoachDebit(tx, payment, amount);

  return tx.refund.create({
    data: {
      paymentId: payment.id,
      memberId: params.memberId,
      classId: params.classId,
      scheduleId: params.scheduleId,
      reason: "MEMBER_CANCEL_SESSION",
      amount,
      coachWalletId: debit.coachWalletId,
      coachDebitAmount: debit.coachDebitAmount,
      note: `Hội viên hủy 1 buổi trước ${SESSION_REFUND_MIN_HOURS}h — hoàn ${SESSION_REFUND_PERCENT}% tiền buổi học.`,
      requestedById: params.userId,
    },
    include: refundInclude,
  });
}

/**
 * Buổi mà hội viên đã hủy và ĐÃ/ĐANG được hoàn tiền (MEMBER_CANCEL_SESSION, PENDING hoặc COMPLETED)
 * thì không được đặt lại — tránh hoàn 80% rồi vẫn đi học. Hủy yêu cầu hoàn / bị từ chối ⇒ đặt lại được.
 * Trả danh sách scheduleId bị chặn.
 */
export async function findSessionsBlockedByRefund(
  tx: Prisma.TransactionClient,
  memberId: string,
  scheduleIds: string[]
): Promise<string[]> {
  if (scheduleIds.length === 0) return [];
  const rows = await tx.refund.findMany({
    where: {
      memberId,
      scheduleId: { in: scheduleIds },
      reason: "MEMBER_CANCEL_SESSION",
      status: { in: ["PENDING", "COMPLETED"] },
    },
    select: { scheduleId: true },
  });
  return rows.map((r) => r.scheduleId as string);
}

export function throwSessionRefundedError(scheduleIds: string[]): never {
  throw new AppError(
    "Bạn đã hủy buổi này và được tạo yêu cầu hoàn tiền nên không thể đặt lại. Hãy hủy yêu cầu hoàn tiền trước nếu muốn giữ buổi.",
    409,
    { code: "SESSION_CANCELLED_WITH_REFUND", scheduleIds }
  );
}

// ── Hội viên / người mua tự hủy yêu cầu hoàn tiền đang chờ ────────────────────

/** Lý do hoàn tiền do CHÍNH người dùng gửi — chỉ những loại này mới được tự hủy. */
const SELF_CANCELLABLE_REASONS = ["MEMBER_CANCEL_COURSE", "MEMBER_CANCEL_SESSION", "ORDER_CANCELLED"];

/**
 * MEMBER/COACH hủy yêu cầu hoàn tiền của mình khi còn PENDING (Manager chưa xử lý): status → CANCELLED.
 * - Hủy khóa: chỗ đặt vẫn giữ (chưa bị hủy vì chưa duyệt) ⇒ khóa học tiếp tục bình thường.
 * - Hoàn tiền đơn hàng: đơn quay về trạng thái ngay trước khi xin hủy (cùng luật Manager từ chối).
 * - Đã duyệt / từ chối / đã hủy ⇒ 409 `REFUND_ALREADY_PROCESSED`.
 */
export async function cancelMyRefund(refundId: string, actor: { id: string; role: string }) {
  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await tx.refund.findUnique({ where: { id: refundId }, select: { paymentId: true } });
    if (!current) throw new AppError("Refund not found", 404);
    await lockPaymentWebhook(tx, current.paymentId);

    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { member: { select: { userId: true } }, order: { select: { userId: true } } },
    });
    if (!refund) throw new AppError("Refund not found", 404);
    const ownerId = refund.member?.userId ?? refund.order?.userId ?? null;
    if (ownerId !== actor.id) throw new AppError("Forbidden: You can only cancel your own refund requests", 403);
    if (!SELF_CANCELLABLE_REASONS.includes(refund.reason)) {
      throw new AppError("Yêu cầu hoàn tiền này do hệ thống tạo — không thể tự hủy.", 400, {
        code: "REFUND_NOT_SELF_CANCELLABLE",
      });
    }
    if (refund.status !== "PENDING") {
      throw new AppError("Yêu cầu hoàn tiền đã được xử lý.", 409, {
        code: "REFUND_ALREADY_PROCESSED",
        status: refund.status,
      });
    }

    const updated = await tx.refund.update({
      where: { id: refund.id },
      data: { status: "CANCELLED", processedAt: new Date() },
      include: refundInclude,
    });
    if (refund.orderId) await onOrderRefundRejectedTx(tx, refund, actor.id, "Khách hủy yêu cầu hoàn tiền");
    return updated;
  });
  return cancelled;
}

// ── Buổi học bị hủy (chọn hoàn tiền thay vì dạy bù) ──────────────────────────

/**
 * Tạo yêu cầu hoàn tiền 1 buổi cho các hội viên đã đặt buổi bị hủy. Chạy TRONG transaction hủy buổi
 * (class-schedules.service), SAU `lockSchedule` và TRƯỚC khi hủy chỗ đặt — thứ tự lock:
 * schedule → payment (sắp theo id, chống deadlock giữa 2 lần hủy song song) → enrollment.
 *
 * - Tiền 1 buổi = số tiền đã trả ÷ số buổi CHÍNH của lớp (không tính buổi dạy bù), tối đa bằng phần còn hoàn được.
 * - Chỉ hội viên có giao dịch lớp đã thu tiền mới có yêu cầu hoàn; mỗi (giao dịch × buổi) chỉ một yêu cầu.
 */
export async function createSessionRefundsTx(
  tx: Prisma.TransactionClient,
  params: { scheduleId: string; classId: string; memberIds: string[]; requestedById: string; note?: string }
) {
  const { scheduleId, classId, requestedById, note } = params;
  const mainSessions = await tx.classSchedule.count({ where: { classId, makeupForId: null } });

  const payments: Payment[] = [];
  for (const memberId of [...new Set(params.memberIds)]) {
    const payment = await findPaidClassPayment(tx, memberId, classId);
    if (payment) payments.push(payment);
  }
  payments.sort((a, b) => a.id.localeCompare(b.id));

  const created: { id: string; memberId: string; amount: number }[] = [];
  for (const payment of payments) {
    await lockPaymentWebhook(tx, payment.id);
    const exists = await tx.refund.findUnique({
      where: { paymentId_scheduleId: { paymentId: payment.id, scheduleId } },
      select: { id: true },
    });
    if (exists) continue;

    const perSession = money(Number(payment.amount) / Math.max(1, mainSessions));
    const amount = Math.min(perSession, await remainingRefundable(tx, payment));
    if (amount <= 0) continue;
    const debit = await computeCoachDebit(tx, payment, amount);

    const refund = await tx.refund.create({
      data: {
        paymentId: payment.id,
        memberId: payment.memberId!,
        classId,
        scheduleId,
        reason: "SESSION_CANCELLED",
        amount,
        coachWalletId: debit.coachWalletId,
        coachDebitAmount: debit.coachDebitAmount,
        note: note ?? null,
        requestedById,
      },
      select: { id: true, memberId: true },
    });
    created.push({ id: refund.id, memberId: refund.memberId!, amount });
  }
  return created;
}

// ── Manager xử lý ────────────────────────────────────────────────────────────

/**
 * Manager DUYỆT (sau khi đã chuyển khoản tay cho hội viên):
 * - Trừ ví HLV `coachDebitAmount` + ghi giao dịch ví REFUND_DEBIT (số dư có thể âm nếu HLV đã rút trước đó
 *   — khi đó HLV không rút được tới khi bù đủ).
 * - Hủy khóa học: Payment → REFUNDED, hủy mọi chỗ đang giữ của hội viên trong lớp.
 * - Hoàn buổi lẻ: Payment giữ SUCCESS (báo cáo trừ riêng khoản hoàn này).
 */
export async function approveRefund(refundId: string, managerUserId: string, note?: string) {
  const approved = await prisma.$transaction(async (tx) => {
    const current = await tx.refund.findUnique({ where: { id: refundId }, select: { paymentId: true } });
    if (!current) throw new AppError("Refund not found", 404);
    await lockPaymentWebhook(tx, current.paymentId);

    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: {
        member: { select: { userId: true } },
        class: { select: { name: true } },
        order: { select: { userId: true, code: true } },
        payment: { select: { amount: true, status: true } },
      },
    });
    if (!refund) throw new AppError("Refund not found", 404);
    if (refund.status !== "PENDING") {
      throw new AppError("Yêu cầu hoàn tiền đã được xử lý.", 409, {
        code: "REFUND_ALREADY_PROCESSED",
        status: refund.status,
      });
    }

    const amount = money(refund.amount);
    const debit = money(refund.coachDebitAmount);
    const className = refund.class?.name ?? "khóa học";

    if (refund.coachWalletId && debit > 0) {
      await tx.coachWallet.update({
        where: { id: refund.coachWalletId },
        data: { balance: { decrement: debit } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: refund.coachWalletId,
          amount: debit,
          type: "REFUND_DEBIT",
          status: "COMPLETED",
          classId: refund.classId,
          paymentId: refund.paymentId,
          note:
            refund.reason === "MEMBER_CANCEL_COURSE"
              ? `Trừ ví do hội viên hủy khóa "${className}" (hoàn ${vnd(amount)}) — refund ${refund.id}`
              : refund.reason === "MEMBER_CANCEL_SESSION"
                ? `Trừ ví do hội viên hủy 1 buổi lớp "${className}" (hoàn ${vnd(amount)}) — refund ${refund.id}`
                : `Trừ ví do hủy 1 buổi lớp "${className}" không dạy bù (hoàn ${vnd(amount)}) — refund ${refund.id}`,
        },
      });
    }

    // Hoàn tiền đơn hàng: đơn → REFUNDED (+ trả hàng về kho nếu chưa giao); hoàn toàn bộ ⇒ giao dịch REFUNDED.
    if (refund.orderId) {
      await onOrderRefundApprovedTx(tx, refund, managerUserId);
      if (refund.payment.status === "SUCCESS" && amount >= money(refund.payment.amount)) {
        await tx.payment.update({ where: { id: refund.paymentId }, data: { status: "REFUNDED" } });
      }
    }

    if (refund.reason === "MEMBER_CANCEL_COURSE") {
      await tx.payment.update({ where: { id: refund.paymentId }, data: { status: "REFUNDED" } });
      if (refund.classId && refund.memberId) {
        await tx.enrollment.updateMany({
          where: { memberId: refund.memberId, schedule: { classId: refund.classId }, status: "BOOKED" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
      }
    }

    const updated = await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: "COMPLETED",
        processedById: managerUserId,
        processedAt: new Date(),
        ...(note ? { note, managerNote: note } : {}),
      },
      include: refundInclude,
    });

    const recipient = refundRecipientUserId(refund);
    if (recipient) {
      await enqueueNotification(tx, {
        userId: recipient,
        type: "PAYMENT_REFUNDED",
        title: "Bạn đã được hoàn tiền",
        body: refund.order
          ? `Đơn hàng ${refund.order.code} đã được hoàn ${vnd(amount)} cho bạn.`
          : refund.reason === "MEMBER_CANCEL_COURSE"
            ? `Yêu cầu hủy khóa "${className}" đã được duyệt. ${vnd(amount)} đã được hoàn cho bạn.`
            : refund.reason === "MEMBER_CANCEL_SESSION"
              ? `Buổi học bạn đã hủy của lớp "${className}" đã được hoàn ${vnd(amount)} cho bạn.`
              : `Buổi học bị hủy của lớp "${className}" đã được hoàn ${vnd(amount)} cho bạn.`,
        metadata: { refundId: refund.id, paymentId: refund.paymentId, classId: refund.classId, orderId: refund.orderId },
      });
    }

    return updated;
  });

  await flushNotificationOutbox().catch(() => {});
  return approved;
}

/** Manager TỪ CHỐI (kèm lý do): không trừ ví, không đổi giao dịch; hội viên được thông báo. */
export async function rejectRefund(refundId: string, managerUserId: string, reason: string) {
  const rejected = await prisma.$transaction(async (tx) => {
    const current = await tx.refund.findUnique({ where: { id: refundId }, select: { paymentId: true } });
    if (!current) throw new AppError("Refund not found", 404);
    await lockPaymentWebhook(tx, current.paymentId);

    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { member: { select: { userId: true } }, class: { select: { name: true } }, order: { select: { userId: true, code: true } } },
    });
    if (!refund) throw new AppError("Refund not found", 404);
    if (refund.status !== "PENDING") {
      throw new AppError("Yêu cầu hoàn tiền đã được xử lý.", 409, {
        code: "REFUND_ALREADY_PROCESSED",
        status: refund.status,
      });
    }

    const updated = await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: "REJECTED",
        rejectReason: reason,
        processedById: managerUserId,
        processedAt: new Date(),
      },
      include: refundInclude,
    });

    // Từ chối hủy đơn đã thanh toán ⇒ đơn quay lại trạng thái trước đó để Trung tâm xử lý tiếp.
    if (refund.orderId) await onOrderRefundRejectedTx(tx, refund, managerUserId, reason);

    const recipient = refundRecipientUserId(refund);
    if (recipient) {
      await enqueueNotification(tx, {
        userId: recipient,
        type: "GENERAL",
        title: "Yêu cầu hoàn tiền bị từ chối",
        body: refund.order
          ? `Yêu cầu hoàn tiền cho đơn hàng ${refund.order.code} đã bị từ chối.`
          : `Yêu cầu hoàn tiền cho lớp "${refund.class?.name ?? "khóa học"}" đã bị từ chối.`,
        reason,
        metadata: { refundId: refund.id, paymentId: refund.paymentId, classId: refund.classId, orderId: refund.orderId },
      });
    }

    return updated;
  });

  await flushNotificationOutbox().catch(() => {});
  return rejected;
}

// ── Danh sách ────────────────────────────────────────────────────────────────

function buildRefundWhere(query: RefundQueryInput): Prisma.RefundWhereInput {
  const where: Prisma.RefundWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.reason) where.reason = query.reason;
  if (query.memberId) where.memberId = query.memberId;
  if (query.classId) where.classId = query.classId;
  if (query.orderId) where.orderId = query.orderId;
  return where;
}

async function paginateRefunds(where: Prisma.RefundWhereInput, query: RefundQueryInput) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const [total, refunds] = await Promise.all([
    prisma.refund.count({ where }),
    prisma.refund.findMany({
      where,
      include: refundInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { refunds, pagination: buildPaginationMeta(total, page, limit) };
}

/** MANAGER: mọi yêu cầu hoàn tiền (lọc theo trạng thái / lý do / hội viên / lớp). */
export async function listRefunds(query: RefundQueryInput) {
  return paginateRefunds(buildRefundWhere(query), query);
}

/** MEMBER/COACH: yêu cầu hoàn tiền của chính mình (khóa học theo hồ sơ hội viên + đơn hàng mình mua). */
export async function listMyRefunds(userId: string, query: RefundQueryInput) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  const owner: Prisma.RefundWhereInput[] = [{ order: { userId } }];
  if (memberProfile) owner.push({ memberId: memberProfile.id });
  return paginateRefunds({ AND: [buildRefundWhere(query), { OR: owner }] }, query);
}

/** BE-17: một yêu cầu hoàn tiền — MANAGER xem mọi bản ghi; MEMBER chỉ xem của mình. */
export async function getRefundById(id: string, actor: { id: string; role: string }) {
  const refund = await prisma.refund.findUnique({ where: { id }, include: refundInclude });
  if (!refund) throw new AppError("Refund not found", 404);
  const ownerId = refund.member?.user.id ?? refund.order?.user.id ?? null;
  if (actor.role !== "MANAGER" && ownerId !== actor.id) throw new AppError("Forbidden", 403);
  return refund;
}

/**
 * BE-16: xem trước điều kiện hủy khóa (cùng luật với `requestCourseRefund`, KHÔNG ghi dữ liệu):
 * - `refundPercent` 100 nếu còn ≥ 72h trước buổi chính đầu tiên chưa hủy, ngược lại 0 (hủy được nhưng không hoàn tiền).
 * - `mode`: REFUND (tạo yêu cầu hoàn) | CANCEL_NO_REFUND (hủy ngay, không hoàn).
 */
export async function previewCourseRefund(userId: string, classId: string, now = new Date()) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
  if (!cls) throw new AppError("Class not found", 404);

  const [firstSession, payment, futureBooked] = await Promise.all([
    prisma.classSchedule.findFirst({
      where: { classId, makeupForId: null, status: { not: "CANCELLED" } },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    }),
    findPaidClassPayment(prisma, memberProfile.id, classId),
    prisma.enrollment.count({
      where: { memberId: memberProfile.id, status: "BOOKED", schedule: { classId, startTime: { gt: now } } },
    }),
  ]);
  const refundPercent = courseRefundPercent(firstSession?.startTime ?? null, now);
  const fullRefundDeadline = firstSession
    ? new Date(firstSession.startTime.getTime() - COURSE_FULL_REFUND_MIN_HOURS * 3_600_000)
    : null;
  const paidAmount = payment ? money(payment.amount) : 0;
  const refundableAmount = payment ? Math.max(0, await remainingRefundable(prisma, payment)) : 0;
  const existing = payment
    ? await prisma.refund.findFirst({
        where: {
          paymentId: payment.id,
          reason: "MEMBER_CANCEL_COURSE",
          status: { notIn: ["REJECTED", "CANCELLED"] },
        },
        select: { id: true, status: true },
      })
    : null;

  let blockReason: string | null = null;
  let blockMessage: string | null = null;
  if (!payment) {
    blockReason = "PAID_PAYMENT_NOT_FOUND";
    blockMessage = "Bạn chưa có giao dịch thanh toán thành công cho khóa học này.";
  } else if (existing) {
    blockReason = "REFUND_ALREADY_REQUESTED";
    blockMessage =
      existing.status === "PENDING"
        ? "Bạn đã gửi yêu cầu hủy khóa này, đang chờ Quản lý duyệt."
        : "Khóa học này đã được hoàn tiền.";
  } else if (refundPercent === 100 && refundableAmount <= 0) {
    blockReason = "NOTHING_TO_REFUND";
    blockMessage = "Giao dịch này không còn số tiền nào để hoàn.";
  } else if (refundPercent === 0 && futureBooked === 0) {
    blockReason = "NO_ACTIVE_BOOKINGS";
    blockMessage = "Bạn không còn buổi học nào sắp tới trong khóa này để hủy.";
  }

  return {
    allowed: blockReason === null,
    mode: refundPercent === 100 ? ("REFUND" as const) : ("CANCEL_NO_REFUND" as const),
    refundPercent,
    /** Hạn cuối để hủy mà vẫn được hoàn 100% (buổi khai giảng − 72h); null nếu khóa chưa có lịch. */
    fullRefundDeadline,
    /** Giữ tên cũ cho FE đang dùng: trùng `fullRefundDeadline`. */
    deadline: fullRefundDeadline,
    firstSessionStart: firstSession?.startTime ?? null,
    paidAmount,
    refundableAmount,
    /** Số tiền sẽ được hoàn nếu hủy ngay bây giờ. */
    estimatedRefundAmount: Math.round((refundableAmount * refundPercent) / 100),
    futureBookedSessions: futureBooked,
    blockReason,
    blockMessage,
    existingRefundId: existing?.id ?? null,
  };
}
