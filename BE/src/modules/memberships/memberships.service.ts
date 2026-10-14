import { Payment, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { buildSepayPaymentCode, buildVietQrUrl, isSepayConfigured, sepayConfig } from "../../config/sepay.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { ROLE_NAME_SELECT } from "../../utils/roles.js";
import { enqueueNotification } from "../notifications/outbox.service.js";
import { buildSepayCheckoutView, SEPAY_GATEWAY, SEPAY_PENDING_CODE } from "../payments/sepay-payments.service.js";
import type { CreatePlanInput, MembershipQueryInput } from "./memberships.schema.js";

/**
 * Giao dịch mua gói thành viên được nhận diện qua `Payment.note = "MEMBERSHIP_PLAN:<planId>"`
 * (không có classId / orderId). Membership chỉ được tạo khi SePay xác nhận đã thu tiền.
 */
export const MEMBERSHIP_NOTE_PREFIX = "MEMBERSHIP_PLAN:";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số tiền VND (số nguyên) — Decimal của Prisma trả về string. */
function money(value: unknown): number {
  return Math.round(Number(value));
}

function daysLeft(endDate: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / DAY_MS));
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/**
 * planId của giao dịch mua gói. Đọc từ `note`; dự phòng `gatewayPayload.membershipPlanId`
 * vì một số nhánh đối soát (VD lệch số tiền) ghi đè `note`.
 */
export function membershipPlanIdOf(payment: Pick<Payment, "note" | "gatewayPayload">): string | null {
  const note = payment.note ?? "";
  if (note.startsWith(MEMBERSHIP_NOTE_PREFIX)) {
    const id = note.slice(MEMBERSHIP_NOTE_PREFIX.length).split(/\s/)[0];
    if (id) return id;
  }
  const payload = payment.gatewayPayload as { membershipPlanId?: unknown } | null;
  return typeof payload?.membershipPlanId === "string" ? payload.membershipPlanId : null;
}

export function isMembershipPayment(
  payment: Pick<Payment, "note" | "gatewayPayload" | "classId" | "orderId">
): boolean {
  return !payment.classId && !payment.orderId && membershipPlanIdOf(payment) !== null;
}

/** Đánh dấu EXPIRED cho các membership ACTIVE đã quá `endDate` (tuỳ chọn: chỉ của một hội viên). */
async function expireMemberships(memberId?: string) {
  await prisma.membership.updateMany({
    where: { status: "ACTIVE", endDate: { lte: new Date() }, ...(memberId ? { memberId } : {}) },
    data: { status: "EXPIRED" },
  });
}

const membershipInclude = { plan: true } satisfies Prisma.MembershipInclude;
type MembershipWithPlan = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;

function planView(p: {
  id: string;
  name: string;
  durationDays: number;
  price: unknown;
  description: string | null;
  isActive: boolean;
}) {
  return {
    id: p.id,
    name: p.name,
    durationDays: p.durationDays,
    price: money(p.price),
    description: p.description,
    isActive: p.isActive,
  };
}

function membershipView(m: MembershipWithPlan, now = new Date()) {
  return {
    id: m.id,
    status: m.status,
    startDate: m.startDate,
    endDate: m.endDate,
    daysLeft: m.status === "ACTIVE" ? daysLeft(m.endDate, now) : 0,
    paymentId: m.paymentId,
    plan: planView(m.plan),
  };
}

/** Membership đang hiệu lực (gói xa nhất nếu có cộng dồn) + gói đã hết hạn gần nhất. */
async function findMembershipState(memberId: string) {
  await expireMemberships(memberId);
  const [active, recentExpired] = await Promise.all([
    prisma.membership.findFirst({
      where: { memberId, status: "ACTIVE", endDate: { gt: new Date() } },
      include: membershipInclude,
      orderBy: { endDate: "desc" },
    }),
    prisma.membership.findFirst({
      where: { memberId, status: "EXPIRED" },
      include: membershipInclude,
      orderBy: { endDate: "desc" },
    }),
  ]);
  return { active, recentExpired };
}

// ── Gói ──────────────────────────────────────────────────────────────────────

/** Các gói đang bán (rẻ → đắt). */
export async function listPlans() {
  const plans = await prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { price: "asc" } });
  return plans.map(planView);
}

/** MANAGER tạo gói mới. */
export async function createPlan(data: CreatePlanInput) {
  const plan = await prisma.membershipPlan.create({
    data: {
      name: data.name,
      durationDays: data.durationDays,
      price: data.price,
      description: data.description ?? null,
    },
  });
  return planView(plan);
}

/** MANAGER bật/tắt gói (bỏ trống `isActive` ⇒ đảo trạng thái). Gói tắt không bán nữa, gói đã mua vẫn giữ. */
export async function togglePlan(planId: string, isActive?: boolean) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("Membership plan not found", 404);
  const updated = await prisma.membershipPlan.update({
    where: { id: planId },
    data: { isActive: isActive ?? !plan.isActive },
  });
  return planView(updated);
}

// ── Mua gói ──────────────────────────────────────────────────────────────────

async function planInfoOf(payment: Pick<Payment, "note" | "gatewayPayload">) {
  const planId = membershipPlanIdOf(payment);
  const plan = planId ? await prisma.membershipPlan.findUnique({ where: { id: planId } }) : null;
  return plan ? { planName: plan.name, durationDays: plan.durationDays } : null;
}

/** Tên gói của giao dịch mua gói (màn thanh toán / lịch sử) — null nếu không phải giao dịch gói. */
export async function membershipPlanNameOf(
  payment: Pick<Payment, "note" | "gatewayPayload" | "classId" | "orderId">
): Promise<string | null> {
  if (!isMembershipPayment(payment)) return null;
  return (await planInfoOf(payment))?.planName ?? null;
}

/**
 * MEMBER mua gói bằng chuyển khoản VietQR (SePay): tạo `Payment` PENDING (không classId/orderId,
 * `note = MEMBERSHIP_PLAN:<planId>`) rồi trả QR. Membership được cấp khi webhook xác nhận đã thu tiền.
 *
 * - 404: không thấy gói / gói đã tắt.
 * - 409 `SEPAY_PAYMENT_PENDING`: còn giao dịch mua gói chưa hết hạn (trả kèm QR để FE tiếp tục).
 * - 503: chưa cấu hình tài khoản nhận tiền.
 */
export async function purchaseMembership(userId: string, planId: string) {
  const cfg = sepayConfig();
  if (!isSepayConfigured()) {
    throw new AppError(
      "Cổng thanh toán SePay chưa được cấu hình. Vui lòng thanh toán tại quầy hoặc liên hệ quản lý.",
      503,
      { code: "SEPAY_NOT_CONFIGURED", gateway: SEPAY_GATEWAY }
    );
  }

  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
    include: { user: { select: { isActive: true, role: ROLE_NAME_SELECT } } },
  });
  if (!memberProfile) throw new AppError("Member profile not found", 404);
  if (!memberProfile.user.isActive || memberProfile.user.role.name !== "MEMBER") {
    throw new AppError("Cannot purchase: user is not an active MEMBER", 400);
  }

  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) throw new AppError("Membership plan not found or inactive", 404);

  // Mỗi hội viên chỉ có 1 giao dịch mua gói đang chờ ⇒ tránh chuyển tiền 2 lần.
  const now = new Date();
  const pending = await prisma.payment.findFirst({
    where: {
      memberId: memberProfile.id,
      classId: null,
      orderId: null,
      gateway: SEPAY_GATEWAY,
      status: "PENDING",
      note: { startsWith: MEMBERSHIP_NOTE_PREFIX },
    },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    const view = buildSepayCheckoutView(pending, null);
    if (view.expiresAt.getTime() > now.getTime()) {
      throw new AppError(
        "Bạn đang có giao dịch mua gói thành viên chờ thanh toán. " +
          `Vui lòng hoàn tất hoặc thử lại sau ${Math.max(1, Math.ceil((view.expiresAt.getTime() - now.getTime()) / 60000))} phút.`,
        409,
        { code: SEPAY_PENDING_CODE, ...view, ...(await planInfoOf(pending)) }
      );
    }
    // Quá TTL: đóng giao dịch cũ (giữ tiền tố để tiền về muộn vẫn tra được gói khi đối soát).
    await prisma.payment.update({
      where: { id: pending.id },
      data: {
        status: "FAILED",
        note: `${pending.note} | Hết hạn chờ thanh toán — giao dịch bị đóng để tạo giao dịch mới.`,
      },
    });
  }

  const amount = money(plan.price);
  let payment: Payment | null = null;
  for (let attempt = 0; attempt < 5 && !payment; attempt++) {
    const orderCode = buildSepayPaymentCode(cfg);
    const qrUrl = buildVietQrUrl({ amount, content: orderCode });
    try {
      payment = await prisma.payment.create({
        data: {
          memberId: memberProfile.id,
          amount,
          method: "SEPAY",
          status: "PENDING",
          transactionCode: orderCode,
          gateway: SEPAY_GATEWAY,
          note: `${MEMBERSHIP_NOTE_PREFIX}${plan.id}`,
          gatewayPayload: {
            provider: SEPAY_GATEWAY,
            orderCode,
            qrUrl,
            transferContent: orderCode,
            bankId: cfg.bankId,
            accountNo: cfg.accountNo,
            membershipPlanId: plan.id,
          },
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (!payment) {
    throw new AppError("Không tạo được mã thanh toán (trùng mã). Vui lòng thử lại.", 500, {
      code: "SEPAY_CODE_COLLISION",
      gateway: SEPAY_GATEWAY,
    });
  }

  return { ...buildSepayCheckoutView(payment, null), planName: plan.name, durationDays: plan.durationDays };
}

/**
 * Cấp gói sau khi SePay xác nhận đã thu tiền (gọi trong transaction chốt webhook/đối soát):
 * tạo `Membership` + Payment → SUCCESS/ACTIVATED + thông báo hội viên.
 *
 * Còn gói ACTIVE chưa hết hạn ⇒ cộng dồn: gói mới bắt đầu tại `endDate` xa nhất hiện có.
 * Ném `AppError` khi không cấp được (gói bị xoá, không có hội viên) ⇒ caller chuyển REQUIRES_REVIEW.
 */
export async function activateMembership(
  tx: Prisma.TransactionClient,
  payment: Payment,
  extra: Prisma.PaymentUpdateInput = {}
) {
  const planId = membershipPlanIdOf(payment);
  const plan = planId ? await tx.membershipPlan.findUnique({ where: { id: planId } }) : null;
  if (!plan) throw new AppError("Không tìm thấy gói thành viên của giao dịch.", 409);
  const member = payment.memberId
    ? await tx.memberProfile.findUnique({ where: { id: payment.memberId }, select: { id: true, userId: true } })
    : null;
  if (!member) throw new AppError("Giao dịch mua gói không gắn với hội viên.", 409);

  const now = new Date();
  // Đã cấp cho giao dịch này (VD kích hoạt bù) ⇒ không tạo lần nữa.
  const existing = await tx.membership.findUnique({ where: { paymentId: payment.id } });
  let membership = existing;
  if (!membership) {
    const latest = await tx.membership.findFirst({
      where: { memberId: member.id, status: "ACTIVE", endDate: { gt: now } },
      orderBy: { endDate: "desc" },
    });
    const startDate = latest ? latest.endDate : now;
    membership = await tx.membership.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        paymentId: payment.id,
        startDate,
        endDate: new Date(startDate.getTime() + plan.durationDays * DAY_MS),
        status: "ACTIVE",
      },
    });
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      ...extra,
      status: "SUCCESS",
      paidAt: payment.paidAt ?? now,
      activationStatus: "ACTIVATED",
    },
  });
  if (!existing) {
    const until = membership.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    await enqueueNotification(tx, {
      userId: member.userId,
      type: "PAYMENT_SUCCESS",
      title: "Mua gói thành viên thành công",
      body: `Bạn đã thanh toán ${money(payment.amount).toLocaleString("vi-VN")}đ cho "${plan.name}". Gói có hiệu lực đến ${until}.`,
      metadata: { paymentId: payment.id, membershipId: membership.id },
    });
  }
  return membership;
}

// ── Tra cứu ──────────────────────────────────────────────────────────────────

/** MEMBER/COACH: gói đang hiệu lực của tôi (HLV không có hồ sơ hội viên ⇒ null). */
export async function getMyMembership(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) return { membership: null, recentExpired: null };
  const { active, recentExpired } = await findMembershipState(memberProfile.id);
  return {
    membership: active ? membershipView(active) : null,
    recentExpired: recentExpired ? membershipView(recentExpired) : null,
  };
}

/** COACH/MANAGER quét QR (= userId) của hội viên ⇒ gói còn hay hết hạn. */
export async function verifyMembership(targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, fullName: true, avatarUrl: true, memberProfile: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);
  const userView = { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl };
  if (!user.memberProfile) return { user: userView, membership: null, isActive: false };

  const { active, recentExpired } = await findMembershipState(user.memberProfile.id);
  const shown = active ?? recentExpired;
  return {
    user: userView,
    membership: shown
      ? {
          status: shown.status,
          planName: shown.plan.name,
          startDate: shown.startDate,
          endDate: shown.endDate,
          daysLeft: active ? daysLeft(active.endDate) : 0,
        }
      : null,
    isActive: active !== null,
  };
}

/** MANAGER: danh sách membership (lọc trạng thái, phân trang). */
export async function listMemberships(query: MembershipQueryInput) {
  await expireMemberships();
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const where: Prisma.MembershipWhereInput = query.status ? { status: query.status } : {};
  const [total, rows] = await Promise.all([
    prisma.membership.count({ where }),
    prisma.membership.findMany({
      where,
      include: {
        ...membershipInclude,
        member: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const memberships = rows.map((m) => ({ ...membershipView(m), member: { id: m.member.id, user: m.member.user } }));
  return { memberships, pagination: buildPaginationMeta(total, page, limit) };
}
