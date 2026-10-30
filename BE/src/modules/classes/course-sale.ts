import { COURSE_SALE } from "../../config/course-sale.js";

/**
 * Trạng thái mở bán của khóa (tính từ dữ liệu, không lưu) — Doc/BUSINESS_HARDENING_PLAN.md §1.1.
 * - ON_SALE: đang nhận học viên · FULL: còn trong hạn bán nhưng các buổi còn lại đã kín chỗ
 * - SALE_CLOSED: còn buổi nhưng đã qua hạn mở bán · ENDED: không còn buổi nào sắp diễn ra / khóa đã đóng
 * - NOT_OPEN: khóa chưa được duyệt (nháp / chờ duyệt / bị từ chối)
 */
export type SaleState = "ON_SALE" | "FULL" | "SALE_CLOSED" | "ENDED" | "NOT_OPEN";

export const SALE_STATE_LABEL: Record<SaleState, string> = {
  ON_SALE: "Đang mở bán",
  FULL: "Hết chỗ",
  SALE_CLOSED: "Ngừng nhận học viên mới",
  ENDED: "Đã kết thúc",
  NOT_OPEN: "Chưa mở bán",
};

/** Buổi học tối thiểu để tính trạng thái bán / báo giá. */
export interface SaleSession {
  id: string;
  startTime: Date;
  status: string;
  makeupForId: string | null;
}

export interface SaleProgress {
  /** Số buổi chưa hủy (buổi chính + dạy bù). */
  liveSessions: number;
  /** Số buổi chưa hủy đã bắt đầu. */
  passedSessions: number;
  /** Số buổi SCHEDULED chưa bắt đầu. */
  remainingSessions: number;
}

export function saleProgressOf(sessions: SaleSession[], now: Date): SaleProgress {
  const live = sessions.filter((s) => s.status !== "CANCELLED");
  return {
    liveSessions: live.length,
    passedSessions: live.filter((s) => s.startTime <= now).length,
    remainingSessions: live.filter((s) => s.status === "SCHEDULED" && s.startTime > now).length,
  };
}

/** Đã qua hạn mở bán: đã diễn ra ≥ MAX_PROGRESS_PERCENT % hoặc còn ít hơn MIN_REMAINING_SESSIONS buổi. */
export function isPastSaleWindow(p: SaleProgress): boolean {
  if (p.passedSessions === 0) return false;
  const progress = p.liveSessions > 0 ? (p.passedSessions * 100) / p.liveSessions : 100;
  const minRemaining = Math.min(COURSE_SALE.MIN_REMAINING_SESSIONS, p.liveSessions);
  return progress >= COURSE_SALE.MAX_PROGRESS_PERCENT || p.remainingSessions < minRemaining;
}

export function saleStateOf(params: {
  status: string;
  isActive: boolean;
  sessions: SaleSession[];
  /** Chỗ trống ít nhất trong các buổi sắp tới (đã trừ chỗ đang giữ chờ chuyển khoản); null = không còn buổi. */
  minRemainingSlots: number | null;
  now: Date;
}): SaleState {
  const { status, isActive, sessions, now } = params;
  if (status === "COMPLETED" || (!isActive && status === "APPROVED")) return "ENDED";
  if (status !== "APPROVED") return "NOT_OPEN";
  const progress = saleProgressOf(sessions, now);
  if (progress.remainingSessions === 0) return "ENDED";
  if (isPastSaleWindow(progress)) return "SALE_CLOSED";
  if (params.minRemainingSlots !== null && params.minRemainingSlots <= 0) return "FULL";
  return "ON_SALE";
}

/**
 * Báo giá mua khóa tại thời điểm `at` (= lúc mã QR hết hạn, để buổi được tính tiền chắc chắn còn khi tiền về).
 * - N = số buổi CHÍNH của khóa (không tính dạy bù) — cùng mẫu số với tiền hoàn 1 buổi.
 * - k = số buổi SCHEDULED bắt đầu sau `at` (người mua sẽ được ghi danh).
 * - Thành tiền = giá trọn khóa nếu k ≥ N, ngược lại min(giá trọn khóa, làm tròn lên 1.000đ (giá × k ÷ N)).
 */
export interface CourseQuote {
  listPrice: number;
  totalSessions: number;
  unitPrice: number;
  sessionsPurchased: number;
  /** Số buổi chưa hủy đã/sẽ bắt đầu trước khi được ghi danh (không tính tiền). */
  sessionsMissed: number;
  /** Giảm so với giá trọn khóa (đăng ký muộn / khóa còn ít buổi hơn kế hoạch). */
  discount: number;
  amount: number;
  isLate: boolean;
  scheduleIds: string[];
}

export function quoteCourse(listPrice: number, sessions: SaleSession[], at: Date): CourseQuote {
  const price = Math.round(listPrice);
  const totalSessions = Math.max(1, sessions.filter((s) => s.makeupForId === null).length);
  const buy = sessions
    .filter((s) => s.status === "SCHEDULED" && s.startTime > at)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const k = buy.length;
  const sessionsMissed = sessions.filter((s) => s.status !== "CANCELLED" && s.startTime <= at).length;
  const step = COURSE_SALE.ROUND_TO;
  const amount = k === 0 ? 0 : k >= totalSessions ? price : Math.min(price, Math.ceil((price * k) / totalSessions / step) * step);
  return {
    listPrice: price,
    totalSessions,
    unitPrice: Math.round(price / totalSessions),
    sessionsPurchased: k,
    sessionsMissed,
    discount: Math.max(0, price - amount),
    amount,
    isLate: sessionsMissed > 0,
    scheduleIds: buy.map((s) => s.id),
  };
}
