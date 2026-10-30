import { AppError } from "../../middlewares/errorHandler.js";

/**
 * Lịch nhận hàng tại quầy theo NGÀY giờ Việt Nam (UTC+7):
 * - Khách chọn ngày dự định trong [hôm nay, hôm nay + SHOP_PICKUP_MAX_DAYS_AHEAD]; lấy SỚM được ngay khi đơn "Sẵn sàng".
 * - Hạn nhận = 23:59:59 của (max(ngày dự định, ngày báo sẵn sàng) + SHOP_PICKUP_DAYS).
 */
const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;

/** 00:00 (giờ VN) của ngày chứa `at`. */
export function vnDayStart(at: Date): Date {
  const vn = new Date(at.getTime() + VN_OFFSET);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET);
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY);
}

/** "YYYY-MM-DD" (giờ VN) của một thời điểm. */
export function vnDateString(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" ⇒ 00:00 giờ VN của ngày đó. */
export function parseVnDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const at = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - VN_OFFSET) : null;
  if (!at || Number.isNaN(at.getTime()) || vnDateString(at) !== value.trim()) {
    throw new AppError("Ngày nhận hàng không hợp lệ (định dạng YYYY-MM-DD).", 400, { code: "PICKUP_DATE_INVALID" });
  }
  return at;
}

/** Khoảng ngày được chọn khi đặt: [hôm nay, hôm nay + maxDaysAhead]. */
export function pickupDateRange(maxDaysAhead: number, now = new Date()) {
  const min = vnDayStart(now);
  return { min, max: addDays(min, maxDaysAhead) };
}

/** Hạn nhận hàng: cuối ngày (max(ngày dự định, lúc sẵn sàng) + pickupDays). */
export function pickupDeadlineFor(preferred: Date | null, readyAt: Date, pickupDays: number): Date {
  const base = vnDayStart(preferred && preferred > readyAt ? preferred : readyAt);
  return new Date(addDays(base, pickupDays + 1).getTime() - 1000);
}

export function formatVnDate(at: Date): string {
  return at.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
