import { Prisma, type OrderStatus } from "@prisma/client";
import { shopConfig } from "../../config/shop.js";
import { isUnpaidCash, managerTransitionsFor, orderStatusLabel } from "./order-state.js";
import { maskPhone, pickupCodeFor, pickupQrPayload } from "./pickup-code.js";
import { vnDateString } from "./pickup-schedule.js";

/** Số tiền VND (số nguyên) — Decimal của Prisma trả về object/string. */
export function money(value: unknown): number {
  return Math.round(Number(value ?? 0));
}

/**
 * Hạn "nhận trễ" của đơn tại quầy đã quá hạn (NOT_PICKED_UP): `notPickedUpAt + SHOP_LATE_PICKUP_DAYS`, chỉ khi
 * tiền chưa hoàn xong (không có Refund COMPLETED). null ⇒ không còn nhận trễ được.
 */
export function latePickupUntil(
  o: { status: OrderStatus; fulfillmentType: string; notPickedUpAt: Date | null },
  refunds: { status: string }[],
  now = new Date()
): Date | null {
  const days = shopConfig().latePickupDays;
  if (o.status !== "NOT_PICKED_UP" || o.fulfillmentType !== "PICKUP" || !o.notPickedUpAt || days <= 0) return null;
  if (refunds.some((r) => r.status === "COMPLETED")) return null;
  const until = new Date(o.notPickedUpAt.getTime() + days * 86_400_000);
  return until > now ? until : null;
}

/** Nhóm trạng thái cho tab "Đơn của tôi" / lọc của Manager. */
export const ORDER_STATUS_GROUPS: Record<string, OrderStatus[]> = {
  PENDING: ["PENDING_PAYMENT"],
  ACTIVE: ["CONFIRMED", "PAID", "PROCESSING", "READY_FOR_PICKUP", "SHIPPING", "DELIVERED", "REFUND_REQUESTED"],
  COMPLETED: ["COMPLETED"],
  CLOSED: ["EXPIRED", "CANCELLED", "NOT_PICKED_UP", "REFUNDED"],
};

export const ORDER_LIST_INCLUDE = {
  items: { orderBy: { createdAt: "asc" as const } },
  payment: { select: { id: true, status: true, transactionCode: true, paidAt: true } },
} satisfies Prisma.OrderInclude;

export const ORDER_DETAIL_INCLUDE = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: { review: true, product: { select: { id: true, imageUrl: true, isActive: true } } },
  },
  payment: {
    select: { id: true, status: true, transactionCode: true, paidAt: true, amount: true, activationStatus: true, reviewReason: true },
  },
  history: { orderBy: { createdAt: "asc" as const } },
  refunds: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      status: true,
      amount: true,
      grossAmount: true,
      feePercent: true,
      reason: true,
      note: true,
      rejectReason: true,
      managerNote: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountName: true,
      payoutMethod: true,
      bankInfoRequestedAt: true,
      createdAt: true,
      processedAt: true,
    },
  },
  user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
} satisfies Prisma.OrderInclude;

type ListOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_LIST_INCLUDE }>;
type DetailOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

function itemView(i: ListOrder["items"][number]) {
  return {
    id: i.id,
    productId: i.productId,
    productName: i.productName ?? "",
    productImageUrl: i.productImageUrl,
    quantity: i.quantity,
    unitPrice: money(i.unitPrice),
    totalAmount: money(i.totalAmount),
  };
}

/** Một dòng danh sách đơn (khách & Manager). */
export function orderSummaryView(o: ListOrder) {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    statusLabel: orderStatusLabel(o.status, o.fulfillmentType),
    fulfillmentType: o.fulfillmentType,
    /** SEPAY = đã/đang chuyển khoản trước; CASH = trả tiền khi nhận tại quầy. */
    paymentMethod: o.paymentMethod,
    isPaid: o.paidAt !== null,
    subtotal: money(o.subtotal),
    shippingFee: money(o.shippingFee),
    total: money(o.totalPrice),
    totalPrice: money(o.totalPrice),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    items: o.items.map(itemView),
    recipientName: o.recipientName,
    trackingCode: o.trackingCode,
    paymentExpiresAt: o.paymentExpiresAt,
    pickupDeadline: o.pickupDeadline,
    /** Ngày khách hẹn đến lấy "YYYY-MM-DD" (giờ VN). */
    preferredPickupDate: o.preferredPickupDate ? vnDateString(o.preferredPickupDate) : null,
    paymentId: o.payment?.id ?? null,
    payment: o.payment,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

type RefundRow = DetailOrder["refunds"][number];

/** Hoàn tiền của đơn + cờ xử lý: chờ khách gửi STK, chờ quá lâu (tồn đọng). */
function refundView(r: RefundRow, now: Date) {
  const pending = r.status === "PENDING";
  const ageDays = Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000);
  return {
    ...r,
    amount: money(r.amount),
    grossAmount: r.grossAmount === null ? null : money(r.grossAmount),
    hasBankInfo: !!r.bankAccountNumber?.trim(),
    awaitingBankInfo: pending && !r.bankAccountNumber?.trim(),
    pendingDays: pending ? ageDays : null,
    isStale: pending && ageDays >= shopConfig().staleRefundDays,
  };
}

function baseDetail(o: DetailOrder, now = new Date()) {
  return {
    ...orderSummaryView(o as unknown as ListOrder),
    recipientPhone: o.recipientPhone,
    shippingAddress: o.shippingAddress,
    shippingProvince: o.shippingProvince,
    note: o.note,
    carrier: o.carrier,
    cancelNote: o.cancelNote,
    timestamps: {
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      processingAt: o.processingAt,
      readyAt: o.readyAt,
      shippedAt: o.shippedAt,
      deliveredAt: o.deliveredAt,
      completedAt: o.completedAt,
      cancelledAt: o.cancelledAt,
      expiredAt: o.expiredAt,
      notPickedUpAt: o.notPickedUpAt,
      refundedAt: o.refundedAt,
    },
    history: o.history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      label: orderStatusLabel(h.toStatus, o.fulfillmentType),
      reason: h.reason,
      byCustomer: h.actorId !== null && h.actorId === o.userId,
      bySystem: h.actorId === null,
      createdAt: h.createdAt,
    })),
    refunds: o.refunds.map((r) => refundView(r, now)),
    pickupRescheduleCount: o.pickupRescheduleCount,
    /** Số tiền khách cần trả khi nhận (đơn trả tại quầy chưa thu). */
    amountDueAtCounter: isUnpaidCash(o) ? money(o.totalPrice) : 0,
    payment: o.payment
      ? {
          id: o.payment.id,
          status: o.payment.status,
          transactionCode: o.payment.transactionCode,
          paidAt: o.payment.paidAt,
          amount: money(o.payment.amount),
          requiresReview: o.payment.activationStatus === "REQUIRES_REVIEW",
          reviewReason: o.payment.reviewReason,
        }
      : null,
  };
}

/** Chi tiết đơn cho CHỦ ĐƠN: thêm mã nhận hàng (khi READY), quyền thao tác, quyền đánh giá từng dòng. */
export function orderOwnerView(o: DetailOrder, now = new Date()) {
  const lateUntil = latePickupUntil(o, o.refunds, now);
  const pickupReady = (o.status === "READY_FOR_PICKUP" || lateUntil !== null) && o.pickupCodeNonce && o.pickupCodeHash;
  const pickupCode = pickupReady ? pickupCodeFor(o.id, o.pickupCodeNonce!) : null;
  const cfg = shopConfig();
  const unpaidCash = isUnpaidCash(o);
  return {
    ...baseDetail(o, now),
    items: o.items.map((i) => ({
      ...itemView(i),
      review: i.review
        ? { id: i.review.id, rating: i.review.rating, comment: i.review.comment, isHidden: i.review.isHidden, createdAt: i.review.createdAt }
        : null,
      canReview: o.status === "COMPLETED" && !i.review,
    })),
    pickup:
      pickupReady && pickupCode
        ? {
            code: pickupCode,
            qrPayload: pickupQrPayload(o.code, pickupCode),
            deadline: o.pickupDeadline,
            /** Đơn đã quá hạn nhưng vẫn nhận trễ được tới mốc này (Trung tâm hủy hoàn tiền khi khách nhận). */
            latePickupUntil: lateUntil,
          }
        : null,
    actions: {
      canPay: o.status === "PENDING_PAYMENT" && !!o.paymentExpiresAt && o.paymentExpiresAt > now && !!o.payment,
      // Đơn trả tại quầy chưa thu tiền: hủy được tới trước khi nhận (không mất phí).
      canCancel: o.status === "PENDING_PAYMENT" || (unpaidCash && (o.status === "CONFIRMED" || o.status === "READY_FOR_PICKUP")),
      canRequestRefund: o.status === "PAID",
      canConfirmReceived: o.status === "DELIVERED",
      canReschedulePickup:
        o.fulfillmentType === "PICKUP" &&
        ["CONFIRMED", "PAID", "READY_FOR_PICKUP"].includes(o.status) &&
        o.pickupRescheduleCount < cfg.pickupMaxReschedules &&
        (!o.pickupDeadline || o.pickupDeadline > now),
      canUpdateRefundBank: o.refunds.some((r) => r.status === "PENDING"),
    },
  };
}

/** Chi tiết đơn cho MANAGER: thông tin người mua, chuyển trạng thái được phép; KHÔNG lộ mã nhận hàng. */
export interface PickupReceipt {
  receivedAt: Date | null;
  handedOverBy: { id: string; fullName: string } | null;
  note: string | null;
}

export function orderManagerView(
  o: DetailOrder,
  now = new Date(),
  buyerStats?: { noShowCount: number; cashPickupLockedUntil: Date | null },
  receipt?: PickupReceipt | null
) {
  const allowed = managerTransitionsFor(o);
  const lateUntil = latePickupUntil(o, o.refunds, now);
  return {
    ...baseDetail(o, now),
    items: o.items.map((i) => ({
      ...itemView(i),
      review: i.review ? { id: i.review.id, rating: i.review.rating, comment: i.review.comment, isHidden: i.review.isHidden } : null,
    })),
    buyer: {
      id: o.user.id,
      fullName: o.user.fullName,
      email: o.user.email,
      phone: o.user.phone,
      avatarUrl: o.user.avatarUrl,
      /** Số lần không đến lấy hàng trong SHOP_NO_SHOW_WINDOW_DAYS ngày gần nhất. */
      noShowCount: buyerStats?.noShowCount ?? 0,
      cashPickupLockedUntil: buyerStats?.cashPickupLockedUntil ?? null,
    },
    recipientPhoneMasked: maskPhone(o.recipientPhone),
    allowedTransitions: allowed.map((s) => ({ status: s, label: orderStatusLabel(s, o.fulfillmentType), requiresTrackingCode: s === "SHIPPING" })),
    pickup:
      o.status === "READY_FOR_PICKUP" || lateUntil
        ? {
            deadline: o.pickupDeadline,
            /** Khách đến sau hạn: giao được tới mốc này (hủy yêu cầu hoàn đang chờ, lấy lại hàng từ kệ). */
            late: lateUntil !== null,
            latePickupUntil: lateUntil,
            /** Mã còn hiệu lực (đơn quá hạn cũ đã xóa mã ⇒ chỉ đối chiếu SĐT + giấy tờ). */
            hasCode: o.pickupCodeHash !== null,
            /** Đơn trả tại quầy: Manager phải thu tiền mặt khi giao. */
            requiresCashCollection: isUnpaidCash(o),
            failedAttempts: o.pickupFailedAttempts,
            lockedUntil: o.pickupLockedUntil && o.pickupLockedUntil > now ? o.pickupLockedUntil : null,
          }
        : null,
    /** Đơn tại quầy "Đã nhận": thời điểm nhận, người giao, nhận trễ hạn hay không. */
    receipt:
      o.fulfillmentType === "PICKUP" && o.status === "COMPLETED"
        ? {
            receivedAt: receipt?.receivedAt ?? o.completedAt,
            handedOverBy: receipt?.handedOverBy ?? null,
            note: receipt?.note ?? null,
            late: o.notPickedUpAt !== null || (!!o.pickupDeadline && !!o.completedAt && o.completedAt > o.pickupDeadline),
          }
        : null,
  };
}
