import crypto from "node:crypto";
import { Prisma, type Product } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { buildSepayPaymentCode, buildVietQrUrl, isSepayConfigured, sepayConfig } from "../../config/sepay.js";
import { isDeliverableProvince, shippingFeeFor, shopConfig } from "../../config/shop.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockUserOrder } from "../../utils/dbLocks.js";
import { flushNotificationOutbox } from "../notifications/outbox.service.js";
import { buildSepayCheckoutView, SEPAY_GATEWAY } from "../payments/sepay-payments.service.js";
import { formatAddress } from "./address.service.js";
import { lineWarnings, type CartWarning } from "./cart.service.js";
import { applyInventory, availableOf } from "./inventory.js";
import { money, ORDER_DETAIL_INCLUDE, orderOwnerView } from "./order-view.js";
import type { CheckoutInput } from "./shop.schema.js";

/**
 * Checkout cửa hàng (Doc/SHOP_FLOW_DESIGN.md §4–§6):
 * xem trước (không ghi) → tạo đơn: giữ hàng có điều kiện trong transaction + Payment SePay PENDING.
 * Server tự tính đơn giá/tạm tính/phí ship/tổng — mọi giá từ client bị bỏ qua.
 */

const ACTIVE_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "NOT_PICKED_UP",
  "REFUND_REQUESTED",
  "REFUNDED",
] as const;

type Line = { productId: string; quantity: number; snapshotPrice?: Prisma.Decimal | null };

/** 00:00 hôm nay theo giờ Việt Nam (UTC+7). */
export function vnStartOfDay(now = new Date()): Date {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3_600_000);
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
/** Mã đơn dễ đọc: DH + yyMMdd (giờ VN) + "-" + 6 ký tự ngẫu nhiên. UNIQUE trong DB (caller retry khi trùng). */
export function newOrderCode(now = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${String(vn.getUTCFullYear()).slice(2)}${pad(vn.getUTCMonth() + 1)}${pad(vn.getUTCDate())}`;
  const bytes = crypto.randomBytes(6);
  let suffix = "";
  for (const b of bytes) suffix += CODE_ALPHABET[b % 32];
  return `DH${date}-${suffix}`;
}

/** Gộp dòng trùng sản phẩm; sắp theo productId (thứ tự giữ hàng cố định). */
function mergeLines(lines: Line[]): Line[] {
  const merged = new Map<string, Line>();
  for (const l of lines) {
    const cur = merged.get(l.productId);
    merged.set(l.productId, { productId: l.productId, quantity: (cur?.quantity ?? 0) + l.quantity, snapshotPrice: l.snapshotPrice ?? cur?.snapshotPrice });
  }
  return [...merged.values()].sort((a, b) => a.productId.localeCompare(b.productId));
}

async function resolveLines(userId: string, input: CheckoutInput): Promise<Line[]> {
  if (input.mode === "BUY_NOW") return mergeLines(input.items ?? []);
  const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  const selected = input.productIds?.length ? new Set(input.productIds) : null;
  const lines = (cart?.items ?? [])
    .filter((i) => !selected || selected.has(i.productId))
    .map((i) => ({ productId: i.productId, quantity: i.quantity, snapshotPrice: i.unitPriceSnapshot }));
  return mergeLines(lines);
}

/** Tổng số lượng đã đặt hôm nay (giờ VN) theo sản phẩm — không tính đơn hết hạn/đã hủy. */
async function orderedToday(db: Prisma.TransactionClient | typeof prisma, userId: string, productIds: string[]) {
  const rows = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: { userId, createdAt: { gte: vnStartOfDay() }, status: { in: [...ACTIVE_ORDER_STATUSES] } },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
}

async function countPending(db: Prisma.TransactionClient | typeof prisma, userId: string) {
  return db.order.count({
    where: { userId, status: "PENDING_PAYMENT", paymentExpiresAt: { gt: new Date() } },
  });
}

interface Recipient {
  recipientName: string | null;
  recipientPhone: string | null;
  shippingAddress: string | null;
  shippingProvince: string | null;
}

/**
 * Tính toàn bộ đơn từ dữ liệu SERVER. `strict` (lúc đặt thật) ⇒ ném lỗi có mã ở vấn đề đầu tiên;
 * không strict (xem trước) ⇒ gom thành cảnh báo để app hiển thị một lần.
 */
async function evaluate(userId: string, input: CheckoutInput, strict: boolean, legacy = false) {
  const cfg = shopConfig();
  const lines = await resolveLines(userId, input);
  const issues: CartWarning[] = [];
  const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => {
    if (strict) throw new AppError(message, status, { code, ...extra });
    issues.push({ code: code as CartWarning["code"], message, ...extra });
  };

  if (lines.length === 0) fail(400, "CART_EMPTY", "Chưa có sản phẩm nào để đặt.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, phone: true, checkoutLockedUntil: true },
  });
  const lockedUntil = user?.checkoutLockedUntil && user.checkoutLockedUntil > new Date() ? user.checkoutLockedUntil : null;
  if (lockedUntil) {
    fail(
      403,
      "CHECKOUT_LOCKED",
      `Bạn đã để quá nhiều đơn hết hạn thanh toán. Tạm khóa đặt hàng tới ${lockedUntil.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`,
      { lockedUntil }
    );
  }

  const products = await prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
  const byId = new Map<string, Product>(products.map((p) => [p.id, p]));
  const today = await orderedToday(prisma, userId, lines.map((l) => l.productId));

  const lineViews = lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) {
      fail(404, "PRODUCT_NOT_FOUND", "Sản phẩm không còn tồn tại.", { productId: l.productId });
      return null;
    }
    const unitPrice = money(p.price);
    const warnings = lineWarnings(p, l.quantity, input.mode === "CART" ? l.snapshotPrice : undefined);
    const used = today.get(p.id) ?? 0;
    if (used + l.quantity > p.maxPerDay) {
      warnings.push({
        code: "DAILY_LIMIT_EXCEEDED",
        message: `Mỗi ngày chỉ được đặt tối đa ${p.maxPerDay} sản phẩm "${p.name}" (hôm nay còn ${Math.max(0, p.maxPerDay - used)}).`,
        maxPerDay: p.maxPerDay,
        remainingToday: Math.max(0, p.maxPerDay - used),
      });
    }
    if (strict) {
      for (const w of warnings) {
        if (w.code === "PRICE_CHANGED") continue; // giá đổi xử lý bằng expectedTotal bên dưới.
        const status = w.code === "PRODUCT_INACTIVE" || w.code === "MAX_PER_ORDER_EXCEEDED" || w.code === "DAILY_LIMIT_EXCEEDED" ? 400 : 409;
        throw new AppError(`${p.name}: ${w.message}`, status, { ...w, productId: p.id });
      }
    }
    return {
      productId: p.id,
      productName: p.name,
      imageUrl: p.imageUrl,
      unitPrice,
      quantity: l.quantity,
      lineTotal: unitPrice * l.quantity,
      availableStock: availableOf(p),
      maxPerOrder: p.maxPerOrder,
      maxPerDay: p.maxPerDay,
      warnings,
    };
  });
  const validLines = lineViews.filter((l): l is NonNullable<typeof l> => l !== null);

  const subtotal = validLines.reduce((s, l) => s + l.lineTotal, 0);
  const shippingFee = shippingFeeFor(input.fulfillmentType, subtotal, cfg);
  const total = subtotal + shippingFee;

  // Người nhận + địa chỉ (snapshot).
  const recipient: Recipient = {
    recipientName: input.recipientName ?? user?.fullName ?? null,
    recipientPhone: input.recipientPhone ?? user?.phone ?? null,
    shippingAddress: null,
    shippingProvince: null,
  };
  let address: { id: string; fullAddress: string; deliverable: boolean } | null = null;
  if (input.fulfillmentType === "DELIVERY") {
    if (!input.addressId) {
      fail(400, "ADDRESS_REQUIRED", "Vui lòng chọn địa chỉ giao hàng.");
    } else {
      const a = await prisma.userAddress.findFirst({ where: { id: input.addressId, userId } });
      if (!a) {
        fail(404, "ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ giao hàng.");
      } else {
        const deliverable = isDeliverableProvince(a.province, cfg);
        address = { id: a.id, fullAddress: formatAddress(a), deliverable };
        recipient.recipientName = input.recipientName ?? a.recipientName;
        recipient.recipientPhone = input.recipientPhone ?? a.phone;
        recipient.shippingAddress = formatAddress(a);
        recipient.shippingProvince = a.province;
        if (!deliverable) {
          fail(400, "DELIVERY_NOT_AVAILABLE", `Hiện chỉ giao hàng tại: ${cfg.deliveryProvinces.join(", ")}.`, {
            deliveryProvinces: cfg.deliveryProvinces,
          });
        }
      }
    }
  }
  // API cũ `POST /products/orders` không có SĐT ⇒ cho phép thiếu (khi nhận hàng chỉ đối chiếu mã).
  if (!recipient.recipientPhone && !legacy) {
    fail(400, "RECIPIENT_PHONE_REQUIRED", "Vui lòng nhập số điện thoại người nhận (dùng để đối chiếu khi nhận hàng).");
  }

  const pendingOrders = await countPending(prisma, userId);
  // Lúc đặt thật, giới hạn đơn chờ được kiểm tra trong transaction (sau lock, kèm danh sách đơn chờ).
  if (!strict && pendingOrders >= cfg.maxPendingOrders) {
    fail(409, "PENDING_ORDER_LIMIT", `Bạn đang có ${pendingOrders} đơn chờ thanh toán. Vui lòng thanh toán hoặc hủy bớt trước khi đặt đơn mới.`, {
      maxPendingOrders: cfg.maxPendingOrders,
    });
  }

  const blocking = [...issues, ...validLines.flatMap((l) => l.warnings)].filter((w) => w.code !== "PRICE_CHANGED");
  return {
    lines: validLines,
    subtotal,
    shippingFee,
    total,
    fulfillmentType: input.fulfillmentType,
    recipient,
    address,
    freeShippingThreshold: cfg.freeShippingThreshold,
    holdMinutes: cfg.holdMinutes,
    pendingOrders,
    maxPendingOrders: cfg.maxPendingOrders,
    lockedUntil,
    warnings: issues,
    canCheckout: blocking.length === 0 && validLines.length > 0,
  };
}

export async function previewCheckout(userId: string, input: CheckoutInput) {
  return evaluate(userId, input, false);
}

function requestHash(input: CheckoutInput): string {
  const normalized = {
    mode: input.mode,
    productIds: [...(input.productIds ?? [])].sort(),
    items: [...(input.items ?? [])].sort((a, b) => a.productId.localeCompare(b.productId)),
    fulfillmentType: input.fulfillmentType,
    addressId: input.addressId ?? null,
    expectedTotal: input.expectedTotal ?? null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

async function checkoutResult(orderId: string, replayed: boolean) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
  return {
    order: orderOwnerView(order),
    checkout: {
      ...buildSepayCheckoutView(payment, null, order.paymentExpiresAt ?? undefined),
      order: { id: order.id, code: order.code, totalPrice: money(order.totalPrice), status: order.status, fulfillmentType: order.fulfillmentType },
    },
    replayed,
  };
}

/**
 * Tạo đơn (MEMBER/COACH). Thứ tự kiểm tra: idempotency → khóa đặt hàng → tính lại toàn bộ (strict) →
 * `expectedTotal` khớp → transaction [lock theo người mua → kiểm tra lại idempotency/đơn chờ/giới hạn ngày →
 * giữ hàng từng dòng (UPDATE có điều kiện) → tạo Order + OrderItem + lịch sử + Payment SePay → xóa dòng giỏ đã đặt].
 */
export async function createOrder(
  user: { id: string; role: string },
  input: CheckoutInput,
  idempotencyKey: string | undefined,
  opts: { legacy?: boolean } = {}
) {
  if (user.role !== "MEMBER" && user.role !== "COACH") {
    throw new AppError("Forbidden: only MEMBER or COACH can buy products", 403);
  }
  if (!isSepayConfigured()) {
    throw new AppError("Cổng thanh toán SePay chưa được cấu hình. Vui lòng liên hệ quản lý.", 503, {
      code: "SEPAY_NOT_CONFIGURED",
      gateway: SEPAY_GATEWAY,
    });
  }
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new AppError("Thiếu khóa chống đặt trùng (header Idempotency-Key).", 400, { code: "IDEMPOTENCY_KEY_REQUIRED" });
  }
  const hash = requestHash(input);

  const existing = await prisma.order.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: key } } });
  if (existing) {
    if (existing.idempotencyHash !== hash) {
      throw new AppError("Khóa chống đặt trùng đã dùng cho một đơn khác.", 409, { code: "IDEMPOTENCY_KEY_REUSED", orderId: existing.id });
    }
    return checkoutResult(existing.id, true);
  }

  const evaluated = await evaluate(user.id, input, true, opts.legacy);
  if (!opts.legacy && input.expectedTotal !== evaluated.total) {
    throw new AppError("Giá hoặc phí giao hàng đã thay đổi. Vui lòng xem lại đơn trước khi thanh toán.", 409, {
      code: "PRICE_CHANGED",
      expectedTotal: input.expectedTotal,
      preview: { ...evaluated, warnings: [] },
    });
  }
  if (evaluated.total <= 0) throw new AppError("Đơn hàng 0đ không cần thanh toán qua SePay.", 400, { code: "ORDER_ZERO_AMOUNT" });

  const memberProfile =
    user.role === "MEMBER"
      ? await prisma.memberProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;
  if (user.role === "MEMBER" && !memberProfile) throw new AppError("Member profile not found", 404);

  const cfg = shopConfig();
  const sepay = sepayConfig();

  for (let attempt = 0; attempt < 5; attempt++) {
    const orderCode = newOrderCode();
    const transferCode = buildSepayPaymentCode(sepay);
    try {
      const orderId = await prisma.$transaction(async (tx) => {
        await lockUserOrder(tx, user.id);
        // Hai request cùng khóa chạy song song: request sau thấy đơn của request trước SAU lock.
        const dup = await tx.order.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: key } } });
        if (dup) {
          if (dup.idempotencyHash !== hash) {
            throw new AppError("Khóa chống đặt trùng đã dùng cho một đơn khác.", 409, { code: "IDEMPOTENCY_KEY_REUSED", orderId: dup.id });
          }
          return dup.id;
        }

        const pending = await countPending(tx, user.id);
        if (pending >= cfg.maxPendingOrders) {
          const open = await tx.order.findMany({
            where: { userId: user.id, status: "PENDING_PAYMENT", paymentExpiresAt: { gt: new Date() } },
            select: { id: true, code: true, payment: { select: { id: true } } },
          });
          throw new AppError(
            `Bạn đang có ${pending} đơn chờ thanh toán. Vui lòng thanh toán hoặc hủy bớt trước khi đặt đơn mới.`,
            409,
            {
              code: "PENDING_ORDER_LIMIT",
              maxPendingOrders: cfg.maxPendingOrders,
              pendingOrders: open.map((o) => ({ id: o.id, code: o.code, paymentId: o.payment?.id ?? null })),
            }
          );
        }

        const today = await orderedToday(tx, user.id, evaluated.lines.map((l) => l.productId));
        for (const l of evaluated.lines) {
          const used = today.get(l.productId) ?? 0;
          if (used + l.quantity > l.maxPerDay) {
            throw new AppError(`${l.productName}: mỗi ngày chỉ được đặt tối đa ${l.maxPerDay} sản phẩm.`, 400, {
              code: "DAILY_LIMIT_EXCEEDED",
              productId: l.productId,
              maxPerDay: l.maxPerDay,
              remainingToday: Math.max(0, l.maxPerDay - used),
            });
          }
        }

        const now = new Date();
        const order = await tx.order.create({
          data: {
            code: orderCode,
            userId: user.id,
            fulfillmentType: evaluated.fulfillmentType,
            subtotal: evaluated.subtotal,
            shippingFee: evaluated.shippingFee,
            totalPrice: evaluated.total,
            status: "PENDING_PAYMENT",
            ...evaluated.recipient,
            note: input.note ?? null,
            paymentExpiresAt: new Date(now.getTime() + cfg.holdMinutes * 60_000),
            idempotencyKey: key,
            idempotencyHash: hash,
            items: {
              create: evaluated.lines.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                productImageUrl: l.imageUrl,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                totalAmount: l.lineTotal,
              })),
            },
            history: { create: { fromStatus: null, toStatus: "PENDING_PAYMENT", actorId: user.id, reason: "Tạo đơn" } },
          },
        });

        // Giữ hàng: một câu UPDATE có điều kiện / dòng (thứ tự productId) — hai người cùng mua món cuối: chỉ một thắng.
        for (const l of evaluated.lines) {
          const reserved = await applyInventory(tx, {
            productId: l.productId,
            type: "RESERVE",
            quantity: l.quantity,
            orderId: order.id,
            actorId: user.id,
            note: `Giữ hàng cho đơn ${orderCode}`,
          });
          if (!reserved) {
            const fresh = await tx.product.findUnique({ where: { id: l.productId } });
            const available = fresh ? availableOf(fresh) : 0;
            throw new AppError(
              available <= 0 ? `${l.productName}: sản phẩm vừa hết hàng.` : `${l.productName}: chỉ còn ${available} sản phẩm.`,
              409,
              { code: available <= 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK", productId: l.productId, available }
            );
          }
        }

        const summary = evaluated.lines.map((l) => `${l.productName} × ${l.quantity}`).join(", ");
        await tx.payment.create({
          data: {
            memberId: memberProfile?.id ?? null,
            orderId: order.id,
            amount: evaluated.total,
            method: "SEPAY",
            status: "PENDING",
            transactionCode: transferCode,
            gateway: SEPAY_GATEWAY,
            note: `Thanh toán online đơn hàng ${orderCode}: ${summary} (chuyển khoản VietQR qua SePay)`,
            gatewayPayload: {
              provider: SEPAY_GATEWAY,
              orderCode: transferCode,
              qrUrl: buildVietQrUrl({ amount: evaluated.total, content: transferCode }),
              transferContent: transferCode,
              bankId: sepay.bankId,
              accountNo: sepay.accountNo,
            },
          },
        });

        if (input.mode === "CART") {
          const cart = await tx.cart.findUnique({ where: { userId: user.id } });
          if (cart) {
            await tx.cartItem.deleteMany({
              where: { cartId: cart.id, productId: { in: evaluated.lines.map((l) => l.productId) } },
            });
          }
        }
        return order.id;
      });
      await flushNotificationOutbox().catch(() => {});
      return checkoutResult(orderId, false);
    } catch (err) {
      // Trùng mã đơn / mã CK (cực hiếm) ⇒ thử lại cả transaction với mã mới.
      const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
      if ((err as { code?: string }).code === "P2002" && !target.includes("idempotencyKey")) continue;
      if ((err as { code?: string }).code === "P2002") {
        const dup = await prisma.order.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: key } } });
        if (dup && dup.idempotencyHash === hash) return checkoutResult(dup.id, true);
      }
      throw err;
    }
  }
  throw new AppError("Không tạo được mã đơn (trùng mã). Vui lòng thử lại.", 500, { code: "ORDER_CODE_COLLISION" });
}
