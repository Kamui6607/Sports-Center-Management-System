import { z } from "zod";

export const CreateTrainingPlanSchema = z.object({
  memberId: z.string().uuid(),
  coachId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

/**
 * Một chỉ số tập luyện của mốc tiến độ — đo theo bài tập/thành tích thực tế ở phòng gym,
 * KHÔNG phải chỉ số y tế. Ví dụ: Squat 80 kg, Plank 90 giây, Chạy 2km 11 phút (lowerIsBetter).
 * `name` giống nhau (không phân biệt hoa/thường) giữa các mốc ⇒ được so sánh thành một đường tiến bộ.
 */
export const ProgressMetricSchema = z.object({
  name: z.string().trim().min(1).max(60),
  value: z.number().finite(),
  unit: z.string().trim().max(20).optional(),
  /** true ⇒ số càng nhỏ càng tốt (thời gian chạy...). Mặc định số càng lớn càng tốt. */
  lowerIsBetter: z.boolean().optional(),
});

export const CreateTrainingResultSchema = z.object({
  planId: z.string().uuid(),
  date: z.string().datetime(),
  metrics: z.array(ProgressMetricSchema).max(30).optional(),
  coachNote: z.string().trim().max(1000).optional()
});

export const UpdateTrainingResultSchema = z
  .object({
    date: z.string().datetime().optional(),
    metrics: z.array(ProgressMetricSchema).max(30).optional(),
    coachNote: z.string().trim().max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Cần ít nhất một trường để cập nhật");

// Đổi HLV của kế hoạch tập luyện (chỉ đụng TrainingPlan.coachId, không cần migration).
export type ProgressMetric = z.infer<typeof ProgressMetricSchema>;

export const UpdateTrainingPlanSchema = z.object({
  coachId: z.string().uuid(),
});