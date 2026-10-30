/**
 * Luật mở bán khóa học & tính tiền đăng ký muộn — Doc/BUSINESS_HARDENING_PLAN.md §2.
 * Cấu hình qua biến môi trường; giá trị mặc định là phương án đã duyệt.
 */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(process.env[name] ?? fallback));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const COURSE_SALE = {
  /** Ngừng nhận học viên mới khi số buổi ĐÃ DIỄN RA đạt ngưỡng này (% số buổi của khóa). */
  get MAX_PROGRESS_PERCENT() {
    return intEnv("COURSE_SALE_MAX_PROGRESS_PERCENT", 50, 1, 100);
  },
  /** …hoặc khi số buổi CÒN LẠI ít hơn ngưỡng này (khóa ngắn hơn ngưỡng: so với tổng số buổi). */
  get MIN_REMAINING_SESSIONS() {
    return intEnv("COURSE_SALE_MIN_REMAINING_SESSIONS", 3, 1, 50);
  },
  /** Thành tiền đăng ký muộn làm tròn LÊN tới bội số này (đồng). */
  ROUND_TO: 1000,
  /** Cảnh báo HLV khi còn ngần này giờ tới buổi khai giảng mà khóa chưa có học viên. */
  NO_STUDENT_ALERT_HOURS: 24,
  /** Nhịp job bảo trì khóa học (ms). */
  MAINTENANCE_INTERVAL_MS: 5 * 60_000,
} as const;
