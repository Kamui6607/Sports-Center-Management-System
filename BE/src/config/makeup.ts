/**
 * Học bù & buổi bù mở (Doc/MAKEUP_ABSENCE_PLAN.md §3.3–3.5).
 */
export const MAKEUP = {
  /** Yêu cầu PENDING hết hạn sau ngày kết thúc khóa đã mua thêm ngần này ngày. */
  REQUEST_EXPIRE_DAYS_AFTER_COURSE: 14,
  /** Buổi bù mở chỉ được đặt tới ngày kết thúc khóa + ngần này ngày. */
  SLOT_MAX_DAYS_AFTER_COURSE: 14,
  /** Buổi bù mở phải cách hiện tại ít nhất ngần này phút. */
  SLOT_MIN_LEAD_MINUTES: 120,
  /** Buổi bù mở dài tối đa ngần này phút. */
  SLOT_MAX_DURATION_MINUTES: 240,
  /** Buổi đích khi xếp học bù phải bắt đầu sau hiện tại ít nhất ngần này phút. */
  ASSIGN_MIN_LEAD_MINUTES: 30,
  /** Chỗ khách (người vào từ khóa khác) tối đa trên một buổi CHÍNH: max(1, % sức chứa). */
  GUEST_SEATS_PERCENT: 10,
} as const;

/** Số chỗ khách tối đa của một buổi chính có sức chứa [capacity]. */
export function guestSeatCap(capacity: number): number {
  return Math.max(1, Math.floor((capacity * MAKEUP.GUEST_SEATS_PERCENT) / 100));
}
