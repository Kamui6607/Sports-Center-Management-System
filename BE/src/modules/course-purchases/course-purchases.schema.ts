import { z } from "zod";

/**
 * Mua khóa học.
 * - MEMBER: tự mua, không cần `memberId`.
 * - MANAGER: mua hộ member → bắt buộc `memberId` (nhận MemberProfile.id hoặc User.id).
 */
export const PurchaseCourseSchema = z.object({
  classId: z.string().min(1),
  memberId: z.string().min(1).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER"]).default("BANK_TRANSFER"),
  note: z.string().max(500).optional(),
  transactionCode: z.string().max(100).optional(),
});

export const CoursePurchaseQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
  classId: z.string().optional(),
  memberId: z.string().optional(),
  coachId: z.string().optional(),
});

export const CancelCoursePurchaseSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const UpdateCoursePurchaseStatusSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]),
  reason: z.string().max(500).optional(),
});

export type PurchaseCourseInput = z.infer<typeof PurchaseCourseSchema>;
export type CoursePurchaseQueryInput = z.infer<typeof CoursePurchaseQuerySchema>;
export type CancelCoursePurchaseInput = z.infer<typeof CancelCoursePurchaseSchema>;
export type UpdateCoursePurchaseStatusInput = z.infer<typeof UpdateCoursePurchaseStatusSchema>;
