import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createOrder as createShopOrder } from "../shop/checkout.service.js";
import { applyInventory, availableOf } from "../shop/inventory.js";
import { ORDER_LIST_INCLUDE, orderSummaryView } from "../shop/order-view.js";
import {
  cancelMyOrder,
  closePendingOrder as closeShopPendingOrder,
  reviewProductLegacy,
  runShopMaintenance,
} from "../shop/orders.service.js";

/**
 * Sản phẩm + các endpoint cửa hàng CŨ (`/products/orders`, `/products/my/orders`, `/products/:id/reviews`) —
 * giữ để tương thích, logic thật nằm ở `modules/shop` (Doc/SHOP_FLOW_DESIGN.md).
 * `stockQuantity` = tồn thực tế; response thêm `availableStock` (= stock − reserved) cho màn mua hàng.
 */

function withStock<T extends { stockQuantity: number; reservedStock: number }>(p: T) {
  return { ...p, availableStock: availableOf(p) };
}

export async function createProduct(data: any, createdById: string) {
  const { stockQuantity = 0, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...rest,
        imageUrls: rest.imageUrls ?? (rest.imageUrl ? [rest.imageUrl] : []),
        stockQuantity: 0,
        createdById,
      },
    });
    if (stockQuantity > 0) {
      await applyInventory(tx, { productId: product.id, type: "IN", quantity: stockQuantity, actorId: createdById, note: "Tồn đầu khi tạo sản phẩm" });
    }
    return withStock(await tx.product.findUniqueOrThrow({ where: { id: product.id } }));
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

  return { products: products.map(withStock), pagination: buildPaginationMeta(total, page, limit) };
}

/** Chi tiết sản phẩm. Đánh giá bị Manager ẩn chỉ hiển thị cho Manager. */
export async function getProductById(id: string, viewer?: { id: string; role: string }) {
  const isManager = viewer?.role === "MANAGER";
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      reviews: {
        where: isManager ? {} : { isHidden: false },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!product) throw new AppError("Product not found", 404);
  return withStock(product);
}

/**
 * Sửa sản phẩm. Đổi `stockQuantity` trực tiếp (API cũ) vẫn được nhận nhưng ghi thành điều chỉnh kho (ADJUST)
 * và không được thấp hơn số đang giữ cho đơn chờ thanh toán.
 */
export async function updateProduct(id: string, data: any, actorId?: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);

  const { stockQuantity, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    if (Object.keys(rest).length > 0) {
      await tx.product.update({ where: { id }, data: rest });
    }
    if (typeof stockQuantity === "number" && stockQuantity !== product.stockQuantity) {
      const ok = await applyInventory(tx, {
        productId: id,
        type: "ADJUST",
        quantity: stockQuantity - product.stockQuantity,
        actorId: actorId ?? null,
        note: "Điều chỉnh tồn khi sửa sản phẩm",
      });
      if (!ok) {
        throw new AppError(`Tồn kho không được thấp hơn số đang giữ cho đơn chờ thanh toán (${product.reservedStock}).`, 409, {
          code: "STOCK_BELOW_RESERVED",
          reservedStock: product.reservedStock,
        });
      }
    }
    return withStock(await tx.product.findUniqueOrThrow({ where: { id } }));
  });
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);

  return prisma.product.delete({ where: { id } });
}

// ── Mua hàng (API cũ — tương thích) ──────────────────────────────────────────

/** `POST /products/orders` (cũ): đơn NHẬN TẠI QUẦY, người nhận lấy từ hồ sơ; áp đủ giới hạn chống phá của cửa hàng. */
export async function createLegacyOrder(user: { id: string; role: string }, items: { productId: string; quantity: number }[], idempotencyKey?: string) {
  const result = await createShopOrder(
    user,
    { mode: "BUY_NOW", items, fulfillmentType: "PICKUP" },
    idempotencyKey ?? `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    { legacy: true }
  );
  // Giữ đúng shape cũ: view QR + `order{ id, totalPrice, status, items[] }`.
  return {
    ...result.checkout,
    order: {
      ...result.checkout.order,
      items: result.order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalAmount: i.totalAmount,
      })),
    },
  };
}

/** `GET /products/my/orders` (cũ): giữ `items[].product{ id, name }` + `payment` như trước, thêm field mới. */
export async function listMyOrders(userId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const [total, orders] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.findMany({
      where: { userId },
      include: {
        ...ORDER_LIST_INCLUDE,
        items: { include: { product: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    orders: orders.map((o) => ({
      ...o,
      ...orderSummaryView(o),
      items: o.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), totalAmount: Number(i.totalAmount) })),
    })),
    pagination: buildPaginationMeta(total, page, limit),
  };
}

/** `POST /products/orders/:id/cancel` (cũ): người mua hủy đơn chờ thanh toán; MANAGER hủy hộ. */
export async function cancelOrder(orderId: string, actor: { id: string; role: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);
  if (actor.role !== "MANAGER" && order.userId !== actor.id) {
    throw new AppError("Forbidden: You can only cancel your own orders", 403);
  }
  if (order.status !== "PENDING_PAYMENT") {
    throw new AppError("Only PENDING orders can be cancelled", 400, { code: "ORDER_NOT_CANCELLABLE", status: order.status });
  }
  if (actor.role === "MANAGER" && order.userId !== actor.id) {
    const closed = await closeShopPendingOrder(orderId, "MANAGER", { actorId: actor.id });
    if (!closed) throw new AppError("Đơn đã được thanh toán hoặc không còn ở trạng thái chờ — không thể hủy.", 409);
  } else {
    await cancelMyOrder(actor.id, orderId);
  }
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, transactionCode: true, paidAt: true } } },
  });
}

/** Giữ tên cũ cho mã gọi từ nơi khác (đóng đơn chờ thanh toán). */
export async function closePendingOrder(orderId: string, _note: string, reason: "BUYER" | "EXPIRED" | "MANAGER" = "EXPIRED") {
  return closeShopPendingOrder(orderId, reason);
}

/** Worker cũ ⇒ job cửa hàng đầy đủ (hết hạn, quá hạn nhận, tự hoàn tất). Trả số đơn hết hạn. */
export async function expireStaleOrders(limit = 50): Promise<number> {
  return (await runShopMaintenance(limit)).expired;
}

// ── Đánh giá (API cũ) ────────────────────────────────────────────────────────

/** `POST /products/:id/reviews` (cũ): cần một dòng đơn COMPLETED chưa đánh giá (tự chọn dòng cũ nhất hoặc `orderItemId`). */
export async function addProductReview(userId: string, productId: string, data: { rating: number; comment?: string; orderItemId?: string }) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError("Product not found", 404);
  return reviewProductLegacy(userId, productId, data);
}

