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
    /** Số ngày giữ hàng tại quầy tính từ ngày dự định lấy (hoặc ngày sẵn sàng nếu muộn hơn). */
    pickupDays: int("SHOP_PICKUP_DAYS", 3, 1, 60),
    /** Ngày dự định lấy được chọn trong [hôm nay, hôm nay + N ngày]. */
    pickupMaxDaysAhead: int("SHOP_PICKUP_MAX_DAYS_AHEAD", 7, 0, 60),
    /** Số lần khách được đổi ngày / gia hạn lấy hàng, mỗi lần dời tối đa `pickupRescheduleMaxDays` ngày. */
    pickupMaxReschedules: int("SHOP_PICKUP_MAX_RESCHEDULES", 1, 0, 10),
    pickupRescheduleMaxDays: int("SHOP_PICKUP_RESCHEDULE_MAX_DAYS", 3, 1, 30),
    /** Nhắc khách trước hạn nhận hàng N giờ. */
    pickupReminderHours: int("SHOP_PICKUP_REMINDER_HOURS", 24, 1, 24 * 7),
    shippingFee: int("SHOP_SHIPPING_FEE", 15_000, 0, 10_000_000),
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
    /** % tiền hoàn khi khách không đến lấy hàng đúng hạn (trước khi trừ phí giữ hàng). */
    notPickedUpRefundPercent: int("SHOP_NOT_PICKED_UP_REFUND_PERCENT", 100, 0, 100),
    /** Thanh toán tại quầy: giá trị đơn tối đa + số đơn trả tại quầy đang mở tối đa / người. */
    cashMaxOrderValue: int("SHOP_CASH_MAX_ORDER_VALUE", 2_000_000, 0, 1_000_000_000),
    cashMaxOpenOrders: int("SHOP_CASH_MAX_OPEN_ORDERS", 1, 1, 20),
    /** Bùng hàng (NOT_PICKED_UP) đếm trong cửa sổ N ngày gần nhất. */
    noShowWindowDays: int("SHOP_NO_SHOW_WINDOW_DAYS", 90, 1, 365),
    /** Từ lần bùng thứ N (trong cửa sổ) ⇒ khóa "trả tại quầy" `cashLockDays` ngày. */
    noShowCashLockThreshold: int("SHOP_NO_SHOW_CASH_LOCK_THRESHOLD", 2, 1, 50),
    cashLockDays: int("SHOP_CASH_LOCK_DAYS", 30, 1, 365),
    /** Từ lần bùng thứ N ⇒ đơn đã thanh toán bị trừ `noShowFeePercent`% phí giữ hàng khi hoàn. */
    noShowFeeThreshold: int("SHOP_NO_SHOW_FEE_THRESHOLD", 3, 1, 50),
    noShowFeePercent: int("SHOP_NO_SHOW_FEE_PERCENT", 10, 0, 100),
    /** Yêu cầu hoàn tiền đơn hàng chờ quá N ngày ⇒ gắn cờ "tồn đọng". */
    staleRefundDays: int("SHOP_STALE_REFUND_DAYS", 30, 1, 365),
    /** DELIVERED quá N ngày mà khách chưa xác nhận ⇒ tự COMPLETED. */
    autoCompleteDays: int("SHOP_AUTO_COMPLETE_DAYS", 3, 1, 60),
    /** Sai mã nhận hàng N lần ⇒ khóa xác nhận đơn đó trong `pickupLockMinutes`. */
    pickupMaxAttempts: int("SHOP_PICKUP_MAX_ATTEMPTS", 5, 1, 50),
    pickupLockMinutes: int("SHOP_PICKUP_LOCK_MINUTES", 15, 1, 24 * 60),
    /** Đơn đã NOT_PICKED_UP vẫn nhận trễ được trong N ngày (khi tiền chưa hoàn & còn hàng); 0 = tắt. */
    latePickupDays: int("SHOP_LATE_PICKUP_DAYS", 7, 0, 60),
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
    pickupMaxDaysAhead: cfg.pickupMaxDaysAhead,
    pickupMaxReschedules: cfg.pickupMaxReschedules,
    pickupRescheduleMaxDays: cfg.pickupRescheduleMaxDays,
    cashMaxOrderValue: cfg.cashMaxOrderValue,
    cashMaxOpenOrders: cfg.cashMaxOpenOrders,
    noShowWindowDays: cfg.noShowWindowDays,
    noShowCashLockThreshold: cfg.noShowCashLockThreshold,
    cashLockDays: cfg.cashLockDays,
    noShowFeeThreshold: cfg.noShowFeeThreshold,
    noShowFeePercent: cfg.noShowFeePercent,
    staleRefundDays: cfg.staleRefundDays,
    latePickupDays: cfg.latePickupDays,
    /** SEPAY: chuyển khoản trước (mọi hình thức). CASH: trả tại quầy (chỉ PICKUP). */
    paymentMethods: ["SEPAY", "CASH"],
    fulfillmentTypes: ["PICKUP", "DELIVERY"],
  };
}
