import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

async function createInvoice(memberId: string, paymentId: string, amount: number) {
  return prisma.invoice.create({
    data: {
      invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      memberId,
      paymentId,
      subtotal: amount,
      discount: 0,
      total: amount,
      status: "ISSUED",
      issuedAt: new Date(),
    },
  });
}

export async function createPayment(data: any, createdById: string) {
  // Resolve member
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: data.memberId }, { userId: data.memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  if (data.subscriptionId) {
    const sub = await prisma.membershipSubscription.findUnique({
      where: { id: data.subscriptionId },
    });
    if (!sub) throw new AppError("Subscription not found", 404);
    if (sub.memberId !== memberProfile.id) {
      throw new AppError("Subscription belongs to a different member", 400);
    }
  }

  // Wrap in transaction for BR-05 (atomicity)
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        memberId: memberProfile.id,
        subscriptionId: data.subscriptionId,
        amount: data.amount,
        method: data.method,
        status: data.status ?? "SUCCESS",
        note: data.note,
        transactionCode: data.transactionCode,
        paidAt: (data.status ?? "SUCCESS") === "SUCCESS" ? new Date() : undefined,
        createdById,
      },
      include: { member: { include: { user: { select: { fullName: true } } } } },
    });

    let invoice = null;
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
    }
    return { ...payment, invoice };
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
        subscription: { include: { plan: { select: { name: true, tier: true } } } },
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
      subscription: { include: { plan: true } },
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
