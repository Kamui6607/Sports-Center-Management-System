import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";

/** Tỷ lệ chia doanh thu: Coach nhận 85%, hệ thống giữ 15% */
const COACH_REVENUE_SHARE = 0.85;

/**
 * Credit 85% doanh thu từ 1 payment cho HLV của lớp (mỗi lớp đúng 1 HLV — Class.coachId).
 * Chạy TRONG transaction để đảm bảo atomicity với payment update.
 */
export async function creditCoachWallet(
  tx: any,
  classId: string,
  paymentId: string,
  paymentAmount: number
) {
  // HLV của lớp
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: { coachId: true, name: true, coach: { select: { userId: true } } },
  });
  if (!cls) return;

  const coachAmount = Math.floor(paymentAmount * COACH_REVENUE_SHARE);

  // Upsert wallet rồi lấy ID
  const wallet = await tx.coachWallet.upsert({
    where: { coachId: cls.coachId },
    create: { coachId: cls.coachId, balance: coachAmount },
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
      // Gắn giao dịch gốc: khi hoàn tiền sẽ trừ ví đúng tỷ lệ số tiền HLV đã nhận từ giao dịch này.
      paymentId,
      note: `Thu nhập từ khóa học (${COACH_REVENUE_SHARE * 100}% của ${paymentAmount.toLocaleString("vi-VN")}đ) — payment ${paymentId}`,
    },
  });

  // Gửi notification (userId + tên lớp đã lấy sẵn ở query đầu — không tốn thêm query trong transaction)
  const coachUserId = cls.coach?.userId;
  if (coachUserId) {
    createNotification(
      coachUserId,
      "PAYMENT_SUCCESS",
      "Bạn vừa nhận được thu nhập!",
      `${coachAmount.toLocaleString("vi-VN")}đ đã được ghi vào ví từ khóa học "${cls.name}".`
    ).catch(() => {});
  }
}

/**
 * Auto-enroll member vào các buổi SCHEDULED CHƯA DIỄN RA của class sau khi payment SUCCESS
 * (buổi đã qua giờ bắt đầu thì không ghi danh). Chạy TRONG transaction.
 */
export async function autoEnrollAfterPayment(tx: any, classId: string, memberProfileId: string) {
  const schedules: { id: string }[] = await tx.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: new Date() } },
    select: { id: true },
  });
  if (schedules.length === 0) return 0;
  // 1 query cho mọi buổi; skipDuplicates giữ nguyên enrollment đã có (idempotent như upsert cũ).
  await tx.enrollment.createMany({
    data: schedules.map((s) => ({ memberId: memberProfileId, scheduleId: s.id, status: "BOOKED" })),
    skipDuplicates: true,
  });
  return schedules.length;
}

export async function createPayment(data: any, createdById: string) {
  // Resolve member
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: data.memberId }, { userId: data.memberId }] },
    include: { user: { select: { fullName: true } } },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  // Validate classId nếu có
  let cls = null;
  if (data.classId) {
    cls = await prisma.class.findUnique({ where: { id: data.classId } });
    if (!cls) throw new AppError("Class not found", 404);
    if (cls.status !== "APPROVED") throw new AppError("Class is not yet approved", 400);
    const price = Number(cls.price);
    if (price <= 0) {
      throw new AppError("Khóa học miễn phí, không cần ghi nhận thanh toán.", 400);
    }
    // Số tiền là căn cứ cho 85% ví HLV và tiền hoàn ⇒ phải đúng giá khóa học.
    if (Number(data.amount) !== price) {
      throw new AppError(
        `Số tiền phải bằng giá khóa học (${price.toLocaleString("vi-VN")}đ).`,
        400,
        { code: "AMOUNT_MISMATCH", expectedAmount: price }
      );
    }
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

    let enrolledCount = 0;

    if (payment.status === "SUCCESS") {
      // Nếu payment cho 1 class → auto-enroll + credit coach wallet
      if (data.classId && cls) {
        enrolledCount = await autoEnrollAfterPayment(tx, data.classId, memberProfile.id);
        await creditCoachWallet(tx, data.classId, payment.id, Number(data.amount));
      }
    }

    return { ...payment, enrolledCount };
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
  const payment = await prisma.payment.findUnique({ where: { id } });
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

    if (status === "SUCCESS") {
      // Auto-enroll + credit wallet nếu là payment cho class (payment lớp học luôn có memberId)
      if (payment.classId && payment.memberId) {
        await autoEnrollAfterPayment(tx, payment.classId, payment.memberId);
        await creditCoachWallet(tx, payment.classId, payment.id, Number(payment.amount));
      }
    }
  });

  return getPaymentById(id, { role: "MANAGER" });
}

/**
 * BE-6: Lịch sử thanh toán của CHÍNH người dùng (thay cho hóa đơn đã bỏ).
 * - MEMBER: giao dịch mua khóa học + đơn sản phẩm của mình.
 * - COACH: đơn sản phẩm của mình.
 * `type=CLASS|ORDER` lọc theo loại; mỗi bản ghi kèm tên khóa / dòng sản phẩm và số tiền đã hoàn.
 */
export async function listMyPayments(user: { id: string; role: string }, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const member = await prisma.memberProfile.findUnique({ where: { userId: user.id }, select: { id: true } });

  const owner: Prisma.PaymentWhereInput[] = [{ order: { userId: user.id } }];
  if (member) owner.push({ memberId: member.id });
  const where: Prisma.PaymentWhereInput = { OR: owner };
  if (query.type === "CLASS") where.classId = { not: null };
  if (query.type === "ORDER") where.orderId = { not: null };
  if (query.status) where.status = query.status;

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        class: { select: { id: true, name: true } },
        order: {
          include: { items: { include: { product: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } },
        },
        refunds: { where: { status: { not: "REJECTED" } }, select: { id: true, amount: true, status: true } },
      },
    }),
  ]);

  const payments = rows.map((p) => ({
    id: p.id,
    type: p.orderId ? "ORDER" : "CLASS",
    amount: p.amount,
    status: p.status,
    method: p.method,
    transactionCode: p.transactionCode,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    classId: p.classId,
    className: p.classNameSnapshot ?? p.class?.name ?? null,
    orderId: p.orderId,
    orderStatus: p.order?.status ?? null,
    items:
      p.order?.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalAmount: i.totalAmount,
      })) ?? [],
    refundedAmount: p.refunds.filter((r) => r.status === "COMPLETED").reduce((sum, r) => sum + Number(r.amount), 0),
    pendingRefundAmount: p.refunds.filter((r) => r.status === "PENDING").reduce((sum, r) => sum + Number(r.amount), 0),
  }));
  return { payments, pagination: buildPaginationMeta(total, page, limit) };
}
