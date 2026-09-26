/**
 * Hoa hồng nền tảng trên mỗi lượt Member mua khóa học.
 *
 * Mô hình đã chốt — **KHẤU TRỪ (DEDUCT)**:
 * - `Class.price` là giá Coach niêm yết và CŨNG là số tiền Member phải trả (không cộng thêm phụ phí).
 * - Nền tảng giữ `COURSE_COMMISSION_RATE` (15%) trên giá đó.
 * - Coach sở hữu khóa học nhận phần còn lại (85%).
 *
 * Ví dụ: giá 500.000đ → nền tảng 75.000đ, Coach 425.000đ.
 */
export const COURSE_COMMISSION_RATE = 0.15;

export interface CoursePriceSplit {
  /** Số tiền Member trả (= giá niêm yết của khóa học). */
  price: number;
  /** Hoa hồng nền tảng giữ lại. */
  commissionAmount: number;
  /** Phần Coach sở hữu khóa học nhận được. */
  coachEarning: number;
}

/**
 * Tách giá khóa học thành hoa hồng nền tảng + thu nhập Coach.
 *
 * Quy ước tiền tệ: VND làm tròn tới 1 đồng; `coachEarning = price - commissionAmount`
 * (không làm tròn độc lập) để luôn bảo toàn tổng tiền — hoá đơn/đối soát không bị lệch.
 */
export function splitCoursePrice(
  price: number,
  rate: number = COURSE_COMMISSION_RATE
): CoursePriceSplit {
  const safePrice = Math.max(0, Math.round(price));
  const commissionAmount = Math.round(safePrice * rate);
  return {
    price: safePrice,
    commissionAmount,
    coachEarning: safePrice - commissionAmount,
  };
}
