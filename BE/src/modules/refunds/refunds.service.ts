import { Prisma, type Payment } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { lockPaymentWebhook } from "../../utils/dbLocks.js";
import { createNotification } from "../notifications/notifications.service.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import type { RefundQueryInput } from "./refunds.schema.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Hội viên chỉ được tự hủy khóa học nếu còn ít nhất ngần này giờ trước buổi khai giảng. */
export const COURSE_CANCEL_MIN_HOURS_BEFORE_START = 24;

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
  class: { select: { id: true, name: true } },
  schedule: { select: { id: true, startTime: true, endTime: true } },
  payment: {
    select: { id: true, amount: true, method: true, status: true, transactionCode: true, paidAt: true },
  },
  processedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.RefundInclude;

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
    where: { paymentId: payment.id, status: { not: "REJECTED" } },
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
 * MEMBER xin hủy khóa học ⇒ tạo yêu cầu hoàn tiền PENDING (chờ Manager chuyển khoản tay rồi duyệt).
 *
 * - Chỉ khi còn ≥ 24h trước buổi khai giảng (buổi CHÍNH sớm nhất chưa bị hủy); lớp chưa có buổi nào thì cho hủy.
 * - Hoàn phần CÒN LẠI của giao dịch (đã trừ các khoản hoàn buổi lẻ trước đó) = 100% nếu chưa có khoản nào.
 * - Chỗ đã đặt vẫn giữ tới khi Manager duyệt; duyệt xong mới hủy chỗ + đổi Payment sang REFUNDED.
 */
export async function requestCourseRefund(userId: string, classId: string, note?: string) {
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
    select: { id: true, user: { select: { fullName: true } } },
  });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true } });
  if (!cls) throw new AppError("Class not found", 404);

  const firstSession = await prisma.classSchedule.findFirst({
    where: { classId, makeupForId: null, status: { not: "CANCELLED" } },
    orderBy: { startTime: "asc" },
    select: { startTime: true },
  });
  if (firstSession) {
    const hoursLeft = (firstSession.startTime.getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < COURSE_CANCEL_MIN_HOURS_BEFORE_START) {
      throw new AppError(
        `Chỉ được hủy khóa học trước giờ khai giảng ít nhất ${COURSE_CANCEL_MIN_HOURS_BEFORE_START} giờ.`,
        400,
        { code: "COURSE_CANCEL_TOO_LATE", firstSessionAt: firstSession.startTime }
      );
    }
  }

  const refund = await prisma.$transaction(async (tx) => {
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
      where: { paymentId: payment.id, reason: "MEMBER_CANCEL_COURSE", status: { not: "REJECTED" } },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new AppError("Bạn đã gửi yêu cầu hủy khóa học này.", 409, {
        code: "REFUND_ALREADY_REQUESTED",
        refundId: existing.id,
        status: existing.status,
      });
    }

    const amount = await remainingRefundable(tx, payment);
    if (amount <= 0) {
      throw new AppError("Giao dịch này không còn số tiền nào để hoàn.", 400);
    }
    const debit = await computeCoachDebit(tx, payment, amount);

    return tx.refund.create({
      data: {
        paymentId: payment.id,
        memberId: memberProfile.id,
        classId,
        reason: "MEMBER_CANCEL_COURSE",
        amount,
        coachWalletId: debit.coachWalletId,
        coachDebitAmount: debit.coachDebitAmount,
        note: note ?? null,
        requestedById: userId,
      },
      include: refundInclude,
    });
  });

  void notifyManagersNewRefunds(
    `Hội viên ${memberProfile.user.fullName} xin hủy khóa "${cls.name}" — cần hoàn ${vnd(money(refund.amount))}.`,
    { refundId: refund.id, classId }
  );
  return refund;
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
    created.push({ id: refund.id, memberId: refund.memberId, amount });
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
      include: { member: { select: { userId: true } }, class: { select: { name: true } } },
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
              : `Trừ ví do hủy 1 buổi lớp "${className}" không dạy bù (hoàn ${vnd(amount)}) — refund ${refund.id}`,
        },
      });
    }

    if (refund.reason === "MEMBER_CANCEL_COURSE") {
      await tx.payment.update({ where: { id: refund.paymentId }, data: { status: "REFUNDED" } });
      if (refund.classId) {
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
        ...(note ? { note } : {}),
      },
      include: refundInclude,
    });

    await enqueueNotification(tx, {
      userId: refund.member.userId,
      type: "PAYMENT_REFUNDED",
      title: "Bạn đã được hoàn tiền",
      body:
        refund.reason === "MEMBER_CANCEL_COURSE"
          ? `Yêu cầu hủy khóa "${className}" đã được duyệt. ${vnd(amount)} đã được hoàn cho bạn.`
          : `Buổi học bị hủy của lớp "${className}" đã được hoàn ${vnd(amount)} cho bạn.`,
      metadata: { refundId: refund.id, paymentId: refund.paymentId, classId: refund.classId },
    });

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
      include: { member: { select: { userId: true } }, class: { select: { name: true } } },
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

    await enqueueNotification(tx, {
      userId: refund.member.userId,
      type: "GENERAL",
      title: "Yêu cầu hoàn tiền bị từ chối",
      body: `Yêu cầu hoàn tiền cho lớp "${refund.class?.name ?? "khóa học"}" đã bị từ chối.`,
      reason,
      metadata: { refundId: refund.id, paymentId: refund.paymentId, classId: refund.classId },
    });

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

/** MEMBER: yêu cầu hoàn tiền của chính mình. */
export async function listMyRefunds(userId: string, query: RefundQueryInput) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);
  return paginateRefunds({ ...buildRefundWhere(query), memberId: memberProfile.id }, query);
}
