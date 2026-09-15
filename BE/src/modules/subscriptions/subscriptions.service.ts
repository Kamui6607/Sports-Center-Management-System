import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { CreateSubscriptionInput, RenewSubscriptionInput } from "./subscriptions.schema.js";

async function autoCreateInvoice(
  memberId: string,
  paymentId: string,
  amount: number
) {
  await prisma.invoice.create({
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

export async function createSubscription(
  data: CreateSubscriptionInput,
  createdById: string
) {
  // Resolve member (accept userId or profileId)
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: data.memberId }, { userId: data.memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  const plan = await prisma.membershipPlan.findUnique({ where: { id: data.planId } });
  if (!plan || !plan.isActive) throw new AppError("Membership plan not found or inactive", 404);

  // Suspend existing ACTIVE subscriptions
  await prisma.membershipSubscription.updateMany({
    where: { memberId: memberProfile.id, status: "ACTIVE" },
    data: { status: "SUSPENDED" },
  });

  const startDate = data.startDate ? new Date(data.startDate) : new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const subscription = await prisma.membershipSubscription.create({
    data: {
      memberId: memberProfile.id,
      planId: plan.id,
      tier: plan.tier,
      startDate,
      endDate,
      status: "ACTIVE",
    },
    include: { plan: true },
  });

  // Create payment
  const payment = await prisma.payment.create({
    data: {
      memberId: memberProfile.id,
      subscriptionId: subscription.id,
      amount: plan.price,
      method: data.paymentMethod,
      status: "SUCCESS",
      paidAt: new Date(),
      note: data.note,
      createdById,
    },
  });

  // Auto-create invoice
  await autoCreateInvoice(memberProfile.id, payment.id, Number(plan.price));

  return { subscription, payment };
}

export async function renewSubscription(
  subscriptionId: string,
  data: RenewSubscriptionInput,
  createdById: string
) {
  const existing = await prisma.membershipSubscription.findUnique({
    where: { id: subscriptionId },
    include: { member: true },
  });
  if (!existing) throw new AppError("Subscription not found", 404);

  const plan = await prisma.membershipPlan.findUnique({ where: { id: data.planId } });
  if (!plan || !plan.isActive) throw new AppError("Membership plan not found or inactive", 404);

  // New start: after existing endDate if still active, else now
  const now = new Date();
  const startDate =
    existing.status === "ACTIVE" && existing.endDate > now ? existing.endDate : now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const subscription = await prisma.membershipSubscription.create({
    data: {
      memberId: existing.memberId,
      planId: plan.id,
      tier: plan.tier,
      startDate,
      endDate,
      status: "ACTIVE",
    },
    include: { plan: true },
  });

  const payment = await prisma.payment.create({
    data: {
      memberId: existing.memberId,
      subscriptionId: subscription.id,
      amount: plan.price,
      method: data.paymentMethod,
      status: "SUCCESS",
      paidAt: new Date(),
      note: data.note,
      createdById,
    },
  });

  await autoCreateInvoice(existing.memberId, payment.id, Number(plan.price));

  return { subscription, payment };
}

export async function getMemberSubscriptions(memberId: string, query: any) {
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: memberId }, { userId: memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;

  const [total, subscriptions] = await Promise.all([
    prisma.membershipSubscription.count({ where }),
    prisma.membershipSubscription.findMany({
      where,
      skip,
      take: limit,
      include: { plan: true, payments: { include: { invoice: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { subscriptions, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getSubscriptionById(id: string) {
  const sub = await prisma.membershipSubscription.findUnique({
    where: { id },
    include: {
      plan: true,
      member: { include: { user: { select: { fullName: true, email: true } } } },
      payments: { include: { invoice: true } },
    },
  });
  if (!sub) throw new AppError("Subscription not found", 404);
  return sub;
}

export async function updateSubscriptionStatus(id: string, status: string) {
  const sub = await prisma.membershipSubscription.findUnique({ where: { id } });
  if (!sub) throw new AppError("Subscription not found", 404);
  return prisma.membershipSubscription.update({
    where: { id },
    data: { status: status as any },
    include: { plan: true },
  });
}
