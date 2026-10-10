import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { shopConfig } from "../../config/shop.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockPaymentWebhook } from "../../utils/dbLocks.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { notifyManagersNewRefunds } from "../refunds/refunds.service.js";
import { applyInventory, availableOf } from "./inventory.js";
import { MANAGER_TRANSITIONS, ORDER_STATUS_LABEL, transitionOrderTx } from "./order-state.js";
import {
  money,
  ORDER_DETAIL_INCLUDE,
  ORDER_LIST_INCLUDE,
  ORDER_STATUS_GROUPS,
  orderManagerView,
  orderOwnerView,
  orderSummaryView,
} from "./order-view.js";
import { hashPickupCode, maskPhone, newPickupNonce, parsePickupInput, phoneLast4, pickupCodeFor } from "./pickup-code.js";

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

export async function cancelMyOrder(userId: string, orderId: string, reason?: string) {
  const order = await ownOrder(userId, orderId);
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
  note: string | null
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
      note,
      memberNote: requestedById ? note : null,
      requestedById,
    },
  });
}

/**
 * Khách yêu cầu hoàn tiền đơn ĐÃ THANH TOÁN (PAID, Trung tâm chưa xử lý): đơn → REFUND_REQUESTED +
 * Refund PENDING (Manager chuyển khoản tay rồi duyệt ở luồng hoàn tiền có sẵn). Hàng vẫn ở kho tới khi duyệt.
 */
export async function requestOrderRefund(userId: string, orderId: string, reason: string) {
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
    return createOrderRefundTx(tx, order, payment, "ORDER_CANCELLED", money(payment.amount), userId, reason);
  });
  void notifyManagersNewRefunds(`Khách yêu cầu hủy đơn ${owned.code} — cần hoàn ${money(refund.amount).toLocaleString("vi-VN")}đ.`, {
    refundId: refund.id,
    orderId,
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

export async function listOrdersForManager(query: { page?: string; limit?: string; status?: string; fulfillmentType?: "PICKUP" | "DELIVERY"; search?: string }) {
  const { page: p, limit, skip } = page(query);
  const search = query.search?.trim();
  const where: Prisma.OrderWhereInput = {
    ...statusFilter(query.status),
    ...(query.fulfillmentType ? { fulfillmentType: query.fulfillmentType } : {}),
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
      include: { ...ORDER_LIST_INCLUDE, user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return {
    orders: orders.map((o) => ({ ...orderSummaryView(o), buyer: o.user })),
    pagination: buildPaginationMeta(total, p, limit),
  };
}

export async function getOrderForManager(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  return orderManagerView(order);
}

export async function managerSummary() {
  const [counts, products] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.product.findMany({ where: { isActive: true }, select: { stockQuantity: true, reservedStock: true, lowStockThreshold: true } }),
  ]);
  const byStatus: Record<string, number> = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const needsAction =
    (byStatus.PAID ?? 0) + (byStatus.PROCESSING ?? 0) + (byStatus.SHIPPING ?? 0) + (byStatus.READY_FOR_PICKUP ?? 0);
  return {
    byStatus,
    needsAction,
    toPrepare: (byStatus.PAID ?? 0) + (byStatus.PROCESSING ?? 0),
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
  const allowed = MANAGER_TRANSITIONS[order.fulfillmentType][order.status] ?? [];
  if (!allowed.includes(body.status)) {
    throw new AppError(
      `Không thể chuyển đơn từ "${ORDER_STATUS_LABEL[order.status]}" sang "${ORDER_STATUS_LABEL[body.status]}".`,
      409,
      { code: "ORDER_INVALID_TRANSITION", from: order.status, to: body.status, allowed }
    );
  }

  if (body.status === "CANCELLED") {
    const closed = await closePendingOrder(orderId, "MANAGER", { actorId: manager.id, note: body.reason ?? null });
    if (!closed) throw new AppError("Đơn vừa thay đổi trạng thái, vui lòng tải lại.", 409, { code: "ORDER_STATE_CHANGED" });
    return getOrderForManager(orderId);
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
        await transitionOrderTx(tx, fresh, "READY_FOR_PICKUP", {
          actorId: manager.id,
          reason,
          data: {
            pickupCodeNonce: nonce,
            pickupCodeHash: hashPickupCode(pickupCodeFor(fresh.id, nonce)),
            pickupDeadline: new Date(Date.now() + shopConfig().pickupDays * 86_400_000),
            pickupFailedAttempts: 0,
            pickupLockedUntil: null,
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
          notify: { body: `Trung tâm đã hủy đơn ${fresh.code}${reason ? ` (${reason})` : ""}. Bạn sẽ được hoàn ${money(payment.amount).toLocaleString("vi-VN")}đ.` },
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

/** READY_FOR_PICKUP → NOT_PICKED_UP: trả hàng lên kệ (RETURN) + Refund theo chính sách (nếu > 0). */
async function markNotPickedUpTx(
  tx: Tx,
  order: { id: string; code: string; userId: string; status: OrderStatus; items: { productId: string; quantity: number }[] },
  payment: { id: string; memberId: string | null; amount: Prisma.Decimal; status: string } | null,
  actorId: string | null,
  reason: string
) {
  const percent = shopConfig().notPickedUpRefundPercent;
  const amount = payment && payment.status === "SUCCESS" ? Math.round((money(payment.amount) * percent) / 100) : 0;
  await transitionOrderTx(tx, order, "NOT_PICKED_UP", {
    actorId,
    reason,
    data: { pickupCodeHash: null },
    notify: {
      body:
        amount > 0
          ? `Đơn ${order.code} đã quá hạn nhận tại quầy. Trung tâm sẽ hoàn ${amount.toLocaleString("vi-VN")}đ (${percent}%) cho bạn.`
          : `Đơn ${order.code} đã quá hạn nhận tại quầy.`,
    },
  });
  for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await applyInventory(tx, { productId: item.productId, type: "RETURN", quantity: item.quantity, orderId: order.id, actorId, note: `Đơn ${order.code} không đến lấy — trả hàng lên kệ` });
  }
  if (amount > 0 && payment) {
    return createOrderRefundTx(tx, order, payment, "ORDER_NOT_PICKED_UP", amount, null, `Không đến lấy hàng — hoàn ${percent}%`);
  }
  return null;
}

/** Tra mã nhận hàng (QR hoặc nhập tay) ⇒ tóm tắt đơn để đối chiếu (SĐT đã che). Không đổi dữ liệu. */
export async function verifyPickupCode(raw: string) {
  const { orderCode, code } = parsePickupInput(raw);
  const order = await prisma.order.findUnique({ where: { pickupCodeHash: hashPickupCode(code) }, include: ORDER_LIST_INCLUDE });
  if (!order || order.status !== "READY_FOR_PICKUP" || (orderCode && orderCode !== order.code)) {
    throw new AppError("Mã nhận hàng không đúng hoặc đơn không ở trạng thái chờ nhận.", 400, { code: "PICKUP_CODE_INVALID" });
  }
  return {
    ...orderSummaryView(order),
    recipientPhoneMasked: maskPhone(order.recipientPhone),
    pickupLockedUntil: order.pickupLockedUntil && order.pickupLockedUntil > new Date() ? order.pickupLockedUntil : null,
  };
}

/**
 * Xác nhận giao hàng tại quầy: mã đúng (hash) + 4 số cuối SĐT người nhận ⇒ COMPLETED (mã bị xóa ⇒ dùng một lần).
 * Sai mã/SĐT ⇒ tăng `pickupFailedAttempts`; đủ `SHOP_PICKUP_MAX_ATTEMPTS` ⇒ khóa `SHOP_PICKUP_LOCK_MINUTES` (423).
 */
export async function confirmPickup(manager: Actor, orderId: string, rawCode: string, last4: string) {
  const cfg = shopConfig();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404, { code: "ORDER_NOT_FOUND" });
  if (order.status !== "READY_FOR_PICKUP") {
    throw new AppError(
      order.status === "COMPLETED" ? "Đơn đã được giao — mã nhận hàng đã dùng." : `Đơn đang ở trạng thái "${ORDER_STATUS_LABEL[order.status]}".`,
      409,
      { code: order.status === "COMPLETED" ? "PICKUP_CODE_USED" : "ORDER_NOT_READY", status: order.status }
    );
  }
  if (order.pickupLockedUntil && order.pickupLockedUntil > new Date()) {
    throw new AppError("Nhập sai quá nhiều lần — tạm khóa xác nhận đơn này.", 423, { code: "PICKUP_LOCKED", lockedUntil: order.pickupLockedUntil });
  }

  const { orderCode, code } = parsePickupInput(rawCode);
  const codeOk = order.pickupCodeHash !== null && hashPickupCode(code) === order.pickupCodeHash && (!orderCode || orderCode === order.code);
  // Đơn tạo qua API cũ có thể không có SĐT người nhận ⇒ chỉ đối chiếu mã.
  const phoneOk = !order.recipientPhone || phoneLast4(order.recipientPhone) === last4;
  if (!codeOk || !phoneOk) {
    const attempts = order.pickupFailedAttempts + 1;
    const lock = attempts >= cfg.pickupMaxAttempts;
    const lockedUntil = lock ? new Date(Date.now() + cfg.pickupLockMinutes * 60_000) : null;
    await prisma.order.updateMany({
      where: { id: order.id, status: "READY_FOR_PICKUP" },
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

  await prisma.$transaction((tx) =>
    transitionOrderTx(tx, order, "COMPLETED", {
      actorId: manager.id,
      reason: "Giao hàng tại quầy (đã đối chiếu mã + SĐT)",
      // Dùng một lần: xóa hash ⇒ mã cũ không còn tra được.
      data: { pickupCodeHash: null, pickupFailedAttempts: 0, pickupLockedUntil: null },
      notify: { body: `Bạn đã nhận đơn ${order.code} tại quầy. Cảm ơn bạn! Hãy đánh giá sản phẩm nhé.` },
    })
  );
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
 * 2. READY_FOR_PICKUP quá `pickupDeadline` ⇒ NOT_PICKED_UP + trả hàng + Refund theo chính sách.
 * 3. DELIVERED quá `SHOP_AUTO_COMPLETE_DAYS` ⇒ COMPLETED.
 */
export async function runShopMaintenance(limit = 50) {
  const now = new Date();
  const result = { expired: 0, notPickedUp: 0, autoCompleted: 0 };

  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lt: now } },
    select: { id: true },
    orderBy: { paymentExpiresAt: "asc" },
    take: limit,
  });
  for (const { id } of stale) {
    if (await closePendingOrder(id, "EXPIRED")) result.expired += 1;
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

  if (result.notPickedUp || result.autoCompleted) await flushNotificationOutbox().catch(() => {});
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
  await transitionOrderTx(tx, order, "REFUNDED", { actorId: managerId, reason: "Quản lý đã duyệt hoàn tiền", notify: false });
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
