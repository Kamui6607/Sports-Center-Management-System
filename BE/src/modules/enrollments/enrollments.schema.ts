import { z } from "zod";

export const CreateEnrollmentSchema = z.object({
  scheduleId: z.string().min(1),
  memberId: z.string().optional(), // Bắt buộc khi MANAGER đặt hộ member (userId hoặc MemberProfile.id)
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
