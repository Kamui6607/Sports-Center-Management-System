import { z } from "zod";

export const CreateEnrollmentSchema = z.object({
  scheduleId: z.string().min(1),
  memberId: z.string().optional(), // required when staff/manager books for a member
});

// Chuyển chỗ đặt sang buổi khác (không sửa lịch — chỉ đổi Enrollment).
export const TransferEnrollmentSchema = z.object({
  targetScheduleId: z.string().min(1),
});

export const EnrollmentQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["BOOKED", "CANCELLED", "COMPLETED"]).optional(),
  scheduleId: z.string().optional(),
  memberId: z.string().optional(),
});

// Đăng ký TRỌN KHÓA: tạo Enrollment cho TẤT CẢ buổi sắp diễn ra của Class (all-or-nothing).
export const EnrollWholeCourseSchema = z.object({
  classId: z.string().min(1),
  memberId: z.string().optional(), // required when staff/manager enrolls for a member
});


// GET /enrollments/my/courses — "Khóa học của tôi": đang thanh toán / đang học (group=active) và lịch sử (group=history).
export const MyCoursesQuerySchema = z.object({
  group: z.enum(["active", "history"]).optional(),
  status: z.string().optional(), // CSV: PENDING_PAYMENT,UPCOMING,ONGOING,COMPLETED,CANCELLED,PAID_NOT_ENROLLED
  page: z.string().optional(),
  limit: z.string().optional(),
});

// GET /enrollments/:id/transfer-options
export const TransferOptionsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekday: z.string().regex(/^[1-7]$/).optional(),
});
