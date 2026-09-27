import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";

/** Tỷ lệ chia doanh thu: Coach nhận 85%, hệ thống giữ 15% */
const COACH_REVENUE_SHARE = 0.85;

/**
 * Credit 85% doanh thu từ 1 payment cho primary coach của class.
 * Chạy TRONG transaction để đảm bảo atomicity với payment update.
 */
export async function creditCoachWallet(
  tx: any,
  classId: string,
  paymentId: string,
  paymentAmount: number
) {
  // Tìm primary coach của class
  const primaryCoachMember = await tx.classMember.findFirst({
    where: { classId, isPrimary: true },
    select: { coachId: true },
  });
  if (!primaryCoachMember) return; // Không có primary coach → không credit

  const coachAmount = Math.floor(paymentAmount * COACH_REVENUE_SHARE);

  // Upsert wallet rồi lấy ID
  const wallet = await tx.coachWallet.upsert({
    where: { coachId: primaryCoachMember.coachId },
    create: { coachId: primaryCoachMember.coachId, balance: coachAmount },
    update: { balance: { increment: coachAmount } },
    select: { id: true, coachId: true },
  });

  // Ghi transaction vào lịch sử ví
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: coachAmount,
      type: "DEPOSIT",
      status: "COMPLETED",
      classId,
      note: `Thu nhập từ khóa học (${COACH_REVENUE_SHARE * 100}% của ${paymentAmount.toLocaleString("vi-VN")}đ) — payment ${paymentId}`,
    },
  });

  // Lấy userId để gửi notification (không ném lỗi nếu thất bại)
  try {
    const coach = await tx.coachProfile.findUnique({
      where: { id: primaryCoachMember.coachId },
      select: { userId: true, user: { select: { id: true } } },
    });
    if (coach?.userId) {
      const cls = await tx.class.findUnique({ where: { id: classId }, select: { name: true } });
      createNotification(
        coach.userId,
        "PAYMENT_SUCCESS",
        "Bạn vừa nhận được thu nhập!",
        `${coachAmount.toLocaleString("vi-VN")}đ đã được ghi vào ví từ khóa học "${cls?.name ?? classId}".`
      ).catch(() => {});
    }
  } catch {
    // Không để lỗi notification phá vỡ transaction
  }
}

/**
 * Auto-enroll member vào tất cả buổi SCHEDULED của class sau khi payment SUCCESS.
 * Chạy TRONG transaction.
 */
export async function autoEnrollAfterPayment(tx: any, classId: string, memberProfileId: string) {
  const schedules = await tx.classSchedule.findMany({
    where: { classId, status: "SCHEDULED" },
  });
  for (const schedule of schedules) {
    await tx.enrollment.upsert({
      where: { memberId_scheduleId: { memberId: memberProfileId, scheduleId: schedule.id } },
      create: { memberId: memberProfileId, classId, scheduleId: schedule.id, status: "BOOKED" },
      update: {}, // Đã có enrollment → giữ nguyên (idempotent)
    });
  }
  return schedules.length;
}

export async function createPayment(data: any, createdById: string) {
  // Resolve member
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: data.memberId }, { userId: data.memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  // Validate classId nếu có
  let cls = null;
  if (data.classId) {
    cls = await prisma.class.findUnique({ where: { id: data.classId } });
    if (!cls) throw new AppError("Class not found", 404);
    if (cls.status !== "APPROVED") throw new AppError("Class is not yet approved", 400);
  }

  return prisma.$transaction(async (tx) => {
    const paymentStatus = data.status ?? "SUCCESS";
    const payment = await tx.payment.create({
      data: {
        memberId: memberProfile.id,
        classId: data.classId,
        classNameSnapshot: cls?.name,
        amount: data.amount,
        method: data.method,
        status: paymentStatus,
        note: data.note,
        transactionCode: data.transactionCode,
        paidAt: paymentStatus === "SUCCESS" ? new Date() : undefined,
        createdById,
      },
      include: { member: { include: { user: { select: { fullName: true } } } } },
    });

    let invoice = null;
    let enrolledCount = 0;

    if (payment.status === "SUCCESS") {
      invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          memberId: memberProfile.id,
          paymentId: payment.id,
          subtotal: data.amount,
          discount: 0,
          total: data.amount,
          status: "ISSUED",
          issuedAt: new Date(),
        },
      });

      // Nếu payment cho 1 class → auto-enroll + credit coach wallet
      if (data.classId && cls) {
        enrolledCount = await autoEnrollAfterPayment(tx, data.classId, memberProfile.id);
        await creditCoachWallet(tx, data.classId, payment.id, Number(data.amount));
      }
    }

    return { ...payment, invoice, enrolledCount };
  });
}

export async function listPayments(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.memberId) where.memberId = query.memberId;
  if (query.status) where.status = query.status;
  if (query.method) where.method = query.method;
  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) where.createdAt.lte = new Date(query.endDate);
  }

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where, skip, take: limit,
      include: {
        member: { include: { user: { select: { fullName: true, email: true } } } },
        invoice: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { payments, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getPaymentById(id: string, currentUser: any) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      member: { include: { user: { select: { fullName: true, email: true, phone: true } } } },
      invoice: true,
      createdBy: { select: { fullName: true, email: true } },
    },
  });
  if (!payment) throw new AppError("Payment not found", 404);

  // IDOR: MEMBER can only view their own payment
  if (currentUser.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: currentUser.id } });
    if (!memberProfile || payment.memberId !== memberProfile.id) {
      throw new AppError("Forbidden: You can only view your own payments", 403);
    }
  }
  if (currentUser.role === "COACH") {
    throw new AppError("Forbidden: Coaches cannot view payment details", 403);
  }

  return payment;
}

export async function updatePaymentStatus(id: string, status: string) {
  const payment = await prisma.payment.findUnique({ where: { id }, include: { invoice: true } });
  if (!payment) throw new AppError("Payment not found", 404);

  // Giao dịch online (SePay): trạng thái CHỈ được chốt bởi webhook/đối soát (settlement).
  if (payment.gateway) {
    throw new AppError(
      "Không thể đổi trạng thái thanh toán online thủ công. Giao dịch SePay được chốt qua webhook/đối soát.",
      400
    );
  }

  // BR-14: Strict state machine
  if (payment.status === status) return payment;

  if (payment.status === "SUCCESS" && status !== "REFUNDED") {
    throw new AppError("A successful payment can only be refunded", 400);
  }
  if (payment.status === "FAILED" || payment.status === "REFUNDED") {
    throw new AppError(`Cannot update payment from ${payment.status} to ${status}`, 400);
  }

  const updateData: any = { status };
  if (status === "SUCCESS") updateData.paidAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: updateData });

    // Auto create invoice if SUCCESS and no invoice
    if (status === "SUCCESS" && !payment.invoice) {
      await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          memberId: payment.memberId,
          paymentId: payment.id,
          subtotal: Number(payment.amount),
          discount: 0,
          total: Number(payment.amount),
          status: "ISSUED",
          issuedAt: new Date(),
        },
      });

      // Auto-enroll + credit wallet nếu là payment cho class
      if (payment.classId) {
        await autoEnrollAfterPayment(tx, payment.classId, payment.memberId);
        await creditCoachWallet(tx, payment.classId, payment.id, Number(payment.amount));
      }
    }

    // Cancel invoice if REFUNDED or FAILED
    if ((status === "REFUNDED" || status === "FAILED") && payment.invoice) {
      await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: { status: "CANCELLED" },
      });
    }
  });

  return getPaymentById(id, { role: "MANAGER" });
}
