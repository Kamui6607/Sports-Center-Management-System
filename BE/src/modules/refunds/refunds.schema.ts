import { z } from "zod";

export const RefundIdSchema = z.object({
  id: z.string().min(1),
});

/** MEMBER hủy khóa học: ≥ 3 ngày trước khai giảng ⇒ yêu cầu hoàn 100% chờ Manager duyệt; muộn hơn ⇒ hủy ngay, không hoàn. */
export const RequestCourseRefundSchema = z.object({
  classId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
  /** Tên hoặc mã ngân hàng nhận tiền hoàn (VD: MBBank, VCB, Techcombank...). */
  bankName: z.string().trim().max(100).optional(),
  /** Số tài khoản ngân hàng nhận tiền hoàn. */
  bankAccountNumber: z.string().trim().max(50).optional(),
  /** Tên chủ tài khoản ngân hàng (không dấu hoặc có dấu). */
  bankAccountName: z.string().trim().max(100).optional(),
  /**
   * Hủy < 3 ngày trước khai giảng: `true` ⇒ gửi YÊU CẦU HOÀN NGOẠI LỆ (Manager duyệt, trừ phí chiết khấu);
   * `false`/bỏ trống ⇒ hủy không hoàn. Bỏ qua khi còn ≥ 3 ngày (luôn hoàn 100%).
   */
  lateRefund: z.boolean().optional(),
});

/** BE-16: `GET /refunds/course-cancellation/preview?classId=`. */
export const CourseRefundPreviewSchema = z.object({
  classId: z.string().min(1),
});

export const ApproveRefundSchema = z.object({
  /** Ghi chú của Manager (VD ghi chú nội bộ). */
  note: z.string().trim().max(500).optional(),
  /** Mã giao dịch chuyển khoản ngân hàng thực tế (FT code / Ref code) để đối soát. */
  transactionRef: z.string().trim().max(100).optional(),
  /** Hoàn ngoại lệ (MEMBER_CANCEL_COURSE_LATE): % phí chiết khấu Manager chốt (0–99, mặc định theo yêu cầu). */
  feePercent: z.number().int().min(0).max(99).optional(),
});

export const RejectRefundSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const RefundQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["PENDING", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
  reason: z
    .enum(["MEMBER_CANCEL_COURSE", "MEMBER_CANCEL_COURSE_LATE", "MEMBER_CANCEL_SESSION", "SESSION_RESCHEDULED", "SESSION_CANCELLED", "ORDER_CANCELLED", "ORDER_NOT_PICKED_UP", "ORDER_LATE_PAYMENT"])
    .optional(),
  memberId: z.string().min(1).optional(),
  /** Lọc hoàn tiền của một đơn hàng. */
  orderId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
});

export type RequestCourseRefundInput = z.infer<typeof RequestCourseRefundSchema>;
export type RefundQueryInput = z.infer<typeof RefundQuerySchema>;
