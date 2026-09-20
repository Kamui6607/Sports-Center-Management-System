import { z } from "zod";

export const CreateFeedbackSchema = z.object({
  coachId: z.string().uuid("coachId phải là UUID hợp lệ"),
  classId: z.string().uuid().optional(),
  rating: z.number().int().min(1, "Đánh giá tối thiểu 1 sao").max(5, "Đánh giá tối đa 5 sao"),
  comment: z.string().max(1000).optional(),
  isAnonymous: z.boolean().optional().default(false),
});

export const UpdateFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
  isAnonymous: z.boolean().optional(),
});

export const FeedbackQuerySchema = z.object({
  coachId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof UpdateFeedbackSchema>;
export type FeedbackQueryInput = z.infer<typeof FeedbackQuerySchema>;
