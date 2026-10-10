import { sepayConfig, stripDiacritics } from "./sepay.js";

/**
 * Cấu hình nghiệp vụ cửa hàng (Doc/SHOP_FLOW_DESIGN.md §2.3).
 * Đọc env ĐỘNG mỗi lần gọi (giống `sepayConfig`) để e2e có thể đổi giữa các kịch bản.
 */
export function shopConfig() {
  return {
    /** Thời gian giữ hàng chờ chuyển khoản (phút) — mặc định theo TTL VietQR. */
    holdMinutes: int("SHOP_HOLD_MINUTES", sepayConfig().ttlMinutes, 1, 24 * 60),
    /** Số đơn PENDING_PAYMENT tối đa của một người. */
    maxPendingOrders: int("SHOP_MAX_PENDING_ORDERS", 2, 1, 20),
    /** Số ngày giữ hàng tại quầy sau khi báo "sẵn sàng nhận". */
    pickupDays: int("SHOP_PICKUP_DAYS", 3, 1, 60),
    shippingFee: int("SHOP_SHIPPING_FEE", 30_000, 0, 10_000_000),
    /** Tạm tính ≥ ngưỡng ⇒ miễn phí giao hàng (0 = tắt). */
    freeShippingThreshold: int("SHOP_FREE_SHIPPING_THRESHOLD", 500_000, 0, 1_000_000_000),
    /** Khu vực giao hàng (tên tỉnh/thành, so khớp không dấu). */
    deliveryProvinces: (process.env.SHOP_DELIVERY_PROVINCES ?? "Hồ Chí Minh")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    /** Để hết hạn ≥ N đơn trong 24h ⇒ khóa đặt hàng. */
    expireLockThreshold: int("SHOP_EXPIRE_LOCK_THRESHOLD", 3, 1, 100),
    expireLockHours: int("SHOP_EXPIRE_LOCK_HOURS", 24, 1, 24 * 30),
    /** % tiền hoàn khi khách không đến lấy hàng đúng hạn. */
    notPickedUpRefundPercent: int("SHOP_NOT_PICKED_UP_REFUND_PERCENT", 100, 0, 100),
    /** DELIVERED quá N ngày mà khách chưa xác nhận ⇒ tự COMPLETED. */
    autoCompleteDays: int("SHOP_AUTO_COMPLETE_DAYS", 3, 1, 60),
    /** Sai mã nhận hàng N lần ⇒ khóa xác nhận đơn đó trong `pickupLockMinutes`. */
    pickupMaxAttempts: int("SHOP_PICKUP_MAX_ATTEMPTS", 5, 1, 50),
    pickupLockMinutes: int("SHOP_PICKUP_LOCK_MINUTES", 15, 1, 24 * 60),
    /** Số địa chỉ tối đa trong sổ địa chỉ. */
    maxAddresses: 10,
    /** Số dòng tối đa trong giỏ. */
    maxCartLines: 30,
  };
}

export type ShopConfig = ReturnType<typeof shopConfig>;

function int(key: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[key] ?? "").trim();
  if (!raw) return fallback;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Chuẩn hoá tên tỉnh để so khớp: bỏ dấu, chữ thường, bỏ tiền tố "TP./Tỉnh/Thành phố". */
export function normalizeProvince(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/^(thanh pho|tp\.?|tinh)\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

export function isDeliverableProvince(province: string, cfg: ShopConfig = shopConfig()): boolean {
  const target = normalizeProvince(province);
  return cfg.deliveryProvinces.some((p) => normalizeProvince(p) === target);
}

/** Phí ship theo tạm tính (PICKUP luôn 0). */
export function shippingFeeFor(
  fulfillmentType: "PICKUP" | "DELIVERY",
  subtotal: number,
  cfg: ShopConfig = shopConfig()
): number {
  if (fulfillmentType === "PICKUP") return 0;
  if (cfg.freeShippingThreshold > 0 && subtotal >= cfg.freeShippingThreshold) return 0;
  return cfg.shippingFee;
}

/** Cấu hình công khai cho app (`GET /shop/config`). */
export function publicShopConfig() {
  const cfg = shopConfig();
  return {
    holdMinutes: cfg.holdMinutes,
    maxPendingOrders: cfg.maxPendingOrders,
    pickupDays: cfg.pickupDays,
    shippingFee: cfg.shippingFee,
    freeShippingThreshold: cfg.freeShippingThreshold,
    deliveryProvinces: cfg.deliveryProvinces,
    expireLockThreshold: cfg.expireLockThreshold,
    expireLockHours: cfg.expireLockHours,
    notPickedUpRefundPercent: cfg.notPickedUpRefundPercent,
    autoCompleteDays: cfg.autoCompleteDays,
    paymentMethods: ["SEPAY"],
    fulfillmentTypes: ["PICKUP", "DELIVERY"],
  };
}
