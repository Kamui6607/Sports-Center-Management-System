import { z } from "zod";

export const CreateTrainingPlanSchema = z.object({
  memberId: z.string().uuid(),
  coachId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

export const CreateTrainingResultSchema = z.object({
  planId: z.string().uuid(),
  date: z.string().datetime(),
  metrics: z.record(z.any()).optional(),
  coachNote: z.string().optional()
});

// Đổi HLV của kế hoạch tập luyện (chỉ đụng TrainingPlan.coachId, không cần migration).
export const UpdateTrainingPlanSchema = z.object({
  coachId: z.string().uuid(),
});