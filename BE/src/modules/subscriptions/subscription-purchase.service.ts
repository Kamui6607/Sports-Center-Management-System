import { MembershipPlan, MembershipSubscription, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { createNotification } from "../notifications/notifications.service.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Thứ tự hạng gói — dùng để chặn hạ hạng khi mua gói mới. */
export const TIER_VALUE: Record<string, number> = { FREE: 0, MEMBERSHIP: 1, PREMIUM: 2 };

/** Số tiền phải thu của một gói (VND, số nguyên) — nguồn duy nhất cho mọi kênh thanh toán. */
export function planAmount(plan: MembershipPlan): number {
  return Math.round(Number(plan.price));
}

export interface PlanPurchaseContext {
  /** Gói ACTIVE hiện tại (nếu có) — sẽ bị SUSPEND khi gói mới được kích hoạt. */
  currentActive: MembershipSubscription | null;
  isUpgrade: boolean;
  oldPlanName: string;
  /** Số ngày còn dư của gói cũ, được cộng dồn vào gói mới. */
  remainingDays: number;
}

/**
 * ĐỌC-ONLY: kiểm tra luật mua gói so với gói đang ACTIVE và tính context.
 *
 * - Không cho hạ hạng: tier mới thấp hơn tier ACTIVE ⇒ 400.
 * - Cùng hạng: không cho mua gói ít ngày hơn gói đang dùng ⇒ 400.
 *
 * Dùng để "fail fast" trước khi tạo giao dịch online (không tạo Payment rác),
 * còn lúc chốt giao dịch thì `applyPlanSwitchRules` chạy lại trong transaction.
 */
export async function inspectPlanPurchase(
  db: DbClient,
  memberProfileId: string,
  plan: MembershipPlan,
  now: Date = new Date()
): Promise<PlanPurchaseContext> {
  const currentActive = await db.membershipSubscription.findFirst({
    where: { memberId: memberProfileId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  if (!currentActive) {
    return { currentActive: null, isUpgrade: false, oldPlanName: "", remainingDays: 0 };
  }

  const currentTierVal = TIER_VALUE[currentActive.tier] ?? 0;
  const newTierVal = TIER_VALUE[plan.tier] ?? 0;

  if (newTierVal < currentTierVal) {
    throw new AppError(
      "Không thể mua gói thấp hơn hạng hiện tại. Bạn chỉ có thể nâng cấp.",
      400
    );
  }
  if (newTierVal === currentTierVal && plan.durationDays < currentActive.plan.durationDays) {
    throw new AppError(
      `Bạn đang dùng gói ${currentActive.plan.durationDays} ngày. Không thể mua gói ${plan.durationDays} ngày cùng hạng.`,
      400
    );
  }

  const remainingDays =
    currentActive.endDate > now
      ? Math.ceil((currentActive.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

  return {
    currentActive,
    isUpgrade: newTierVal > currentTierVal,
    oldPlanName: currentActive.plan.name,
    remainingDays,
  };
}

/**
 * `inspectPlanPurchase` + SUSPEND gói ACTIVE cũ. BẮT BUỘC gọi trong transaction ghi
 * (thứ tự: kiểm tra luật → suspend gói cũ → tạo gói mới).
 */
export async function applyPlanSwitchRules(
  tx: Prisma.TransactionClient,
  memberProfileId: string,
  plan: MembershipPlan,
  now: Date = new Date()
): Promise<PlanPurchaseContext> {
  const context = await inspectPlanPurchase(tx, memberProfileId, plan, now);

  if (context.currentActive) {
    await tx.membershipSubscription.update({
      where: { id: context.currentActive.id },
      data: { status: "SUSPENDED", suspendedAt: now },
    });
  }

  return context;
}

export interface ActivateSubscriptionParams {
  memberProfileId: string;
  /** userId của hội viên — nơi gửi notification PAYMENT_SUCCESS. */
  memberUserId: string;
  /** Tên hội viên cho snapshot BR-25 trên Invoice. */
  memberName?: string | null;
  plan: MembershipPlan;
  /** Payment đã tồn tại (PENDING) — sẽ được chốt SUCCESS + gắn subscriptionId. */
  paymentId: string;
  /** Ngày bắt đầu gói (mặc định = now). Quầy có thể chỉ định tương lai; SePay online luôn dùng now. */
  startDate?: Date;
  now?: Date;
}

/**
 * CHỐT GIAO DỊCH MUA GÓI — dùng chung cho quầy (CASH/BANK_TRANSFER) và SePay online.
 *
 * Trong CÙNG transaction:
 * 1. Áp luật đổi gói (chặn hạ hạng) + suspend gói ACTIVE cũ (`applyPlanSwitchRules`).
 * 2. Tạo `MembershipSubscription` ACTIVE: startDate = now, endDate = now + durationDays + số ngày dư.
 * 3. Cập nhật Payment → `SUCCESS`, `paidAt`, gắn `subscriptionId`.
 * 4. Tạo Invoice kèm snapshot BR-25 (memberName/planName/planTier).
 * 5. Gửi notification `PAYMENT_SUCCESS` (fire-and-forget, không làm fail transaction).
 */
export async function activateSubscriptionForPayment(
  tx: Prisma.TransactionClient,
  params: ActivateSubscriptionParams
) {
  const now = params.now ?? new Date();
  const { plan } = params;

  const context = await applyPlanSwitchRules(tx, params.memberProfileId, plan, now);

  const startDate = params.startDate ?? now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays + context.remainingDays);

  const subscription = await tx.membershipSubscription.create({
    data: {
      memberId: params.memberProfileId,
      planId: plan.id,
      tier: plan.tier,
      startDate,
      endDate,
      status: "ACTIVE",
    },
    include: { plan: true },
  });

  const payment = await tx.payment.update({
    where: { id: params.paymentId },
    data: {
      status: "SUCCESS",
      paidAt: now,
      subscriptionId: subscription.id,
    },
  });

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      memberId: params.memberProfileId,
      paymentId: payment.id,
      subtotal: Number(plan.price),
      discount: 0,
      total: Number(plan.price),
      status: "ISSUED",
      issuedAt: now,
      memberName: params.memberName ?? null,
      planName: plan.name,
      planTier: plan.tier,
    },
  });

  if (context.isUpgrade) {
    createNotification(
      params.memberUserId,
      "PAYMENT_SUCCESS",
      "Nâng cấp gói thành công!",
      `Chúc mừng bạn đã nâng cấp thành công từ gói ${context.oldPlanName} lên ${plan.name} (${plan.tier}). Số ngày sử dụng còn dư đã được cộng dồn vào thời hạn gói mới.`,
      { metadata: { subscriptionId: subscription.id, paymentId: payment.id } }
    ).catch(() => {});
  } else {
    createNotification(
      params.memberUserId,
      "PAYMENT_SUCCESS",
      "Đăng ký gói thành công!",
      `Gói ${plan.name} (${plan.tier}) của bạn đã được kích hoạt thành công. ${context.remainingDays > 0 ? "Thời gian dư từ gói cũ đã được cộng dồn." : ""}`,
      { metadata: { subscriptionId: subscription.id, paymentId: payment.id } }
    ).catch(() => {});
  }

  return { subscription, payment, invoice, context };
}

