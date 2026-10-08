import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { lockPaymentWebhook } from "../../utils/dbLocks.js";
import { sepayConfig } from "../../config/sepay.js";

export async function createProduct(data: any, createdById: string) {
  return prisma.product.create({
    data: {
      ...data,
      createdById,
    },
  });
}

export async function listProducts(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.search) {
    where.name = { contains: query.search, mode: "insensitive" };
  }
  // Mặc định chỉ trả sản phẩm đang bán (màn mua hàng của Member/Coach).
  // ?isActive=false: chỉ sản phẩm đã ngừng bán; ?isActive=all: tất cả (màn quản lý của Manager).
  if (query.isActive !== "all") {
    where.isActive = query.isActive !== "false";
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { products, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      reviews: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

export async function updateProduct(id: string, data: any) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);

  return prisma.product.update({
    where: { id },
    data,
  });
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);

  return prisma.product.delete({ where: { id } });
}

// ── Mua hàng (Order + OrderItem) ─────────────────────────────────────────────

// Tạo đơn + giao dịch SePay: xem `createOrderSepayCheckout` (payments/sepay-payments.service.ts).
// Mỗi dòng hàng: totalAmount = quantity × unitPrice; Order.totalPrice = tổng các totalAmount.
// Đơn chỉ thành SUCCESS khi SePay báo đã thu tiền; hủy / hết hạn ⇒ CANCELLED + hoàn kho TỪNG sản phẩm (bên dưới).

const ORDER_INCLUDE = {
  items: {
    include: { product: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  // FE cần mã đơn + trạng thái tiền để mở lại màn QR khi đơn còn PENDING.
  payment: { select: { id: true, status: true, transactionCode: true, paidAt: true } },
};

export async function listMyOrders(userId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const [total, orders] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.findMany({
      where: { userId },
      include: ORDER_INCLUDE,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { orders, pagination: buildPaginationMeta(total, page, limit) };
}

// ── Hủy / hết hạn đơn chờ thanh toán: hoàn kho ───────────────────────────────

/**
 * Đóng MỘT đơn đang PENDING: payment PENDING → FAILED, đơn → CANCELLED, cộng trả kho cho từng dòng hàng.
 * Chạy dưới `lockPaymentWebhook` (cùng lock với luồng chốt tiền SePay) và đọc lại trạng thái SAU lock:
 * nếu tiền vừa về trước đó thì KHÔNG hủy. Tiền về SAU khi hủy ⇒ luồng SePay ghi LATE để hoàn tiền.
 * @returns `true` nếu đơn đã được hủy trong lần gọi này.
 */
export async function closePendingOrder(orderId: string, note: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { payment: { select: { id: true } } },
    });
    if (!current) return false;
    if (current.payment) await lockPaymentWebhook(tx, current.payment.id);

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: { select: { id: true, status: true } } },
    });
    if (!order || order.status !== "PENDING") return false;
    if (order.payment && order.payment.status !== "PENDING") return false;

    if (order.payment) {
      await tx.payment.update({ where: { id: order.payment.id }, data: { status: "FAILED", note } });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    // Hoàn kho theo thứ tự productId cố định (tránh deadlock giữa hai đơn cùng hủy).
    for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }
    return true;
  });
}

/** Người đặt đơn (hoặc MANAGER) hủy đơn còn chờ chuyển khoản ⇒ hoàn kho. */
export async function cancelOrder(orderId: string, actor: { id: string; role: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);
  if (actor.role !== "MANAGER" && order.userId !== actor.id) {
    throw new AppError("Forbidden: You can only cancel your own orders", 403);
  }
  if (order.status !== "PENDING") {
    throw new AppError("Only PENDING orders can be cancelled", 400);
  }

  const closed = await closePendingOrder(orderId, "Đơn hàng bị hủy trước khi thanh toán — đã hoàn kho.");
  if (!closed) {
    throw new AppError("Đơn đã được thanh toán hoặc không còn ở trạng thái chờ — không thể hủy.", 409);
  }

  return prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
}

/**
 * Worker (server.ts): hủy các đơn PENDING quá thời hạn chờ chuyển khoản (`VIETQR_PAYMENT_TTL_MINUTES`)
 * và hoàn kho. An toàn khi chạy song song với webhook nhờ `closePendingOrder`.
 * @returns số đơn đã hủy trong lượt này.
 */
export async function expireStaleOrders(limit = 50): Promise<number> {
  const ttlMs = sepayConfig().ttlMinutes * 60 * 1000;
  const stale = await prisma.order.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - ttlMs) } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let closed = 0;
  for (const { id } of stale) {
    const ok = await closePendingOrder(
      id,
      "Hết hạn chờ thanh toán chuyển khoản — đơn hàng bị hủy, đã hoàn kho."
    );
    if (ok) closed += 1;
  }
  return closed;
}

// ── Đánh giá ─────────────────────────────────────────────────────────────────

export async function addProductReview(userId: string, productId: string, data: { rating: number; comment?: string }) {
  // Chỉ cho đánh giá nếu đã từng mua thành công sản phẩm này
  const orderCount = await prisma.orderItem.count({
    where: { productId, order: { userId, status: "SUCCESS" } },
  });
  if (orderCount === 0) {
    throw new AppError("You can only review products that you have successfully purchased.", 403);
  }

  // Check đã review chưa
  const existingReview = await prisma.productReview.findUnique({
    where: { productId_userId: { productId, userId } },
  });
  if (existingReview) {
    throw new AppError("You have already reviewed this product. Please update your existing review.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.productReview.create({
      data: {
        userId,
        productId,
        rating: data.rating,
        comment: data.comment,
      },
    });

    // Tính toán lại rating 5 sao trung bình
    const aggregations = await tx.productReview.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const newRating = aggregations._avg.rating ?? 0;
    const newCount = aggregations._count.rating;

    await tx.product.update({
      where: { id: productId },
      data: {
        rating: newRating,
        reviewCount: newCount,
      },
    });

    return review;
  });
}
