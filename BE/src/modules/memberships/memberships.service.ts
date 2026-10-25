import { Payment, Prisma } from "@prisma/client";
import { buildMembershipSnapshot, buildPartySnapshot, readMembershipSnapshot } from "../payments/purchase-snapshot.js";
import { prisma } from "../../config/prisma.js";
import { buildSepayPaymentCode, buildVietQrUrl, isSepayConfigured, sepayConfig } from "../../config/sepay.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { ROLE_NAME_SELECT } from "../../utils/roles.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { buildSepayCheckoutView, SEPAY_GATEWAY, SEPAY_PENDING_CODE } from "../payments/sepay-payments.service.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { CancelMembershipInput, CreatePlanInput, MembershipQueryInput } from "./memberships.schema.js";

/**
 * Giao dịch mua gói thành viên được nhận diện qua `Payment.note = "MEMBERSHIP_PLAN:<planId>"`
 * (không có classId / orderId). Membership chỉ được tạo khi SePay xác nhận đã thu tiền.
 */
export const MEMBERSHIP_NOTE_PREFIX = "MEMBERSHIP_PLAN:";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Số gói mua trước (xếp hàng) tối đa một hội viên giữ cùng lúc. */
export const MAX_QUEUED_MEMBERSHIPS = 3;
/** Thời gian sống của mã QR động trên thẻ thành viên (giây) — app tự làm mới. */
export const MEMBER_PASS_TTL_SECONDS = 60;

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

const membershipInclude = {
  plan: true,
  payment: { select: { amount: true, purchaseSnapshot: true, paidAt: true, transactionCode: true } },
} satisfies Prisma.MembershipInclude;
type MembershipWithPlan = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;

function planView(p: {
  id: string;
  name: string;
  durationDays: number;
  price: unknown;
  description: string | null;
  isActive: boolean;
  benefits?: string[];
  isFeatured?: boolean;
  sortOrder?: number;
}) {
  const price = money(p.price);
  return {
    id: p.id,
    name: p.name,
    durationDays: p.durationDays,
    price,
    /** Giá quy đổi 30 ngày — để hội viên so sánh các gói. */
    pricePer30Days: p.durationDays > 0 ? Math.round((price * 30) / p.durationDays) : price,
    description: p.description,
    isActive: p.isActive,
    benefits: p.benefits ?? [],
    isFeatured: p.isFeatured ?? false,
    sortOrder: p.sortOrder ?? 0,
  };
}

const spanDays = (m: { startDate: Date; endDate: Date }) => Math.round((m.endDate.getTime() - m.startDate.getTime()) / DAY_MS);

function membershipView(m: MembershipWithPlan, now = new Date()) {
  // Tên/số ngày/giá theo ẢNH CHỤP lúc mua (gói có thể đã bị sửa sau đó).
  const snap = readMembershipSnapshot(m.payment?.purchaseSnapshot);
  const started = m.startDate <= now;
  return {
    id: m.id,
    status: m.status,
    startDate: m.startDate,
    endDate: m.endDate,
    /** Gói mua trước, chưa tới lượt dùng (bắt đầu khi gói hiện tại hết hạn). */
    isQueued: m.status === "ACTIVE" && !started,
    daysLeft: m.status === "ACTIVE" ? daysLeft(m.endDate, now) : 0,
    totalDays: spanDays(m),
    paymentId: m.paymentId,
    paidAmount: m.payment ? money(m.payment.amount) : null,
    paidAt: m.payment?.paidAt ?? null,
    cancelledAt: m.cancelledAt,
    cancelReason: m.cancelReason,
    plan: {
      ...planView(m.plan),
      name: snap?.name ?? m.plan.name,
      durationDays: snap?.durationDays ?? m.plan.durationDays,
      price: snap?.price ?? money(m.plan.price),
    },
  };
}

/** Các gói ACTIVE chưa hết hạn của hội viên (gói đang dùng + gói xếp hàng), sớm → muộn. */
async function findMembershipState(memberId: string, now = new Date()) {
  await expireMemberships(memberId);
  const [live, recentExpired] = await Promise.all([
    prisma.membership.findMany({
      where: { memberId, status: "ACTIVE", endDate: { gt: now } },
      include: membershipInclude,
      orderBy: { startDate: "asc" },
    }),
    prisma.membership.findFirst({
      where: { memberId, status: "EXPIRED" },
      include: membershipInclude,
      orderBy: { endDate: "desc" },
    }),
  ]);
  const current = live.find((m) => m.startDate <= now) ?? null;
  const queued = live.filter((m) => m.startDate > now);
  // Gói cho hạn dùng cuối cùng.
  const active = live.length ? live.reduce((x, y) => (y.endDate > x.endDate ? y : x)) : null;
  return { current, queued, active, recentExpired };
}

// ── Gói ──────────────────────────────────────────────────────────────────────

/** Các gói đang bán (theo thứ tự Manager đặt, rồi rẻ → đắt). */
export async function listPlans() {
  const plans = await prisma.membershipPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
  });
  return plans.map(planView);
}

/** MANAGER: mọi gói (cả gói đã tắt) + số liệu: hội viên đang dùng, lượt bán, doanh thu thực thu, đã hoàn. */
export async function listManagePlans() {
  const now = new Date();
  const plans = await prisma.membershipPlan.findMany({ orderBy: [{ sortOrder: "asc" }, { price: "asc" }] });
  const [activeRows, soldRows] = await Promise.all([
    prisma.membership.groupBy({
      by: ["planId"],
      where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gt: now } },
      _count: { _all: true },
    }),
    prisma.membership.findMany({
      where: { payment: { status: { in: ["SUCCESS", "REFUNDED"] } } },
      select: {
        planId: true,
        payment: { select: { amount: true, refunds: { where: { status: "COMPLETED" }, select: { amount: true } } } },
      },
    }),
  ]);
  return plans.map((p) => {
    const sold = soldRows.filter((r) => r.planId === p.id);
    const revenue = sold.reduce((sum, r) => sum + money(r.payment?.amount ?? 0), 0);
    const refunded = sold.reduce((sum, r) => sum + (r.payment?.refunds ?? []).reduce((x, y) => x + money(y.amount), 0), 0);
    return {
      ...planView(p),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      stats: {
        activeMembers: activeRows.find((r) => r.planId === p.id)?._count._all ?? 0,
        soldCount: sold.length,
        revenue,
        refunded,
        netRevenue: revenue - refunded,
      },
    };
  });
}

function planData(data: Partial<CreatePlanInput>) {
  const out: Prisma.MembershipPlanUpdateInput = {};
  if (data.name !== undefined) out.name = data.name;
  if (data.durationDays !== undefined) out.durationDays = data.durationDays;
  if (data.price !== undefined) out.price = data.price;
  if (data.description !== undefined) out.description = data.description || null;
  if (data.benefits !== undefined) out.benefits = data.benefits.map((x) => x.trim()).filter(Boolean);
  if (data.isFeatured !== undefined) out.isFeatured = data.isFeatured;
  if (data.sortOrder !== undefined) out.sortOrder = data.sortOrder;
  if (data.isActive !== undefined) out.isActive = data.isActive;
  return out;
}

async function assertUniquePlanName(name: string | undefined, exceptId?: string) {
  if (!name) return;
  const dup = await prisma.membershipPlan.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup) throw new AppError(`Đã có gói tên "${name}".`, 409, { code: "PLAN_NAME_TAKEN" });
}

/** MANAGER tạo gói mới. */
export async function createPlan(data: CreatePlanInput) {
  await assertUniquePlanName(data.name);
  const plan = await prisma.membershipPlan.create({
    data: {
      ...(planData(data) as Prisma.MembershipPlanCreateInput),
      name: data.name,
      durationDays: data.durationDays,
      price: data.price,
    },
  });
  return planView(plan);
}

/**
 * MANAGER sửa gói. Đổi giá / số ngày CHỈ áp dụng cho giao dịch mới — giao dịch cũ và giao dịch đang chờ chuyển khoản
 * dùng ảnh chụp lúc mua (`purchaseSnapshot`).
 */
export async function updatePlan(planId: string, data: Partial<CreatePlanInput>) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("Membership plan not found", 404);
  await assertUniquePlanName(data.name, planId);
  const updated = await prisma.membershipPlan.update({ where: { id: planId }, data: planData(data) });
  return planView(updated);
}

/** MANAGER xóa gói — chỉ khi chưa từng được mua / chưa có giao dịch; ngược lại hãy tắt bán (gói đã bán vẫn hiệu lực). */
export async function deletePlan(planId: string) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("Membership plan not found", 404);
  const [memberships, payments] = await Promise.all([
    prisma.membership.count({ where: { planId } }),
    prisma.payment.count({ where: { note: { startsWith: `${MEMBERSHIP_NOTE_PREFIX}${planId}` } } }),
  ]);
  if (memberships > 0 || payments > 0) {
    throw new AppError("Gói đã có người mua / có giao dịch — không thể xóa. Hãy tắt bán gói này.", 409, {
      code: "PLAN_IN_USE",
      memberships,
      payments,
    });
  }
  await prisma.membershipPlan.delete({ where: { id: planId } });
  return { id: planId, deleted: true };
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

async function planInfoOf(payment: Pick<Payment, "note" | "gatewayPayload"> & { purchaseSnapshot?: Prisma.JsonValue | null }) {
  // Ảnh chụp lúc mua thắng cấu hình gói hiện tại (đổi tên/số ngày sau này không ảnh hưởng giao dịch cũ).
  const snap = readMembershipSnapshot(payment.purchaseSnapshot);
  if (snap?.name && snap.durationDays) return { planName: snap.name, durationDays: snap.durationDays };
  const planId = membershipPlanIdOf(payment);
  const plan = planId ? await prisma.membershipPlan.findUnique({ where: { id: planId } }) : null;
  return plan ? { planName: plan.name, durationDays: plan.durationDays } : null;
}

/** Tên gói của giao dịch mua gói (màn thanh toán / lịch sử) — null nếu không phải giao dịch gói. */
export async function membershipPlanNameOf(
  payment: Pick<Payment, "note" | "gatewayPayload" | "classId" | "orderId"> & { purchaseSnapshot?: Prisma.JsonValue | null }
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

  const now = new Date();
  // Tối đa MAX_QUEUED_MEMBERSHIPS gói mua trước (chưa tới lượt dùng) — tránh bấm nhầm mua nhiều lần.
  const queuedCount = await prisma.membership.count({
    where: { memberId: memberProfile.id, status: "ACTIVE", startDate: { gt: now } },
  });
  if (queuedCount >= MAX_QUEUED_MEMBERSHIPS) {
    throw new AppError(
      `Bạn đã mua trước ${queuedCount} gói chưa dùng tới. Vui lòng mua thêm khi các gói này bắt đầu.`,
      409,
      { code: "MEMBERSHIP_QUEUE_LIMIT", max: MAX_QUEUED_MEMBERSHIPS }
    );
  }

  // Mỗi hội viên chỉ có 1 giao dịch mua gói đang chờ ⇒ tránh chuyển tiền 2 lần.
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
          // Ảnh chụp gói tại thời điểm mua — đổi giá/tên gói sau này không ảnh hưởng giao dịch cũ.
          purchaseSnapshot: { ...buildMembershipSnapshot(plan, await buildPartySnapshot(prisma, userId)) },
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
    // Số ngày theo ẢNH CHỤP lúc mua (Manager sửa gói trong lúc khách chờ chuyển khoản không làm khách thiệt).
    const durationDays = readMembershipSnapshot(payment.purchaseSnapshot)?.durationDays ?? plan.durationDays;
    membership = await tx.membership.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        paymentId: payment.id,
        startDate,
        endDate: new Date(startDate.getTime() + durationDays * DAY_MS),
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
      body: `Bạn đã thanh toán ${money(payment.amount).toLocaleString("vi-VN")}đ cho "${readMembershipSnapshot(payment.purchaseSnapshot)?.name ?? plan.name}". Gói có hiệu lực đến ${until}.`,
      metadata: { paymentId: payment.id, membershipId: membership.id },
    });
  }
  return membership;
}

// ── Tra cứu ──────────────────────────────────────────────────────────────────

/** Tổng quan thẻ của hội viên: gói đang dùng, gói xếp hàng, hạn dùng cuối cùng. */
function overviewOf(state: Awaited<ReturnType<typeof findMembershipState>>, now = new Date()) {
  const validUntil = state.active?.endDate ?? null;
  return {
    /** Giữ tương thích: gói đang dùng (hoặc gói xếp hàng đầu tiên nếu chưa tới lượt). */
    membership: state.current ? membershipView(state.current, now) : state.queued[0] ? membershipView(state.queued[0], now) : null,
    current: state.current ? membershipView(state.current, now) : null,
    queued: state.queued.map((m) => membershipView(m, now)),
    /** Hạn dùng cuối cùng (đã gồm gói xếp hàng). */
    validUntil,
    totalDaysLeft: validUntil ? daysLeft(validUntil, now) : 0,
    recentExpired: state.recentExpired ? membershipView(state.recentExpired, now) : null,
    canQueueMore: state.queued.length < MAX_QUEUED_MEMBERSHIPS,
  };
}

/** MEMBER/COACH: thẻ thành viên của tôi (HLV không có hồ sơ hội viên ⇒ trống). */
export async function getMyMembership(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) {
    return { membership: null, current: null, queued: [], validUntil: null, totalDaysLeft: 0, recentExpired: null, canQueueMore: false };
  }
  return overviewOf(await findMembershipState(memberProfile.id));
}

/** MEMBER: lịch sử mọi gói đã mua (mới → cũ), tên/giá theo ảnh chụp lúc mua. */
export async function listMyMembershipHistory(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) return [];
  await expireMemberships(memberProfile.id);
  const rows = await prisma.membership.findMany({
    where: { memberId: memberProfile.id },
    include: membershipInclude,
    orderBy: { startDate: "desc" },
  });
  return rows.map((m) => membershipView(m));
}

// ── Thẻ thành viên: mã QR động + quét ở cửa ───────────────────────────────────

interface MemberPassPayload {
  type: "MEMBER_PASS";
  memberId: string;
  userId: string;
}

/** MEMBER: cấp mã QR động (JWT sống 60 giây) cho thẻ thành viên — ảnh chụp màn hình hết hạn sau 1 phút. */
export async function issueMemberPass(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);
  const payload: MemberPassPayload = { type: "MEMBER_PASS", memberId: memberProfile.id, userId };
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: MEMBER_PASS_TTL_SECONDS });
  const overview = overviewOf(await findMembershipState(memberProfile.id));
  return {
    token,
    expiresIn: MEMBER_PASS_TTL_SECONDS,
    expiresAt: new Date(Date.now() + MEMBER_PASS_TTL_SECONDS * 1000),
    isActive: overview.current !== null,
    validUntil: overview.validUntil,
  };
}

/**
 * MANAGER/COACH quét mã QR động của hội viên ⇒ hợp lệ hay không + ghi nhật ký vào cửa.
 * Không tự khóa gì — người quét quyết định cho vào hay không.
 */
export async function verifyMemberPass(token: string, scannerUserId: string) {
  let payload: Partial<MemberPassPayload>;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<MemberPassPayload>;
  } catch (err) {
    if ((err as { name?: string }).name === "TokenExpiredError") {
      throw new AppError("Mã thẻ đã hết hạn. Nhờ hội viên mở lại thẻ trên ứng dụng.", 400, { code: "PASS_EXPIRED" });
    }
    throw new AppError("Mã thẻ không hợp lệ.", 400, { code: "PASS_INVALID" });
  }
  if (payload.type !== "MEMBER_PASS" || !payload.memberId) {
    throw new AppError("Mã thẻ không hợp lệ.", 400, { code: "PASS_INVALID" });
  }
  const member = await prisma.memberProfile.findUnique({
    where: { id: payload.memberId },
    select: { id: true, user: { select: { id: true, fullName: true, avatarUrl: true, isActive: true, phone: true } } },
  });
  if (!member) throw new AppError("Mã thẻ không hợp lệ.", 400, { code: "PASS_INVALID" });

  const now = new Date();
  const overview = overviewOf(await findMembershipState(member.id, now), now);
  let valid = true;
  let reason = "Gói thành viên còn hiệu lực.";
  if (!member.user.isActive) {
    valid = false;
    reason = "Tài khoản hội viên đang bị khóa.";
  } else if (!overview.current) {
    valid = false;
    reason = overview.recentExpired
      ? `Gói đã hết hạn ngày ${overview.recentExpired.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`
      : "Hội viên chưa có gói thành viên.";
  }
  const todayStart = new Date(`${new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`);
  const [scan, entriesToday] = await prisma.$transaction([
    prisma.memberPassScan.create({
      data: { memberId: member.id, membershipId: overview.current?.id ?? null, scannedBy: scannerUserId, valid, reason },
    }),
    prisma.memberPassScan.count({ where: { memberId: member.id, valid: true, createdAt: { gte: todayStart } } }),
  ]);
  return {
    valid,
    reason,
    scanId: scan.id,
    scannedAt: scan.createdAt,
    member: { id: member.id, userId: member.user.id, fullName: member.user.fullName, avatarUrl: member.user.avatarUrl },
    membership: overview.current
      ? { planName: overview.current.plan.name, endDate: overview.current.endDate, daysLeft: overview.current.daysLeft }
      : null,
    validUntil: overview.validUntil,
    totalDaysLeft: overview.totalDaysLeft,
    /** Số lượt vào hợp lệ trong hôm nay (gồm lượt này). */
    entriesToday: valid ? entriesToday + 1 : entriesToday,
  };
}

/** MANAGER: nhật ký quét thẻ hội viên. */
export async function listMemberPassScans(query: { page?: string; limit?: string; valid?: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const where: Prisma.MemberPassScanWhereInput = query.valid === undefined ? {} : { valid: query.valid === "true" };
  const [total, rows] = await Promise.all([
    prisma.memberPassScan.count({ where }),
    prisma.memberPassScan.findMany({
      where,
      include: {
        member: { select: { id: true, user: { select: { fullName: true, avatarUrl: true, email: true } } } },
        membership: { select: { id: true, endDate: true, plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { scans: rows, pagination: buildPaginationMeta(total, page, limit) };
}

/** MANAGER tra cứu nhanh theo userId (KHÔNG dùng để vào cửa — vào cửa dùng mã QR động `verifyMemberPass`). */
export async function verifyMembership(targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, fullName: true, avatarUrl: true, memberProfile: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);
  const userView = { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl };
  if (!user.memberProfile) return { user: userView, membership: null, isActive: false };

  const state = await findMembershipState(user.memberProfile.id);
  const shown = state.current ?? state.queued[0] ?? state.recentExpired;
  const view = shown ? membershipView(shown) : null;
  return {
    user: userView,
    membership: view
      ? {
          status: view.status,
          planName: view.plan.name,
          startDate: view.startDate,
          endDate: state.active?.endDate ?? view.endDate,
          daysLeft: state.active ? daysLeft(state.active.endDate) : 0,
        }
      : null,
    isActive: state.current !== null,
  };
}

/** MANAGER: danh sách membership (lọc trạng thái / gói / tìm hội viên, phân trang). */
export async function listMemberships(query: MembershipQueryInput) {
  await expireMemberships();
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const where: Prisma.MembershipWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.planId ? { planId: query.planId } : {}),
    ...(query.search
      ? {
          member: {
            user: {
              OR: [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search } },
              ],
            },
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.membership.count({ where }),
    prisma.membership.findMany({
      where,
      include: {
        ...membershipInclude,
        member: { include: { user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const memberships = rows.map((m) => ({
    ...membershipView(m),
    member: { id: m.member.id, user: m.member.user },
    refundableValue: refundableValueOf(m),
  }));
  return { memberships, pagination: buildPaginationMeta(total, page, limit) };
}

/** Giá trị còn lại của gói = tiền đã trả × (ngày chưa dùng ÷ tổng ngày) — trần của khoản hoàn khi Manager hủy. */
function refundableValueOf(m: { status: string; startDate: Date; endDate: Date; payment: { amount: unknown } | null }, now = new Date()) {
  if (m.status !== "ACTIVE" || !m.payment) return 0;
  const total = m.endDate.getTime() - m.startDate.getTime();
  if (total <= 0) return 0;
  const unused = m.endDate.getTime() - Math.max(now.getTime(), m.startDate.getTime());
  return Math.max(0, Math.floor((money(m.payment.amount) * unused) / total));
}

/**
 * MANAGER hủy gói của hội viên (chuyển nhượng, vi phạm nội quy…): gói → CANCELLED, các gói xếp hàng phía sau
 * dời lên đúng số ngày bị cắt; `refundAmount > 0` ⇒ tạo yêu cầu hoàn `MEMBERSHIP_CANCELLED` (tối đa giá trị còn lại)
 * đi qua luồng Hoàn tiền hiện có (Manager chuyển khoản rồi duyệt).
 */
export async function cancelMembership(membershipId: string, managerUserId: string, input: CancelMembershipInput) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({
      where: { id: membershipId },
      include: { ...membershipInclude, member: { select: { userId: true } } },
    });
    if (!m) throw new AppError("Membership not found", 404);
    if (m.status !== "ACTIVE" || m.endDate <= now) {
      throw new AppError("Chỉ hủy được gói đang hiệu lực hoặc đang xếp hàng.", 409, { code: "MEMBERSHIP_NOT_ACTIVE" });
    }
    const maxRefund = refundableValueOf(m, now);
    const refundAmount = input.refundAmount ?? 0;
    if (refundAmount > maxRefund) {
      throw new AppError(`Số tiền hoàn tối đa là ${maxRefund.toLocaleString("vi-VN")}đ (giá trị còn lại của gói).`, 400, {
        code: "REFUND_EXCEEDS_REMAINING",
        maxRefund,
      });
    }
    const cas = await tx.membership.updateMany({
      where: { id: m.id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason, cancelledById: managerUserId, endDate: m.startDate > now ? m.startDate : now },
    });
    if (cas.count === 0) throw new AppError("Gói đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409);

    // Dời các gói xếp hàng phía sau lên đúng phần thời gian bị cắt.
    const cutMs = m.endDate.getTime() - Math.max(now.getTime(), m.startDate.getTime());
    const later = await tx.membership.findMany({
      where: { memberId: m.memberId, status: "ACTIVE", startDate: { gte: m.endDate } },
      orderBy: { startDate: "asc" },
    });
    for (const l of later) {
      await tx.membership.update({
        where: { id: l.id },
        data: { startDate: new Date(l.startDate.getTime() - cutMs), endDate: new Date(l.endDate.getTime() - cutMs), reminderStage: 0 },
      });
    }

    let refund: { id: string; amount: number } | null = null;
    if (refundAmount > 0 && m.paymentId) {
      const created = await tx.refund.create({
        data: {
          paymentId: m.paymentId,
          memberId: m.memberId,
          reason: "MEMBERSHIP_CANCELLED",
          amount: refundAmount,
          note: `Hủy gói "${readMembershipSnapshot(m.payment?.purchaseSnapshot)?.name ?? m.plan.name}": ${input.reason}`,
          requestedById: managerUserId,
        },
        select: { id: true, amount: true },
      });
      refund = { id: created.id, amount: money(created.amount) };
    }
    await enqueueNotification(tx, {
      userId: m.member.userId,
      type: "GENERAL",
      title: "Gói thành viên đã bị hủy",
      body:
        `Gói "${readMembershipSnapshot(m.payment?.purchaseSnapshot)?.name ?? m.plan.name}" đã được trung tâm hủy. Lý do: ${input.reason}.` +
        (refund ? ` Bạn sẽ được hoàn ${refund.amount.toLocaleString("vi-VN")}đ — vui lòng cập nhật số tài khoản trong mục Hoàn tiền.` : ""),
      metadata: { kind: "MEMBERSHIP_CANCELLED", membershipId: m.id, refundId: refund?.id ?? null },
    });
    return { membershipId: m.id, refund, shiftedQueued: later.length, maxRefund };
  });
  await flushNotificationOutbox().catch(() => {});
  return result;
}

// ── Job: hết hạn + nhắc gia hạn ──────────────────────────────────────────────

/** Bậc nhắc (`Membership.reminderStage`). */
const REMIND = { DAYS_7: 1, DAYS_1: 2, EXPIRED: 3 } as const;

/**
 * Job gói thành viên (idempotent theo CAS `reminderStage`): nhắc khi hạn dùng CUỐI CÙNG (không có gói nối tiếp)
 * còn 7 ngày / 1 ngày; hết hạn ⇒ EXPIRED + thông báo.
 */
export async function runMembershipMaintenance(now = new Date()) {
  const result = { remindedDays7: 0, remindedDays1: 0, expired: 0 };
  // Hết hạn: gửi thông báo cho gói ACTIVE vừa quá hạn (trước khi chuyển EXPIRED).
  const expiring = await prisma.membership.findMany({
    where: { status: "ACTIVE", endDate: { lte: now }, reminderStage: { lt: REMIND.EXPIRED } },
    include: { ...membershipInclude, member: { select: { id: true, userId: true } } },
  });
  for (const m of expiring) {
    const hasNext = await prisma.membership.count({
      where: { memberId: m.memberId, status: "ACTIVE", id: { not: m.id }, endDate: { gt: now } },
    });
    const done = await prisma.$transaction(async (tx) => {
      const cas = await tx.membership.updateMany({
        where: { id: m.id, reminderStage: { lt: REMIND.EXPIRED } },
        data: { reminderStage: REMIND.EXPIRED, status: "EXPIRED" },
      });
      if (cas.count === 0) return false;
      if (hasNext === 0) {
        await enqueueNotification(tx, {
          userId: m.member.userId,
          type: "GENERAL",
          title: "Gói thành viên đã hết hạn",
          body: `Gói "${readMembershipSnapshot(m.payment?.purchaseSnapshot)?.name ?? m.plan.name}" đã hết hạn. Gia hạn ngay để tiếp tục tập luyện.`,
          metadata: { kind: "MEMBERSHIP_EXPIRED", membershipId: m.id },
        });
      }
      return true;
    });
    if (done) result.expired++;
  }
  await expireMemberships();

  // Nhắc gia hạn theo hạn dùng cuối cùng của từng hội viên.
  const live = await prisma.membership.findMany({
    where: { status: "ACTIVE", endDate: { gt: now } },
    include: { ...membershipInclude, member: { select: { userId: true } } },
    orderBy: { endDate: "desc" },
  });
  const lastByMember = new Map<string, (typeof live)[number]>();
  for (const m of live) if (!lastByMember.has(m.memberId)) lastByMember.set(m.memberId, m);
  for (const m of lastByMember.values()) {
    const left = m.endDate.getTime() - now.getTime();
    const stage = left <= DAY_MS ? REMIND.DAYS_1 : left <= 7 * DAY_MS ? REMIND.DAYS_7 : 0;
    if (stage === 0 || m.reminderStage >= stage) continue;
    const sent = await prisma.$transaction(async (tx) => {
      const cas = await tx.membership.updateMany({ where: { id: m.id, reminderStage: { lt: stage } }, data: { reminderStage: stage } });
      if (cas.count === 0) return false;
      const until = m.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      await enqueueNotification(tx, {
        userId: m.member.userId,
        type: "GENERAL",
        title: stage === REMIND.DAYS_1 ? "Gói thành viên hết hạn vào ngày mai" : "Gói thành viên sắp hết hạn",
        body: `Thẻ thành viên của bạn còn hiệu lực đến ${until}. Gia hạn trước để không bị gián đoạn — gói mới tự nối tiếp ngay khi gói hiện tại hết hạn.`,
        metadata: { kind: "MEMBERSHIP_EXPIRING", membershipId: m.id, stage },
      });
      return true;
    });
    if (sent) {
      if (stage === REMIND.DAYS_1) result.remindedDays1++;
      else result.remindedDays7++;
    }
  }
  await flushNotificationOutbox().catch(() => {});
  return result;
}
