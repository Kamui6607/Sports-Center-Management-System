import { Prisma, type OrderStatus } from "@prisma/client";
import { MANAGER_TRANSITIONS, ORDER_STATUS_LABEL } from "./order-state.js";
import { maskPhone, pickupCodeFor, pickupQrPayload } from "./pickup-code.js";

/** Số tiền VND (số nguyên) — Decimal của Prisma trả về object/string. */
export function money(value: unknown): number {
  return Math.round(Number(value ?? 0));
}

/** Nhóm trạng thái cho tab "Đơn của tôi" / lọc của Manager. */
export const ORDER_STATUS_GROUPS: Record<string, OrderStatus[]> = {
  PENDING: ["PENDING_PAYMENT"],
  ACTIVE: ["PAID", "PROCESSING", "READY_FOR_PICKUP", "SHIPPING", "DELIVERED", "REFUND_REQUESTED"],
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
    select: { id: true, status: true, amount: true, reason: true, rejectReason: true, managerNote: true, createdAt: true, processedAt: true },
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
    statusLabel: ORDER_STATUS_LABEL[o.status],
    fulfillmentType: o.fulfillmentType,
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
    paymentId: o.payment?.id ?? null,
    payment: o.payment,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function baseDetail(o: DetailOrder) {
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
      label: ORDER_STATUS_LABEL[h.toStatus],
      reason: h.reason,
      byCustomer: h.actorId !== null && h.actorId === o.userId,
      bySystem: h.actorId === null,
      createdAt: h.createdAt,
    })),
    refunds: o.refunds.map((r) => ({ ...r, amount: money(r.amount) })),
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
  const pickupReady = o.status === "READY_FOR_PICKUP" && o.pickupCodeNonce;
  const pickupCode = pickupReady ? pickupCodeFor(o.id, o.pickupCodeNonce!) : null;
  return {
    ...baseDetail(o),
    items: o.items.map((i) => ({
      ...itemView(i),
      review: i.review
        ? { id: i.review.id, rating: i.review.rating, comment: i.review.comment, isHidden: i.review.isHidden, createdAt: i.review.createdAt }
        : null,
      canReview: o.status === "COMPLETED" && !i.review,
    })),
    pickup:
      pickupReady && pickupCode
        ? { code: pickupCode, qrPayload: pickupQrPayload(o.code, pickupCode), deadline: o.pickupDeadline }
        : null,
    actions: {
      canPay: o.status === "PENDING_PAYMENT" && !!o.paymentExpiresAt && o.paymentExpiresAt > now && !!o.payment,
      canCancel: o.status === "PENDING_PAYMENT",
      canRequestRefund: o.status === "PAID",
      canConfirmReceived: o.status === "DELIVERED",
    },
  };
}

/** Chi tiết đơn cho MANAGER: thông tin người mua, chuyển trạng thái được phép; KHÔNG lộ mã nhận hàng. */
export function orderManagerView(o: DetailOrder, now = new Date()) {
  const allowed = MANAGER_TRANSITIONS[o.fulfillmentType][o.status] ?? [];
  return {
    ...baseDetail(o),
    items: o.items.map((i) => ({
      ...itemView(i),
      review: i.review ? { id: i.review.id, rating: i.review.rating, comment: i.review.comment, isHidden: i.review.isHidden } : null,
    })),
    buyer: { id: o.user.id, fullName: o.user.fullName, email: o.user.email, phone: o.user.phone, avatarUrl: o.user.avatarUrl },
    recipientPhoneMasked: maskPhone(o.recipientPhone),
    allowedTransitions: allowed.map((s) => ({ status: s, label: ORDER_STATUS_LABEL[s], requiresTrackingCode: s === "SHIPPING" })),
    pickup:
      o.status === "READY_FOR_PICKUP"
        ? {
            deadline: o.pickupDeadline,
            failedAttempts: o.pickupFailedAttempts,
            lockedUntil: o.pickupLockedUntil && o.pickupLockedUntil > now ? o.pickupLockedUntil : null,
          }
        : null,
  };
}
