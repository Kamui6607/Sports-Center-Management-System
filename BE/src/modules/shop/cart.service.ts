import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { shopConfig } from "../../config/shop.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { availableOf } from "./inventory.js";
import { money } from "./order-view.js";

/**
 * Giỏ hàng lưu ở server (Doc/SHOP_FLOW_DESIGN.md §6). Giỏ KHÔNG giữ tồn kho — chỉ cảnh báo;
 * giữ hàng xảy ra lúc tạo đơn (checkout.service).
 */

export type CartWarningCode =
  | "PRODUCT_INACTIVE"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "MAX_PER_ORDER_EXCEEDED"
  | "PRICE_CHANGED"
  | "DAILY_LIMIT_EXCEEDED";

export interface CartWarning {
  code: CartWarningCode;
  message: string;
  [key: string]: unknown;
}

const CART_INCLUDE = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: { product: true },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** Cảnh báo của MỘT dòng theo trạng thái sản phẩm hiện tại. */
export function lineWarnings(
  product: { isActive: boolean; stockQuantity: number; reservedStock: number; maxPerOrder: number; price: Prisma.Decimal },
  quantity: number,
  snapshotPrice?: Prisma.Decimal | number | null
): CartWarning[] {
  const warnings: CartWarning[] = [];
  const available = availableOf(product);
  if (!product.isActive) {
    warnings.push({ code: "PRODUCT_INACTIVE", message: "Sản phẩm đã ngừng bán." });
    return warnings;
  }
  if (available <= 0) warnings.push({ code: "OUT_OF_STOCK", message: "Sản phẩm đã hết hàng.", available: 0 });
  else if (quantity > available)
    warnings.push({ code: "INSUFFICIENT_STOCK", message: `Chỉ còn ${available} sản phẩm.`, available });
  if (quantity > product.maxPerOrder)
    warnings.push({
      code: "MAX_PER_ORDER_EXCEEDED",
      message: `Tối đa ${product.maxPerOrder} sản phẩm mỗi đơn.`,
      maxPerOrder: product.maxPerOrder,
    });
  if (snapshotPrice !== undefined && snapshotPrice !== null && money(snapshotPrice) !== money(product.price))
    warnings.push({
      code: "PRICE_CHANGED",
      message: `Giá đã đổi từ ${money(snapshotPrice).toLocaleString("vi-VN")}đ thành ${money(product.price).toLocaleString("vi-VN")}đ.`,
      oldPrice: money(snapshotPrice),
      newPrice: money(product.price),
    });
  return warnings;
}

function cartView(cart: CartWithItems | null) {
  const items = (cart?.items ?? []).map((i) => {
    const p = i.product;
    const unitPrice = money(p.price);
    const warnings = lineWarnings(p, i.quantity, i.unitPriceSnapshot);
    return {
      id: i.id,
      productId: p.id,
      productName: p.name,
      imageUrl: p.imageUrl,
      unitPrice,
      unitPriceSnapshot: money(i.unitPriceSnapshot),
      quantity: i.quantity,
      lineTotal: unitPrice * i.quantity,
      availableStock: availableOf(p),
      maxPerOrder: p.maxPerOrder,
      isActive: p.isActive,
      warnings,
      purchasable: !warnings.some((w) => w.code !== "PRICE_CHANGED"),
    };
  });
  const purchasable = items.filter((i) => i.purchasable);
  return {
    id: cart?.id ?? null,
    items,
    /** Số dòng (badge icon giỏ). */
    count: items.length,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: purchasable.reduce((s, i) => s + i.lineTotal, 0),
    hasWarnings: items.some((i) => i.warnings.length > 0),
    updatedAt: cart?.updatedAt ?? null,
  };
}

async function ensureCart(userId: string) {
  const found = await prisma.cart.findUnique({ where: { userId } });
  if (found) return found;
  try {
    return await prisma.cart.create({ data: { userId } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return prisma.cart.findUniqueOrThrow({ where: { userId } });
    throw err;
  }
}

export async function getCart(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId }, include: CART_INCLUDE });
  return cartView(cart);
}

async function loadSellable(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError("Product not found", 404, { code: "PRODUCT_NOT_FOUND" });
  if (!product.isActive) throw new AppError("Sản phẩm đã ngừng bán.", 400, { code: "PRODUCT_INACTIVE", productId });
  return product;
}

function assertQuantity(product: { id: string; maxPerOrder: number; stockQuantity: number; reservedStock: number }, quantity: number) {
  if (quantity > product.maxPerOrder) {
    throw new AppError(`Mỗi đơn chỉ được mua tối đa ${product.maxPerOrder} sản phẩm này.`, 400, {
      code: "MAX_PER_ORDER_EXCEEDED",
      productId: product.id,
      maxPerOrder: product.maxPerOrder,
    });
  }
  const available = availableOf(product);
  if (quantity > available) {
    throw new AppError(
      available <= 0 ? "Sản phẩm đã hết hàng." : `Chỉ còn ${available} sản phẩm trong kho.`,
      409,
      { code: available <= 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK", productId: product.id, available }
    );
  }
}

/** Thêm vào giỏ (cộng dồn nếu đã có). */
export async function addToCart(userId: string, productId: string, quantity: number) {
  const product = await loadSellable(productId);
  const cart = await ensureCart(userId);
  const existing = await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } });
  if (!existing) {
    const lines = await prisma.cartItem.count({ where: { cartId: cart.id } });
    if (lines >= shopConfig().maxCartLines) {
      throw new AppError(`Giỏ hàng tối đa ${shopConfig().maxCartLines} sản phẩm.`, 400, { code: "CART_FULL" });
    }
  }
  const nextQty = (existing?.quantity ?? 0) + quantity;
  assertQuantity(product, nextQty);
  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity: nextQty, unitPriceSnapshot: product.price },
    update: { quantity: nextQty, unitPriceSnapshot: product.price },
  });
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return getCart(userId);
}

/** Đặt lại số lượng một dòng. */
export async function updateCartItem(userId: string, productId: string, quantity: number) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  const item = cart
    ? await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } })
    : null;
  if (!cart || !item) throw new AppError("Sản phẩm không có trong giỏ.", 404, { code: "CART_ITEM_NOT_FOUND" });
  const product = await loadSellable(productId);
  assertQuantity(product, quantity);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity, unitPriceSnapshot: product.price } });
  return getCart(userId);
}

export async function removeCartItem(userId: string, productId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
  return getCart(userId);
}

export async function clearCart(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(userId);
}

/** Khách xác nhận giá hiện tại ⇒ cập nhật snapshot (xóa cảnh báo PRICE_CHANGED). */
export async function acceptCartPrices(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId }, include: CART_INCLUDE });
  if (cart) {
    for (const item of cart.items) {
      if (money(item.unitPriceSnapshot) !== money(item.product.price)) {
        await prisma.cartItem.update({ where: { id: item.id }, data: { unitPriceSnapshot: item.product.price } });
      }
    }
  }
  return getCart(userId);
}
