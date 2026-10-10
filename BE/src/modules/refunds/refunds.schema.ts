import { z } from "zod";

export const RefundIdSchema = z.object({
  id: z.string().min(1),
});

/** MEMBER xin hủy khóa học (trước khai giảng ≥ 24h) ⇒ tạo yêu cầu hoàn tiền chờ Manager duyệt. */
export const RequestCourseRefundSchema = z.object({
  classId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

/** BE-16: `GET /refunds/course-cancellation/preview?classId=`. */
export const CourseRefundPreviewSchema = z.object({
  classId: z.string().min(1),
});

export const ApproveRefundSchema = z.object({
  /** Ghi chú của Manager (VD mã giao dịch chuyển khoản hoàn tiền). */
  note: z.string().trim().max(500).optional(),
});

export const RejectRefundSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const RefundQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["PENDING", "COMPLETED", "REJECTED"]).optional(),
  reason: z
    .enum(["MEMBER_CANCEL_COURSE", "SESSION_CANCELLED", "ORDER_CANCELLED", "ORDER_NOT_PICKED_UP", "ORDER_LATE_PAYMENT"])
    .optional(),
  memberId: z.string().min(1).optional(),
  /** Lọc hoàn tiền của một đơn hàng. */
  orderId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
});

export type RequestCourseRefundInput = z.infer<typeof RequestCourseRefundSchema>;
export type RefundQueryInput = z.infer<typeof RefundQuerySchema>;
