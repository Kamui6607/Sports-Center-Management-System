import { Prisma, type OrderStatus } from "@prisma/client";
import { buildOrderPaymentSnapshot } from "../payments/purchase-snapshot.js";
import { prisma } from "../../config/prisma.js";
import { shopConfig } from "../../config/shop.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockPaymentWebhook } from "../../utils/dbLocks.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { notifyManagersNewRefunds, type PayoutBankDetails } from "../refunds/refunds.service.js";
import { applyInventory, availableOf } from "./inventory.js";
import { isUnpaidCash, managerTransitionsFor, ORDER_STATUS_LABEL, orderStatusLabel, transitionOrderTx } from "./order-state.js";
import {
  money,
  ORDER_DETAIL_INCLUDE,
  ORDER_LIST_INCLUDE,
  ORDER_STATUS_GROUPS,
  latePickupUntil,
  orderManagerView,
  orderOwnerView,
  orderSummaryView,
} from "./order-view.js";
import { hashPickupCode, maskPhone, newPickupNonce, parsePickupInput, phoneLast4, pickupCodeFor } from "./pickup-code.js";
import { addDays, formatVnDate, parseVnDate, pickupDeadlineFor, vnDayStart } from "./pickup-schedule.js";

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: string };

function page(query: { page?: string; limit?: string }) {
  const p = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "10") || 10));
  return { page: p, limit, skip: (p - 1) * limit };
}

function statusFilter(raw?: string): Prisma.OrderWhereInput {
  if (!raw) return {};
  const key = raw.toUpperCase();
  if (ORDER_STATUS_GROUPS[key]) return { status: { in: ORDER_STATUS_GROUPS[key] } };
  const statuses = key.split(",").filter((s) => s in ORDER_STATUS_LABEL) as OrderStatus[];
  if (statuses.length === 0) throw new AppError("Trạng thái lọc không hợp lệ.", 400, { code: "INVALID_STATUS_FILTER" });
  return { status: { in: statuses } };
}

/** Đơn của CHÍNH người dùng — không phải của mình ⇒ 404 (không lộ đơn tồn tại). */
async function ownOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  return order;
}

// ── Khách hàng ───────────────────────────────────────────────────────────────

export async function listMyOrders(userId: string, query: { page?: string; limit?: string; status?: string }) {
  const { page: p, limit, skip } = page(query);
  const where: Prisma.OrderWhereInput = { userId, ...statusFilter(query.status) };
  const [total, orders, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: ORDER_LIST_INCLUDE, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.order.groupBy({ by: ["status"], where: { userId }, _count: true }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const groupCounts = Object.fromEntries(
    Object.entries(ORDER_STATUS_GROUPS).map(([g, statuses]) => [g, statuses.reduce((s, st) => s + (byStatus[st] ?? 0), 0)])
  );
  return { orders: orders.map(orderSummaryView), counts: groupCounts, pagination: buildPaginationMeta(total, p, limit) };
}

export async function getMyOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: ORDER_DETAIL_INCLUDE });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  return orderOwnerView(order);
}

async function detailForOwner(orderId: string) {
  return orderOwnerView(await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE }));
}

/**
 * Đóng MỘT đơn PENDING_PAYMENT (hết hạn / khách hủy / Manager hủy): payment PENDING → FAILED, đơn → EXPIRED|CANCELLED,
 * nhả hàng từng dòng (RELEASE). Chạy dưới `lockPaymentWebhook` (cùng lock với luồng chốt tiền SePay) và đọc lại
 * trạng thái SAU lock: tiền vừa về trước đó ⇒ KHÔNG đóng. Gọi lặp/đồng thời (nhiều instance) vô hại.
 * @returns `true` nếu đơn được đóng trong lần gọi này.
 */
export async function closePendingOrder(
  orderId: string,
  reason: "BUYER" | "EXPIRED" | "MANAGER",
  opts: { actorId?: string | null; note?: string | null } = {}
): Promise<boolean> {
  const closed = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { payment: { select: { id: true } } } });
    if (!current) return false;
    if (current.payment) await lockPaymentWebhook(tx, current.payment.id);

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: { select: { id: true, status: true } } },
    });
    if (!order || order.status !== "PENDING_PAYMENT") return false;
    if (order.payment && order.payment.status !== "PENDING") return false;

    const expired = reason === "EXPIRED";
    if (order.payment) {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: {
          status: "FAILED",
          note: expired ? "Hết hạn chờ thanh toán chuyển khoản — đơn hàng hết hạn, đã nhả hàng." : "Đơn hàng bị hủy trước khi thanh toán — đã nhả hàng.",
        },
      });
    }
    await transitionOrderTx(tx, order, expired ? "EXPIRED" : "CANCELLED", {
      actorId: opts.actorId ?? null,
      reason: opts.note ?? (expired ? "Quá hạn chờ thanh toán" : reason === "MANAGER" ? "Quản lý hủy đơn" : "Khách hủy đơn"),
      data: {
        cancelReason: reason,
        ...(expired ? {} : { cancelledById: opts.actorId ?? null, cancelNote: opts.note ?? null }),
      },
      // Khách tự hủy thì không cần thông báo lại cho chính họ.
      notify: reason === "BUYER" ? false : undefined,
    });
    for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await applyInventory(tx, {
        productId: item.productId,
        type: "RELEASE",
        quantity: item.quantity,
        orderId: order.id,
        actorId: opts.actorId ?? null,
        note: expired ? `Đơn ${order.code} hết hạn` : `Đơn ${order.code} bị hủy`,
      });
    }
    if (expired) await applyExpireLockTx(tx, order.userId);
    return true;
  });
  if (closed) await flushNotificationOutbox().catch(() => {});
  return closed;
}

/** Để hết hạn ≥ ngưỡng trong 24h ⇒ khóa đặt hàng `expireLockHours` (không rút ngắn khóa đang có). */
async function applyExpireLockTx(tx: Tx, userId: string) {
  const cfg = shopConfig();
  const since = new Date(Date.now() - 24 * 3_600_000);
  const expiredCount = await tx.order.count({ where: { userId, status: "EXPIRED", expiredAt: { gte: since } } });
  if (expiredCount < cfg.expireLockThreshold) return;
  const until = new Date(Date.now() + cfg.expireLockHours * 3_600_000);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { checkoutLockedUntil: true } });
  if (user?.checkoutLockedUntil && user.checkoutLockedUntil >= until) return;
  const alreadyLocked = !!user?.checkoutLockedUntil && user.checkoutLockedUntil > new Date();
  await tx.user.update({ where: { id: userId }, data: { checkoutLockedUntil: until } });
  if (!alreadyLocked) {
    await enqueueNotification(tx, {
      userId,
      type: "ORDER_UPDATED",
      title: "Tạm khóa đặt hàng",
      body: `Bạn đã để ${expiredCount} đơn hết hạn thanh toán trong 24 giờ. Chức năng đặt hàng tạm khóa ${cfg.expireLockHours} giờ.`,
      metadata: { lockedUntil: until.toISOString() },
    });
  }
}

/**
 * Hủy đơn TRẢ TẠI QUẦY chưa thu tiền (CONFIRMED / READY_FOR_PICKUP): đơn → CANCELLED, nhả hàng đang giữ (RELEASE),
 * vô hiệu mã nhận hàng. Không có giao dịch nên không có gì để hoàn. CAS trong `transitionOrderTx` chống hủy trùng.
 * @returns `true` nếu đơn được hủy trong lần gọi này.
 */
async function cancelUnpaidCashOrder(orderId: string, by: "BUYER" | "MANAGER", opts: { actorId: string; note?: string | null }) {
  const cancelled = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || !isUnpaidCash(order) || (order.status !== "CONFIRMED" && order.status !== "READY_FOR_PICKUP")) return false;
    await transitionOrderTx(tx, order, "CANCELLED", {
      actorId: opts.actorId,
      reason: opts.note ?? (by === "MANAGER" ? "Quản lý hủy đơn" : "Khách hủy đơn"),
      data: { cancelReason: by, cancelledById: opts.actorId, cancelNote: opts.note ?? null, pickupCodeHash: null },
      notify: by === "BUYER" ? false : undefined,
    });
    for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await applyInventory(tx, {
        productId: item.productId,
        type: "RELEASE",
        quantity: item.quantity,
        orderId: order.id,
        actorId: opts.actorId,
        note: `Đơn ${order.code} (trả tại quầy) bị hủy`,
      });
    }
    return true;
  });
  if (cancelled) await flushNotificationOutbox().catch(() => {});
  return cancelled;
}

export async function cancelMyOrder(userId: string, orderId: string, reason?: string) {
  const order = await ownOrder(userId, orderId);
  if (isUnpaidCash(order) && (order.status === "CONFIRMED" || order.status === "READY_FOR_PICKUP")) {
    if (!(await cancelUnpaidCashOrder(orderId, "BUYER", { actorId: userId, note: reason ?? null }))) {
      throw new AppError("Đơn vừa thay đổi trạng thái — không thể hủy.", 409, { code: "ORDER_STATE_CHANGED" });
    }
    return detailForOwner(orderId);
  }
  if (order.status !== "PENDING_PAYMENT") {
    throw new AppError(
      order.status === "PAID"
        ? "Đơn đã thanh toán — vui lòng gửi yêu cầu hoàn tiền thay vì hủy."
        : `Không thể hủy đơn ở trạng thái "${ORDER_STATUS_LABEL[order.status]}".`,
      409,
      { code: order.status === "PAID" ? "ORDER_PAID_USE_REFUND" : "ORDER_NOT_CANCELLABLE", status: order.status }
    );
  }
  const closed = await closePendingOrder(orderId, "BUYER", { actorId: userId, note: reason ?? null });
  if (!closed) {
    throw new AppError("Đơn vừa được thanh toán hoặc không còn chờ thanh toán — không thể hủy.", 409, { code: "ORDER_STATE_CHANGED" });
  }
  return detailForOwner(orderId);
}

/** Tạo Refund cho đơn (trong transaction) — không trùng yêu cầu chưa bị từ chối cùng lý do. */
async function createOrderRefundTx(
  tx: Tx,
  order: { id: string; code: string },
  payment: { id: string; memberId: string | null },
  reason: "ORDER_CANCELLED" | "ORDER_NOT_PICKED_UP" | "ORDER_LATE_PAYMENT",
  amount: number,
  requestedById: string | null,
  note: string | null,
  bankInfo?: PayoutBankDetails,
  fee?: { grossAmount: number; feePercent: number }
) {
  const existing = await tx.refund.findFirst({
    where: { orderId: order.id, reason, status: { not: "REJECTED" } },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new AppError("Đơn này đã có yêu cầu hoàn tiền đang xử lý.", 409, {
      code: "REFUND_ALREADY_REQUESTED",
      refundId: existing.id,
      status: existing.status,
    });
  }
  return tx.refund.create({
    data: {
      paymentId: payment.id,
      memberId: payment.memberId,
      orderId: order.id,
      reason,
      amount,
      coachDebitAmount: 0,
      ...(fee && fee.feePercent > 0 ? { grossAmount: fee.grossAmount, feePercent: fee.feePercent } : {}),
      note,
      memberNote: requestedById ? note : null,
      // Lưu bank info vào cột riêng nếu có.
      bankName: bankInfo?.bankName?.trim() || null,
      bankAccountNumber: bankInfo?.bankAccountNumber?.trim() || null,
      bankAccountName: bankInfo?.bankAccountName?.trim().toUpperCase() || null,
      requestedById,
    },
  });
}

/**
 * Khách yêu cầu hoàn tiền đơn ĐÃ THANH TOÁN (PAID, Trung tâm chưa xử lý): đơn → REFUND_REQUESTED +
 * Refund PENDING (Manager chuyển khoản tay rồi duyệt ở luồng hoàn tiền có sẵn). Hàng vẫn ở kho tới khi duyệt.
 */
export async function requestOrderRefund(
  userId: string,
  orderId: string,
  reason: string,
  bankInfo?: PayoutBankDetails
) {
  const owned = await ownOrder(userId, orderId);
  if (owned.status !== "PAID") {
    throw new AppError(
      owned.status === "PENDING_PAYMENT"
        ? "Đơn chưa thanh toán — hãy hủy đơn thay vì yêu cầu hoàn tiền."
        : `Đơn ở trạng thái "${ORDER_STATUS_LABEL[owned.status]}" không thể yêu cầu hoàn tiền.`,
      409,
      { code: "ORDER_NOT_REFUNDABLE", status: owned.status }
    );
  }
  const refund = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId } });
    if (!payment || payment.status !== "SUCCESS") throw new AppError("Đơn chưa có giao dịch thành công.", 409, { code: "PAID_PAYMENT_NOT_FOUND" });
    await lockPaymentWebhook(tx, payment.id);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await transitionOrderTx(tx, order, "REFUND_REQUESTED", { actorId: userId, reason, notify: false });
    return createOrderRefundTx(tx, order, payment, "ORDER_CANCELLED", money(payment.amount), userId, reason ?? null, bankInfo);
  });
  void notifyManagersNewRefunds(`Khách yêu cầu hủy đơn ${owned.code} — cần hoàn ${money(refund.amount).toLocaleString("vi-VN")}đ.`, {
    refundId: refund.id,
    orderId,
  });
  return detailForOwner(orderId);
}

/**
 * Khách đổi ngày lấy hàng / gia hạn (PICKUP, trước hạn nhận): tối đa `SHOP_PICKUP_MAX_RESCHEDULES` lần, ngày mới trong
 * [hôm nay, max(ngày hẹn cũ, hôm nay) + SHOP_PICKUP_RESCHEDULE_MAX_DAYS]. Đơn đã sẵn sàng ⇒ tính lại hạn nhận.
 */
export async function reschedulePickup(userId: string, orderId: string, pickupDate: string) {
  const cfg = shopConfig();
  const order = await ownOrder(userId, orderId);
  const now = new Date();
  if (order.fulfillmentType !== "PICKUP" || !["CONFIRMED", "PAID", "READY_FOR_PICKUP"].includes(order.status)) {
    throw new AppError(`Đơn ở trạng thái "${ORDER_STATUS_LABEL[order.status]}" không đổi được ngày nhận.`, 409, {
      code: "PICKUP_NOT_RESCHEDULABLE",
      status: order.status,
    });
  }
  if (order.pickupDeadline && order.pickupDeadline <= now) {
    throw new AppError("Đơn đã quá hạn nhận hàng.", 409, { code: "PICKUP_DEADLINE_PASSED" });
  }
  if (order.pickupRescheduleCount >= cfg.pickupMaxReschedules) {
    throw new AppError(`Bạn chỉ được đổi ngày nhận hàng ${cfg.pickupMaxReschedules} lần cho mỗi đơn.`, 409, {
      code: "PICKUP_RESCHEDULE_LIMIT",
      maxReschedules: cfg.pickupMaxReschedules,
    });
  }
  const newDate = parseVnDate(pickupDate);
  const today = vnDayStart(now);
  const current = order.preferredPickupDate ?? vnDayStart(order.createdAt);
  const latest = addDays(current > today ? current : today, cfg.pickupRescheduleMaxDays);
  if (newDate < today || newDate > latest) {
    throw new AppError(`Chọn ngày nhận từ ${formatVnDate(today)} đến ${formatVnDate(latest)}.`, 400, {
      code: "PICKUP_DATE_OUT_OF_RANGE",
      minDate: today,
      maxDate: latest,
    });
  }
  const deadline = order.status === "READY_FOR_PICKUP" && order.readyAt ? pickupDeadlineFor(newDate, order.readyAt, cfg.pickupDays) : null;
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: order.status, pickupRescheduleCount: order.pickupRescheduleCount },
    data: {
      preferredPickupDate: newDate,
      pickupRescheduleCount: { increment: 1 },
      ...(deadline ? { pickupDeadline: deadline, pickupReminderSentAt: null } : {}),
    },
  });
  if (updated.count === 0) {
    throw new AppError("Đơn vừa được cập nhật bởi thao tác khác, vui lòng tải lại.", 409, { code: "ORDER_STATE_CHANGED" });
  }
  return detailForOwner(orderId);
}

/** Khách bổ sung / sửa số tài khoản nhận hoàn cho yêu cầu hoàn tiền ĐANG CHỜ của đơn. */
export async function updateRefundBank(userId: string, orderId: string, bank: Required<PayoutBankDetails>) {
  await ownOrder(userId, orderId);
  const refund = await prisma.refund.findFirst({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!refund) throw new AppError("Đơn không có yêu cầu hoàn tiền đang chờ.", 409, { code: "REFUND_NOT_PENDING" });
  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      bankName: bank.bankName.trim(),
      bankAccountNumber: bank.bankAccountNumber.replace(/\s+/g, ""),
      bankAccountName: bank.bankAccountName.trim().toUpperCase(),
    },
  });
  return detailForOwner(orderId);
}

export async function confirmReceived(userId: string, orderId: string) {
  const order = await ownOrder(userId, orderId);
  if (order.status !== "DELIVERED") {
    throw new AppError("Chỉ xác nhận được đơn đã giao.", 409, { code: "ORDER_NOT_DELIVERED", status: order.status });
  }
  await prisma.$transaction((tx) => transitionOrderTx(tx, order, "COMPLETED", { actorId: userId, reason: "Khách xác nhận đã nhận hàng", notify: false }));
  return detailForOwner(orderId);
}

// ── Đánh giá ─────────────────────────────────────────────────────────────────

async function recomputeRatingTx(tx: Tx, productId: string) {
  const agg = await tx.productReview.aggregate({ where: { productId, isHidden: false }, _avg: { rating: true }, _count: { rating: true } });
  await tx.product.update({ where: { id: productId }, data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.rating } });
}

/** Đánh giá MỘT dòng đơn: dòng thuộc đơn COMPLETED của chính mình, mỗi dòng tối đa 1 đánh giá. */
export async function reviewOrderItem(userId: string, orderItemId: string, data: { rating: number; comment?: string }) {
  const item = await prisma.orderItem.findFirst({
    where: { id: orderItemId, order: { userId } },
    include: { order: { select: { status: true } }, review: { select: { id: true } } },
  });
  if (!item) throw new AppError("Không tìm thấy sản phẩm trong đơn của bạn.", 404, { code: "ORDER_ITEM_NOT_FOUND" });
  if (item.order.status !== "COMPLETED") {
    throw new AppError("Chỉ đánh giá được sản phẩm trong đơn đã hoàn tất.", 403, { code: "REVIEW_NOT_ALLOWED" });
  }
  if (item.review) throw new AppError("Bạn đã đánh giá sản phẩm này trong đơn.", 409, { code: "REVIEW_EXISTS", reviewId: item.review.id });
  try {
    return await prisma.$transaction(async (tx) => {
      const review = await tx.productReview.create({
        data: { productId: item.productId, userId, orderItemId: item.id, rating: data.rating, comment: data.comment?.trim() || null },
      });
      await recomputeRatingTx(tx, item.productId);
      return review;
    });
  } catch (err) {
    // Hai request đồng thời cho cùng dòng: UNIQUE(orderItemId) chặn bản thứ hai.
    if ((err as { code?: string }).code === "P2002") throw new AppError("Bạn đã đánh giá sản phẩm này trong đơn.", 409, { code: "REVIEW_EXISTS" });
    throw err;
  }
}

/** API cũ `POST /products/:id/reviews`: tự chọn dòng đơn COMPLETED cũ nhất chưa đánh giá của sản phẩm. */
export async function reviewProductLegacy(
  userId: string,
  productId: string,
  data: { rating: number; comment?: string; orderItemId?: string }
) {
  const item = data.orderItemId
    ? { id: data.orderItemId }
    : await prisma.orderItem.findFirst({
        where: { productId, review: null, order: { userId, status: "COMPLETED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
  if (!item) {
    const reviewed = await prisma.productReview.count({ where: { productId, userId } });
    if (reviewed > 0) {
      throw new AppError("You have already reviewed this product. Please update your existing review.", 409, { code: "REVIEW_EXISTS" });
    }
    throw new AppError("You can only review products that you have successfully purchased.", 403, { code: "REVIEW_NOT_ALLOWED" });
  }
  return reviewOrderItem(userId, item.id, data);
}

export async function setReviewVisibility(managerId: string, reviewId: string, isHidden: boolean, reason?: string) {
  const review = await prisma.productReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new AppError("Không tìm thấy đánh giá.", 404, { code: "REVIEW_NOT_FOUND" });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productReview.update({
      where: { id: reviewId },
      data: isHidden
        ? { isHidden: true, hiddenReason: reason ?? null, hiddenById: managerId, hiddenAt: new Date() }
        : { isHidden: false, hiddenReason: null, hiddenById: null, hiddenAt: null },
    });
    await recomputeRatingTx(tx, review.productId);
    return updated;
  });
}

export async function listReviewsForManager(query: { page?: string; limit?: string; productId?: string; hidden?: string }) {
  const { page: p, limit, skip } = page(query);
  const where: Prisma.ProductReviewWhereInput = {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.hidden ? { isHidden: query.hidden === "true" } : {}),
  };
  const [total, reviews] = await Promise.all([
    prisma.productReview.count({ where }),
    prisma.productReview.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        product: { select: { id: true, name: true } },
        orderItem: { select: { id: true, order: { select: { id: true, code: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return { reviews, pagination: buildPaginationMeta(total, p, limit) };
}

// ── Manager ──────────────────────────────────────────────────────────────────

/** Hàng đợi xử lý của Manager (lọc nhanh trên trang Đơn hàng). */
function queueFilter(queue?: string, now = new Date()): Prisma.OrderWhereInput {
  const today = vnDayStart(now);
  switch (queue) {
    case "PICKUP_TODAY":
      return {
        fulfillmentType: "PICKUP",
        status: { in: ["CONFIRMED", "PAID", "READY_FOR_PICKUP"] },
        preferredPickupDate: { gte: today, lt: addDays(today, 1) },
      };
    case "AWAITING_PICKUP":
      return { fulfillmentType: "PICKUP", status: "READY_FOR_PICKUP" };
    case "LATE_PICKUP": {
      const days = shopConfig().latePickupDays;
      if (days <= 0) return { id: { in: [] } };
      return {
        fulfillmentType: "PICKUP",
        status: "NOT_PICKED_UP",
        notPickedUpAt: { gt: addDays(now, -days) },
        refunds: { none: { status: "COMPLETED" } },
      };
    }
    case "REFUND_PENDING":
      return { refunds: { some: { status: "PENDING" } } };
    case "STALE_REFUND":
      return { refunds: { some: { status: "PENDING", createdAt: { lt: addDays(now, -shopConfig().staleRefundDays) } } } };
    default:
      return {};
  }
}

export async function listOrdersForManager(query: {
  page?: string;
  limit?: string;
  status?: string;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  search?: string;
  queue?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { page: p, limit, skip } = page(query);
  const search = query.search?.trim();
  const now = new Date();
  const staleBefore = addDays(now, -shopConfig().staleRefundDays);
  const where: Prisma.OrderWhereInput = {
    ...statusFilter(query.status),
    ...queueFilter(query.queue, now),
    ...(query.fulfillmentType ? { fulfillmentType: query.fulfillmentType } : {}),
    ...(query.startDate || query.endDate
      ? { createdAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { recipientName: { contains: search, mode: "insensitive" } },
            { recipientPhone: { contains: search } },
            { trackingCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        ...ORDER_LIST_INCLUDE,
        user: { select: { id: true, fullName: true } },
        refunds: { where: { status: "PENDING" }, select: { id: true, amount: true, createdAt: true, bankAccountNumber: true } },
      },
      orderBy:
        query.queue === "PICKUP_TODAY"
          ? { preferredPickupDate: "asc" }
          : query.queue === "AWAITING_PICKUP"
            ? { pickupDeadline: "asc" }
            : query.queue === "LATE_PICKUP"
              ? { notPickedUpAt: "asc" }
              : { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return {
    orders: orders.map((o) => {
      const r = o.refunds[0];
      return {
        ...orderSummaryView(o),
        buyer: o.user,
        // Yêu cầu hoàn đang chờ: cờ "chờ STK" + "tồn đọng" để Manager ưu tiên.
        pendingRefund: r
          ? { id: r.id, amount: money(r.amount), awaitingBankInfo: !r.bankAccountNumber?.trim(), isStale: r.createdAt < staleBefore, createdAt: r.createdAt }
          : null,
      };
    }),
    pagination: buildPaginationMeta(total, p, limit),
  };
}

export async function getOrderForManager(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  const [noShowCount, buyer] = await Promise.all([
    countNoShows(prisma, order.userId),
    prisma.user.findUnique({ where: { id: order.userId }, select: { cashPickupLockedUntil: true } }),
  ]);
  const lock = buyer?.cashPickupLockedUntil && buyer.cashPickupLockedUntil > new Date() ? buyer.cashPickupLockedUntil : null;
  // Đơn tại quầy "Đã nhận": ai giao + lúc nào (mốc COMPLETED cuối trong lịch sử).
  let receipt = null;
  if (order.fulfillmentType === "PICKUP" && order.status === "COMPLETED") {
    const h = [...order.history].reverse().find((x) => x.toStatus === "COMPLETED");
    const staff = h?.actorId ? await prisma.user.findUnique({ where: { id: h.actorId }, select: { id: true, fullName: true } }) : null;
    receipt = { receivedAt: h?.createdAt ?? order.completedAt, handedOverBy: staff, note: h?.reason ?? null };
  }
  return orderManagerView(order, new Date(), { noShowCount, cashPickupLockedUntil: lock }, receipt);
}

/** Số lần bùng hàng (đơn chuyển NOT_PICKED_UP) của một người trong `SHOP_NO_SHOW_WINDOW_DAYS` ngày gần nhất. */
async function countNoShows(db: Tx | typeof prisma, userId: string, now = new Date()) {
  return db.order.count({ where: { userId, notPickedUpAt: { gte: addDays(now, -shopConfig().noShowWindowDays) } } });
}

export async function managerSummary() {
  const now = new Date();
  const [counts, products, pickupToday, refundPending, staleRefunds, awaitingBankInfo] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.product.findMany({ where: { isActive: true }, select: { stockQuantity: true, reservedStock: true, lowStockThreshold: true } }),
    prisma.order.count({ where: queueFilter("PICKUP_TODAY", now) }),
    prisma.refund.count({ where: { orderId: { not: null }, status: "PENDING" } }),
    prisma.refund.count({ where: { orderId: { not: null }, status: "PENDING", createdAt: { lt: addDays(now, -shopConfig().staleRefundDays) } } }),
    prisma.refund.count({ where: { orderId: { not: null }, status: "PENDING", bankAccountNumber: null } }),
  ]);
  const byStatus: Record<string, number> = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const needsAction =
    (byStatus.CONFIRMED ?? 0) + (byStatus.PAID ?? 0) + (byStatus.PROCESSING ?? 0) + (byStatus.SHIPPING ?? 0) + (byStatus.READY_FOR_PICKUP ?? 0);
  return {
    byStatus,
    needsAction,
    toPrepare: (byStatus.CONFIRMED ?? 0) + (byStatus.PAID ?? 0) + (byStatus.PROCESSING ?? 0),
    pickupToday,
    refundPending,
    staleRefunds,
    awaitingBankInfo,
    readyForPickup: byStatus.READY_FOR_PICKUP ?? 0,
    shipping: byStatus.SHIPPING ?? 0,
    refundRequested: byStatus.REFUND_REQUESTED ?? 0,
    lowStockProducts: products.filter((p) => availableOf(p) <= p.lowStockThreshold).length,
  };
}

/**
 * Manager chuyển trạng thái theo `MANAGER_TRANSITIONS`:
 * - READY_FOR_PICKUP: sinh mã nhận hàng mới + hạn nhận (`SHOP_PICKUP_DAYS`).
 * - SHIPPING: bắt buộc `trackingCode`.
 * - REFUND_REQUESTED ("hủy & hoàn tiền"): tạo Refund PENDING toàn bộ số tiền.
 * - NOT_PICKED_UP: trả hàng về kho + Refund theo chính sách.
 * - CANCELLED (đơn chưa thanh toán): nhả hàng như khách hủy.
 * - COMPLETED cho đơn PICKUP chỉ qua API xác nhận mã nhận hàng.
 */
export async function managerTransition(
  manager: Actor,
  orderId: string,
  body: { status: OrderStatus; reason?: string; trackingCode?: string; carrier?: string }
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  const allowed = managerTransitionsFor(order);
  if (!allowed.includes(body.status)) {
    throw new AppError(
      `Không thể chuyển đơn từ "${ORDER_STATUS_LABEL[order.status]}" sang "${ORDER_STATUS_LABEL[body.status]}".`,
      409,
      { code: "ORDER_INVALID_TRANSITION", from: order.status, to: body.status, allowed }
    );
  }

  if (body.status === "CANCELLED") {
    const closed =
      order.status === "PENDING_PAYMENT"
        ? await closePendingOrder(orderId, "MANAGER", { actorId: manager.id, note: body.reason ?? null })
        : await cancelUnpaidCashOrder(orderId, "MANAGER", { actorId: manager.id, note: body.reason ?? null });
    if (!closed) throw new AppError("Đơn vừa thay đổi trạng thái, vui lòng tải lại.", 409, { code: "ORDER_STATE_CHANGED" });
    return getOrderForManager(orderId);
  }
  if (body.status === "REFUND_REQUESTED" && (body.reason?.trim().length ?? 0) < 3) {
    throw new AppError("Vui lòng nhập lý do hủy đơn (khách sẽ nhận được lý do này).", 400, { code: "CANCEL_REASON_REQUIRED" });
  }
  if (body.status === "SHIPPING" && !body.trackingCode) {
    throw new AppError("Vui lòng nhập mã vận đơn trước khi chuyển sang Đang giao.", 400, { code: "TRACKING_CODE_REQUIRED" });
  }

  let refundCreated: { id: string; amount: unknown } | null = null;
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId } });
    if (payment) await lockPaymentWebhook(tx, payment.id);
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const reason = body.reason ?? null;

    switch (body.status) {
      case "READY_FOR_PICKUP": {
        const nonce = newPickupNonce();
        // Hạn nhận tính từ ngày khách hẹn (hoặc hôm nay nếu báo sẵn sàng muộn hơn) — khách vẫn lấy sớm được.
        const deadline = pickupDeadlineFor(fresh.preferredPickupDate, new Date(), shopConfig().pickupDays);
        const due = isUnpaidCash(fresh) ? ` Thanh toán ${money(fresh.totalPrice).toLocaleString("vi-VN")}đ khi nhận.` : "";
        await transitionOrderTx(tx, fresh, "READY_FOR_PICKUP", {
          actorId: manager.id,
          reason,
          data: {
            pickupCodeNonce: nonce,
            pickupCodeHash: hashPickupCode(pickupCodeFor(fresh.id, nonce)),
            pickupDeadline: deadline,
            pickupReminderSentAt: null,
            pickupFailedAttempts: 0,
            pickupLockedUntil: null,
          },
          notify: {
            body: `Đơn ${fresh.code} đã sẵn sàng. Mang mã nhận hàng tới quầy trước hết ngày ${formatVnDate(deadline)}.${due}`,
          },
        });
        break;
      }
      case "SHIPPING":
        await transitionOrderTx(tx, fresh, "SHIPPING", {
          actorId: manager.id,
          reason,
          data: { trackingCode: body.trackingCode!, carrier: body.carrier ?? null },
          notify: { body: `Đơn ${fresh.code} đang được giao. Mã vận đơn: ${body.trackingCode}${body.carrier ? ` (${body.carrier})` : ""}.` },
        });
        break;
      case "REFUND_REQUESTED": {
        if (!payment || payment.status !== "SUCCESS") throw new AppError("Đơn chưa có giao dịch thành công.", 409, { code: "PAID_PAYMENT_NOT_FOUND" });
        await transitionOrderTx(tx, fresh, "REFUND_REQUESTED", {
          actorId: manager.id,
          reason: reason ?? "Trung tâm hủy đơn",
          data: { cancelReason: "MANAGER", cancelledById: manager.id, cancelNote: reason },
          notify: {
            body: `Trung tâm đã hủy đơn ${fresh.code}${reason ? ` (${reason})` : ""}. Bạn sẽ được hoàn ${money(payment.amount).toLocaleString("vi-VN")}đ — vui lòng cập nhật số tài khoản nhận hoàn trong chi tiết đơn.`,
          },
        });
        refundCreated = await createOrderRefundTx(tx, fresh, payment, "ORDER_CANCELLED", money(payment.amount), manager.id, reason ?? "Trung tâm hủy đơn");
        break;
      }
      case "NOT_PICKED_UP":
        refundCreated = await markNotPickedUpTx(tx, fresh, payment, manager.id, reason ?? "Quản lý xác nhận khách không đến lấy hàng");
        break;
      default:
        await transitionOrderTx(tx, fresh, body.status, { actorId: manager.id, reason });
    }
  });
  await flushNotificationOutbox().catch(() => {});
  if (refundCreated) {
    const r = refundCreated as { id: string; amount: unknown };
    void notifyManagersNewRefunds(`Đơn ${order.code} cần hoàn ${money(r.amount).toLocaleString("vi-VN")}đ.`, { refundId: r.id, orderId });
  }
  return getOrderForManager(orderId);
}

/**
 * READY_FOR_PICKUP → NOT_PICKED_UP (quá hạn / Manager xác nhận khách không đến) — ghi nhận 1 lần "bùng hàng":
 * - ĐÃ thanh toán: trả hàng lên kệ (RETURN) + Refund `SHOP_NOT_PICKED_UP_REFUND_PERCENT`%; từ lần bùng thứ
 *   `SHOP_NO_SHOW_FEE_THRESHOLD` trong cửa sổ ⇒ trừ `SHOP_NO_SHOW_FEE_PERCENT`% phí giữ hàng. Khách gửi STK trong app.
 * - CHƯA thanh toán (trả tại quầy): nhả hàng đang giữ (RELEASE), không có gì để hoàn.
 * - Từ lần bùng thứ `SHOP_NO_SHOW_CASH_LOCK_THRESHOLD` ⇒ khóa "trả tại quầy" `SHOP_CASH_LOCK_DAYS` ngày.
 */
async function markNotPickedUpTx(
  tx: Tx,
  order: { id: string; code: string; userId: string; status: OrderStatus; items: { productId: string; quantity: number }[] },
  payment: { id: string; memberId: string | null; amount: Prisma.Decimal; status: string } | null,
  actorId: string | null,
  reason: string
) {
  const cfg = shopConfig();
  const now = new Date();
  const paid = payment?.status === "SUCCESS";
  const noShowCount = (await countNoShows(tx, order.userId, now)) + 1;
  const gross = paid ? Math.round((money(payment!.amount) * cfg.notPickedUpRefundPercent) / 100) : 0;
  const feePercent = paid && noShowCount >= cfg.noShowFeeThreshold ? cfg.noShowFeePercent : 0;
  const amount = Math.round((gross * (100 - feePercent)) / 100);
  const feeText = feePercent > 0 ? ` (đã trừ ${feePercent}% phí giữ hàng do không đến lấy ${noShowCount} lần trong ${cfg.noShowWindowDays} ngày)` : "";

  const lateDays = cfg.latePickupDays;
  const lateText = lateDays > 0 ? ` Nếu vẫn muốn lấy, bạn có thể đến quầy trong ${lateDays} ngày tới (khi tiền chưa được hoàn và còn hàng).` : "";
  await transitionOrderTx(tx, order, "NOT_PICKED_UP", {
    actorId,
    reason,
    // Giữ mã nhận hàng trong thời gian "nhận trễ" (SHOP_LATE_PICKUP_DAYS); tắt nhận trễ ⇒ xóa mã ngay.
    data: lateDays > 0 ? {} : { pickupCodeHash: null },
    notify: {
      body:
        amount > 0
          ? `Đơn ${order.code} đã quá hạn nhận tại quầy. Trung tâm sẽ hoàn ${amount.toLocaleString("vi-VN")}đ${feeText} — vui lòng cập nhật số tài khoản nhận hoàn trong chi tiết đơn.${lateText}`
          : `Đơn ${order.code} đã quá hạn nhận tại quầy nên đã bị hủy, hàng giữ cho bạn đã được nhả.${lateText}`,
    },
  });
  for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await applyInventory(tx, {
      productId: item.productId,
      // Đã bán (SALE) ⇒ trả lên kệ; chưa thanh toán thì hàng mới chỉ được giữ ⇒ nhả.
      type: paid ? "RETURN" : "RELEASE",
      quantity: item.quantity,
      orderId: order.id,
      actorId,
      note: paid ? `Đơn ${order.code} không đến lấy — trả hàng lên kệ` : `Đơn ${order.code} (trả tại quầy) không đến lấy — nhả hàng`,
    });
  }

  if (noShowCount >= cfg.noShowCashLockThreshold) {
    const until = addDays(now, cfg.cashLockDays);
    const user = await tx.user.findUnique({ where: { id: order.userId }, select: { cashPickupLockedUntil: true } });
    if (!user?.cashPickupLockedUntil || user.cashPickupLockedUntil < until) {
      await tx.user.update({ where: { id: order.userId }, data: { cashPickupLockedUntil: until } });
      await enqueueNotification(tx, {
        userId: order.userId,
        type: "ORDER_UPDATED",
        title: "Tạm khóa thanh toán tại quầy",
        body: `Bạn đã không đến lấy hàng ${noShowCount} lần trong ${cfg.noShowWindowDays} ngày. Tới ${formatVnDate(until)} bạn cần chuyển khoản trước khi đặt hàng.`,
        metadata: { cashPickupLockedUntil: until.toISOString(), noShowCount },
      });
    }
  }

  if (amount > 0 && payment) {
    return createOrderRefundTx(
      tx,
      order,
      payment,
      "ORDER_NOT_PICKED_UP",
      amount,
      null,
      `Không đến lấy hàng (lần ${noShowCount}) — hoàn ${amount.toLocaleString("vi-VN")}đ${feeText}`,
      undefined,
      { grossAmount: gross, feePercent }
    );
  }
  return null;
}

/** Manager nhắc khách gửi số tài khoản nhận hoàn (yêu cầu hoàn đang chờ, chưa có STK). */
export async function remindRefundBank(manager: Actor, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  const refund = await prisma.refund.findFirst({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!refund) throw new AppError("Đơn không có yêu cầu hoàn tiền đang chờ.", 409, { code: "REFUND_NOT_PENDING" });
  if (refund.bankAccountNumber?.trim()) {
    throw new AppError("Khách đã cung cấp số tài khoản.", 409, { code: "REFUND_BANK_INFO_PRESENT" });
  }
  if (refund.bankInfoRequestedAt && refund.bankInfoRequestedAt > new Date(Date.now() - 3_600_000)) {
    throw new AppError("Vừa nhắc khách gần đây — vui lòng đợi ít nhất 1 giờ trước khi nhắc lại.", 429, {
      code: "REFUND_REMINDER_TOO_SOON",
      lastRemindedAt: refund.bankInfoRequestedAt,
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refund.id }, data: { bankInfoRequestedAt: new Date() } });
    await enqueueNotification(tx, {
      userId: order.userId,
      type: "ORDER_UPDATED",
      title: `Đơn hàng ${order.code}: cần số tài khoản nhận hoàn`,
      body: `Trung tâm cần số tài khoản để hoàn ${money(refund.amount).toLocaleString("vi-VN")}đ cho đơn ${order.code}. Vui lòng cập nhật trong chi tiết đơn, hoặc đến quầy nhận tiền mặt.`,
      metadata: { orderId: order.id, orderCode: order.code, refundId: refund.id, actorId: manager.id },
    });
  });
  await flushNotificationOutbox().catch(() => {});
  return getOrderForManager(orderId);
}

/** Tra mã nhận hàng (QR hoặc nhập tay) ⇒ tóm tắt đơn để đối chiếu (SĐT đã che). Không đổi dữ liệu. */
export async function verifyPickupCode(raw: string) {
  const { orderCode, code } = parsePickupInput(raw);
  const order = await prisma.order.findUnique({
    where: { pickupCodeHash: hashPickupCode(code) },
    include: { ...ORDER_LIST_INCLUDE, refunds: { select: { status: true } } },
  });
  const lateUntil = order ? latePickupUntil(order, order.refunds) : null;
  if (!order || (order.status !== "READY_FOR_PICKUP" && !lateUntil) || (orderCode && orderCode !== order.code)) {
    throw new AppError("Mã nhận hàng không đúng hoặc đơn không ở trạng thái chờ nhận.", 400, { code: "PICKUP_CODE_INVALID" });
  }
  return {
    ...orderSummaryView(order),
    recipientPhoneMasked: maskPhone(order.recipientPhone),
    pickupLockedUntil: order.pickupLockedUntil && order.pickupLockedUntil > new Date() ? order.pickupLockedUntil : null,
    /** Đơn đã quá hạn nhưng còn nhận trễ được — khi giao, yêu cầu hoàn đang chờ bị hủy. */
    latePickupUntil: lateUntil,
  };
}

export interface PickupConfirmInput {
  /** Mã nhận hàng / nội dung QR. Bỏ trống ⇒ giao không mã, bắt buộc `manualReason`. */
  code?: string;
  phoneLast4: string;
  cashCollected?: boolean;
  /** Khách không xuất trình được mã (mất máy, hết pin…): Manager đối chiếu giấy tờ + ghi lý do. */
  manualReason?: string;
}

/**
 * Đánh dấu "Đã nhận" (COMPLETED) cho đơn tại quầy — đúng hạn hay trễ hạn đều chung MỘT trạng thái:
 * - READY_FOR_PICKUP (kể cả đã qua `pickupDeadline` mà job chưa chạy) ⇒ giao bình thường.
 * - NOT_PICKED_UP còn trong `SHOP_LATE_PICKUP_DAYS` và chưa hoàn tiền xong ⇒ "nhận trễ": hủy yêu cầu hoàn đang chờ,
 *   lấy lại hàng từ kệ (SALE từ hàng đang bán — hết hàng ⇒ 409), đơn CASH thu tiền như thường. Lần bùng vẫn được tính.
 * Đối chiếu: mã đúng (hash) + 4 số cuối SĐT; hoặc không mã + 4 số cuối SĐT + lý do (ghi lịch sử, người giao).
 * Sai mã/SĐT ⇒ tăng `pickupFailedAttempts`; đủ `SHOP_PICKUP_MAX_ATTEMPTS` ⇒ khóa `SHOP_PICKUP_LOCK_MINUTES` (423).
 */
export async function confirmPickup(manager: Actor, orderId: string, input: PickupConfirmInput) {
  const cfg = shopConfig();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { refunds: { select: { status: true } } } });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  const lateUntil = latePickupUntil(order, order.refunds);
  if (order.fulfillmentType !== "PICKUP" || (order.status !== "READY_FOR_PICKUP" && !lateUntil)) {
    throw new AppError(
      order.status === "COMPLETED"
        ? "Đơn đã được giao — mã nhận hàng đã dùng."
        : order.status === "NOT_PICKED_UP"
          ? "Đơn đã quá thời hạn nhận trễ hoặc tiền đã được hoàn — không thể giao."
          : `Đơn đang ở trạng thái "${orderStatusLabel(order.status, order.fulfillmentType)}".`,
      409,
      {
        code: order.status === "COMPLETED" ? "PICKUP_CODE_USED" : order.status === "NOT_PICKED_UP" ? "LATE_PICKUP_CLOSED" : "ORDER_NOT_READY",
        status: order.status,
      }
    );
  }
  if (order.pickupLockedUntil && order.pickupLockedUntil > new Date()) {
    throw new AppError("Nhập sai quá nhiều lần — tạm khóa xác nhận đơn này.", 423, { code: "PICKUP_LOCKED", lockedUntil: order.pickupLockedUntil });
  }
  const collectCash = isUnpaidCash(order);
  if (collectCash && !input.cashCollected) {
    throw new AppError(`Đơn trả tại quầy — xác nhận đã thu ${money(order.totalPrice).toLocaleString("vi-VN")}đ tiền mặt trước khi giao.`, 400, {
      code: "CASH_COLLECTION_REQUIRED",
      amountDue: money(order.totalPrice),
    });
  }
  const rawCode = input.code?.trim() ?? "";
  const manualReason = input.manualReason?.trim() ?? "";
  if (!rawCode && manualReason.length < 5) {
    throw new AppError("Nhập mã nhận hàng, hoặc ghi lý do giao không mã (đã đối chiếu giấy tờ).", 400, { code: "PICKUP_REASON_REQUIRED" });
  }

  let codeOk = true;
  if (rawCode) {
    const { orderCode, code } = parsePickupInput(rawCode);
    codeOk = order.pickupCodeHash !== null && hashPickupCode(code) === order.pickupCodeHash && (!orderCode || orderCode === order.code);
  }
  // Đơn tạo qua API cũ có thể không có SĐT người nhận ⇒ chỉ đối chiếu mã.
  const phoneOk = !order.recipientPhone || phoneLast4(order.recipientPhone) === input.phoneLast4;
  if (!codeOk || !phoneOk) {
    const attempts = order.pickupFailedAttempts + 1;
    const lock = attempts >= cfg.pickupMaxAttempts;
    const lockedUntil = lock ? new Date(Date.now() + cfg.pickupLockMinutes * 60_000) : null;
    await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: lock ? { pickupFailedAttempts: 0, pickupLockedUntil: lockedUntil } : { pickupFailedAttempts: attempts },
    });
    if (lock) {
      throw new AppError("Nhập sai quá nhiều lần — tạm khóa xác nhận đơn này.", 423, { code: "PICKUP_LOCKED", lockedUntil });
    }
    throw new AppError(
      !codeOk ? "Mã nhận hàng không đúng." : "4 số cuối số điện thoại không khớp người nhận.",
      400,
      { code: !codeOk ? "PICKUP_CODE_INVALID" : "PHONE_MISMATCH", remainingAttempts: cfg.pickupMaxAttempts - attempts }
    );
  }

  const late = order.status === "NOT_PICKED_UP" || (!!order.pickupDeadline && order.pickupDeadline < new Date());
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const total = money(order.totalPrice);
    const payment = await tx.payment.findUnique({ where: { orderId: order.id } });
    // Khóa theo giao dịch: tuần tự với duyệt hoàn tiền / webhook (không thể vừa hoàn tiền vừa giao hàng).
    if (payment) await lockPaymentWebhook(tx, payment.id);
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    if (fresh.status !== order.status) {
      throw new AppError("Đơn vừa được cập nhật bởi thao tác khác, vui lòng tải lại.", 409, { code: "ORDER_STATE_CHANGED" });
    }
    const wasNotPickedUp = fresh.status === "NOT_PICKED_UP";
    if (wasNotPickedUp) {
      if (await tx.refund.count({ where: { orderId: order.id, status: "COMPLETED" } })) {
        throw new AppError("Tiền của đơn đã được hoàn — không thể giao hàng.", 409, { code: "LATE_PICKUP_CLOSED" });
      }
      await tx.refund.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "CANCELLED", processedAt: now, managerNote: "Khách đã đến nhận hàng trễ — hủy yêu cầu hoàn" },
      });
    }

    const how = rawCode ? "đã đối chiếu mã + SĐT" : `giao không mã, đã đối chiếu SĐT + giấy tờ: ${manualReason}`;
    const reason = `${late ? "Khách nhận trễ hạn" : "Giao hàng"} tại quầy${collectCash ? ` + thu tiền mặt ${total.toLocaleString("vi-VN")}đ` : ""} (${how})`;
    await transitionOrderTx(tx, fresh, "COMPLETED", {
      actorId: manager.id,
      reason,
      // Dùng một lần: xóa hash ⇒ mã cũ không còn tra được.
      data: { pickupCodeHash: null, pickupFailedAttempts: 0, pickupLockedUntil: null, ...(collectCash ? { paidAt: now } : {}) },
      notify: {
        title: `Đơn hàng ${order.code}: Đã nhận`,
        body: `Bạn đã nhận đơn ${order.code} tại quầy${wasNotPickedUp ? " (nhận trễ — yêu cầu hoàn tiền của đơn đã được hủy)" : ""}. Cảm ơn bạn! Hãy đánh giá sản phẩm nhé.`,
      },
    });

    // Đơn đã trả + đúng hạn: hàng đã trừ khi thanh toán. Còn lại phải trừ kho:
    // CASH đúng hạn ⇒ từ hàng đang giữ; nhận trễ (hàng đã trả lên kệ / đã nhả) ⇒ từ hàng đang bán.
    if (!collectCash && !wasNotPickedUp) return;
    for (const item of [...fresh.items].sort((x, y) => x.productId.localeCompare(y.productId))) {
      const sold = await applyInventory(tx, {
        productId: item.productId,
        type: "SALE",
        quantity: item.quantity,
        fromAvailable: wasNotPickedUp,
        orderId: order.id,
        actorId: manager.id,
        note: wasNotPickedUp ? `Đơn ${order.code} khách nhận trễ — lấy lại hàng từ kệ` : `Đơn ${order.code} giao tại quầy, thu tiền mặt`,
      });
      if (!sold) {
        throw wasNotPickedUp
          ? new AppError(`Không đủ hàng "${item.productName ?? item.productId}" để giao đơn nhận trễ.`, 409, {
              code: "LATE_PICKUP_OUT_OF_STOCK",
              productId: item.productId,
            })
          : new AppError(`Tồn kho không nhất quán khi giao đơn ${order.code}.`, 500, { code: "INVENTORY_INCONSISTENT" });
      }
    }
    if (!collectCash) return;
    // Thu tiền mặt: ghi giao dịch CASH.
    const member = await tx.memberProfile.findUnique({ where: { userId: order.userId }, select: { id: true } });
    await tx.payment.create({
      data: {
        memberId: member?.id ?? null,
        orderId: order.id,
        amount: total,
        method: "CASH",
        status: "SUCCESS",
        paidAt: now,
        activationStatus: "ACTIVATED",
        createdById: manager.id,
        purchaseSnapshot: await buildOrderPaymentSnapshot(tx, order.id, order.userId),
        note: `Thu tiền mặt tại quầy cho đơn ${order.code}`,
      },
    });
  });
  await flushNotificationOutbox().catch(() => {});
  return getOrderForManager(orderId);
}

// ── Kho (Manager) ────────────────────────────────────────────────────────────

export async function listInventory(query: { page?: string; limit?: string; search?: string; lowStock?: string }) {
  const { page: p, limit, skip } = page(query);
  const where: Prisma.ProductWhereInput = query.search ? { name: { contains: query.search, mode: "insensitive" } } : {};
  const rows = await prisma.product.findMany({ where, orderBy: { name: "asc" } });
  let items = rows.map((r) => {
    const available = availableOf(r);
    return {
      id: r.id,
      name: r.name,
      imageUrl: r.imageUrl,
      price: money(r.price),
      isActive: r.isActive,
      stockQuantity: r.stockQuantity,
      reservedStock: r.reservedStock,
      availableStock: available,
      lowStockThreshold: r.lowStockThreshold,
      maxPerOrder: r.maxPerOrder,
      maxPerDay: r.maxPerDay,
      lowStock: r.isActive && available <= r.lowStockThreshold,
    };
  });
  if (query.lowStock === "true") items = items.filter((i) => i.lowStock);
  // Sắp hết hàng lên đầu.
  items.sort((a, b) => Number(b.lowStock) - Number(a.lowStock) || a.availableStock - b.availableStock);
  return {
    items: items.slice(skip, skip + limit),
    lowStockCount: rows.filter((r) => r.isActive && availableOf(r) <= r.lowStockThreshold).length,
    pagination: buildPaginationMeta(items.length, p, limit),
  };
}

export async function changeInventory(managerId: string, productId: string, body: { type: "IN" | "ADJUST"; quantity: number; note: string }) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError("Product not found", 404, { code: "PRODUCT_NOT_FOUND" });
  const row = await prisma.$transaction((tx) =>
    applyInventory(tx, { productId, type: body.type, quantity: body.quantity, actorId: managerId, note: body.note })
  );
  if (!row) {
    throw new AppError(`Không thể giảm tồn xuống dưới số đang giữ cho đơn chờ thanh toán (${product.reservedStock}).`, 409, {
      code: "STOCK_BELOW_RESERVED",
      reservedStock: product.reservedStock,
    });
  }
  return { productId, stockQuantity: row.stockQuantity, reservedStock: row.reservedStock, availableStock: availableOf(row) };
}

export async function listInventoryTransactions(productId: string, query: { page?: string; limit?: string }) {
  const { page: p, limit, skip } = page(query);
  const [total, rows] = await Promise.all([
    prisma.inventoryTransaction.count({ where: { productId } }),
    prisma.inventoryTransaction.findMany({
      where: { productId },
      include: { order: { select: { id: true, code: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return { transactions: rows, pagination: buildPaginationMeta(total, p, limit) };
}

// ── Job định kỳ ──────────────────────────────────────────────────────────────

/**
 * Worker (server.ts, mỗi 60s). Idempotent & an toàn nhiều instance: mỗi đơn xử lý trong transaction riêng,
 * kiểm tra lại trạng thái sau lock / CAS `WHERE status = …` — instance chậm chân chỉ nhận "đã xử lý" và bỏ qua.
 * 1. PENDING_PAYMENT quá `paymentExpiresAt` ⇒ EXPIRED + nhả hàng (+ khóa đặt hàng nếu vượt ngưỡng).
 * 2. READY_FOR_PICKUP sắp hết hạn (trong `SHOP_PICKUP_REMINDER_HOURS`) ⇒ nhắc khách một lần.
 * 3. READY_FOR_PICKUP quá `pickupDeadline` ⇒ NOT_PICKED_UP (đã trả: trả hàng + Refund; chưa trả: nhả hàng) + ghi nhận bùng hàng.
 * 4. DELIVERED quá `SHOP_AUTO_COMPLETE_DAYS` ⇒ COMPLETED.
 */
export async function runShopMaintenance(limit = 50) {
  const now = new Date();
  const result = { expired: 0, reminded: 0, notPickedUp: 0, autoCompleted: 0 };

  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lt: now } },
    select: { id: true },
    orderBy: { paymentExpiresAt: "asc" },
    take: limit,
  });
  for (const { id } of stale) {
    if (await closePendingOrder(id, "EXPIRED")) result.expired += 1;
  }

  const soon = await prisma.order.findMany({
    where: {
      status: "READY_FOR_PICKUP",
      pickupReminderSentAt: null,
      pickupDeadline: { gt: now, lte: new Date(now.getTime() + shopConfig().pickupReminderHours * 3_600_000) },
    },
    take: limit,
  });
  for (const o of soon) {
    const sent = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: o.id, status: "READY_FOR_PICKUP", pickupReminderSentAt: null }, data: { pickupReminderSentAt: now } });
      if (claimed.count === 0) return false;
      const due = isUnpaidCash(o) ? ` Nhớ mang ${money(o.totalPrice).toLocaleString("vi-VN")}đ để thanh toán.` : "";
      await enqueueNotification(tx, {
        userId: o.userId,
        type: "ORDER_UPDATED",
        title: `Đơn hàng ${o.code}: sắp hết hạn nhận`,
        body: `Đơn ${o.code} đang chờ bạn tại quầy tới hết ngày ${formatVnDate(o.pickupDeadline!)}.${due} Bận đột xuất? Bạn có thể đổi ngày nhận trong chi tiết đơn.`,
        metadata: { orderId: o.id, orderCode: o.code, status: o.status },
      });
      return true;
    });
    if (sent) result.reminded += 1;
  }

  const overdue = await prisma.order.findMany({
    where: { status: "READY_FOR_PICKUP", pickupDeadline: { lt: now } },
    select: { id: true, code: true },
    take: limit,
  });
  for (const o of overdue) {
    try {
      const refund = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { orderId: o.id } });
        if (payment) await lockPaymentWebhook(tx, payment.id);
        const fresh = await tx.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
        if (fresh.status !== "READY_FOR_PICKUP") return undefined;
        return markNotPickedUpTx(tx, fresh, payment, null, "Quá hạn nhận hàng tại quầy");
      });
      if (refund !== undefined) {
        result.notPickedUp += 1;
        if (refund) void notifyManagersNewRefunds(`Đơn ${o.code} quá hạn nhận — cần hoàn ${money(refund.amount).toLocaleString("vi-VN")}đ.`, { refundId: refund.id, orderId: o.id });
      }
    } catch (err) {
      if (!(err instanceof AppError)) throw err; // ORDER_STATE_CHANGED ⇒ instance khác đã xử lý.
    }
  }

  const deliveredBefore = new Date(now.getTime() - shopConfig().autoCompleteDays * 86_400_000);
  const delivered = await prisma.order.findMany({
    where: { status: "DELIVERED", deliveredAt: { lt: deliveredBefore } },
    take: limit,
  });
  for (const o of delivered) {
    try {
      await prisma.$transaction((tx) => transitionOrderTx(tx, o, "COMPLETED", { reason: "Tự động hoàn tất sau thời hạn xác nhận" }));
      result.autoCompleted += 1;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
    }
  }

  if (result.reminded || result.notPickedUp || result.autoCompleted) await flushNotificationOutbox().catch(() => {});
  return result;
}

// ── Tích hợp thanh toán & hoàn tiền ──────────────────────────────────────────

/**
 * SePay báo ĐỦ tiền cho đơn PENDING_PAYMENT (gọi trong transaction chốt tiền, sau `lockPaymentWebhook`):
 * đơn → PAID, trừ hẳn tồn (SALE), payment → SUCCESS/ACTIVATED. Đơn không còn chờ ⇒ trả `false` (caller chuyển đối soát).
 */
export async function settleOrderPaymentTx(tx: Tx, payment: { id: string; orderId: string | null; amount: Prisma.Decimal }, now: Date) {
  const order = await tx.order.findUnique({ where: { id: payment.orderId! }, include: { items: true } });
  if (!order || order.status !== "PENDING_PAYMENT") return { settled: false as const, order };
  await transitionOrderTx(tx, order, "PAID", {
    reason: "SePay xác nhận đã thu tiền",
    notify: {
      title: `Đơn hàng ${order.code}: Đã thanh toán`,
      body: `Đơn ${order.code} (${money(payment.amount).toLocaleString("vi-VN")}đ) đã được thanh toán. ${
        order.fulfillmentType === "PICKUP" ? "Trung tâm sẽ báo khi hàng sẵn sàng nhận tại quầy." : "Trung tâm đang chuẩn bị giao hàng."
      }`,
    },
  });
  for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const sold = await applyInventory(tx, { productId: item.productId, type: "SALE", quantity: item.quantity, orderId: order.id, note: `Đơn ${order.code} đã thanh toán` });
    if (!sold) throw new AppError(`Tồn kho không nhất quán khi chốt đơn ${order.code}.`, 500, { code: "INVENTORY_INCONSISTENT" });
  }
  await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS", paidAt: now, activationStatus: "ACTIVATED" } });
  return { settled: true as const, order };
}

/** Tiền về khi đơn đã EXPIRED/CANCELLED: không khôi phục đơn — tạo Refund ORDER_LATE_PAYMENT cho Manager hoàn. */
export async function createLatePaymentRefundTx(tx: Tx, payment: { id: string; orderId: string | null; memberId: string | null }, amount: number) {
  if (!payment.orderId) return null;
  const order = await tx.order.findUnique({ where: { id: payment.orderId }, select: { id: true, code: true, userId: true } });
  if (!order) return null;
  const existing = await tx.refund.findFirst({ where: { orderId: order.id, reason: "ORDER_LATE_PAYMENT", status: { not: "REJECTED" } } });
  if (existing) return null;
  const refund = await tx.refund.create({
    data: {
      paymentId: payment.id,
      memberId: payment.memberId,
      orderId: order.id,
      reason: "ORDER_LATE_PAYMENT",
      amount,
      note: `Tiền về sau khi đơn ${order.code} đã đóng — hoàn lại cho khách.`,
    },
  });
  await enqueueNotification(tx, {
    userId: order.userId,
    type: "ORDER_UPDATED",
    title: `Đơn hàng ${order.code}: tiền về sau khi đơn đã đóng`,
    body: `Trung tâm đã nhận ${amount.toLocaleString("vi-VN")}đ nhưng đơn ${order.code} đã hết hạn/hủy nên không thể khôi phục. Khoản tiền sẽ được hoàn lại cho bạn.`,
    metadata: { orderId: order.id, refundId: refund.id },
  });
  return refund;
}

/**
 * Manager DUYỆT hoàn tiền của đơn (trong transaction duyệt refund): REFUND_REQUESTED/NOT_PICKED_UP → REFUNDED.
 * Hủy đơn đã thanh toán (ORDER_CANCELLED) ⇒ hàng chưa giao được trả về kho (RETURN).
 */
export async function onOrderRefundApprovedTx(tx: Tx, refund: { orderId: string | null; reason: string }, managerId: string) {
  if (!refund.orderId || refund.reason === "ORDER_LATE_PAYMENT") return;
  const order = await tx.order.findUnique({ where: { id: refund.orderId }, include: { items: true } });
  if (!order || (order.status !== "REFUND_REQUESTED" && order.status !== "NOT_PICKED_UP")) return;
  const wasRequested = order.status === "REFUND_REQUESTED";
  // Đã hoàn tiền ⇒ hết quyền nhận trễ: xóa mã nhận hàng còn giữ.
  await transitionOrderTx(tx, order, "REFUNDED", { actorId: managerId, reason: "Quản lý đã duyệt hoàn tiền", data: { pickupCodeHash: null }, notify: false });
  if (wasRequested) {
    for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await applyInventory(tx, { productId: item.productId, type: "RETURN", quantity: item.quantity, orderId: order.id, actorId: managerId, note: `Hoàn tiền đơn ${order.code} — hàng chưa giao, trả về kho` });
    }
  }
}

/** Manager TỪ CHỐI hoàn tiền yêu cầu hủy: đơn quay về trạng thái ngay trước REFUND_REQUESTED. */
export async function onOrderRefundRejectedTx(tx: Tx, refund: { orderId: string | null; reason: string }, managerId: string, reason: string) {
  if (!refund.orderId || refund.reason !== "ORDER_CANCELLED") return;
  const order = await tx.order.findUnique({ where: { id: refund.orderId } });
  if (!order || order.status !== "REFUND_REQUESTED") return;
  const last = await tx.orderStatusHistory.findFirst({
    where: { orderId: order.id, toStatus: "REFUND_REQUESTED" },
    orderBy: { createdAt: "desc" },
  });
  const back = (last?.fromStatus ?? "PAID") as OrderStatus;
  await transitionOrderTx(tx, order, back, {
    actorId: managerId,
    reason: `Từ chối hoàn tiền: ${reason}`,
    data: { cancelReason: null, cancelledById: null, cancelNote: null },
    notify: false,
  });
}
