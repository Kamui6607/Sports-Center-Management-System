import { z } from "zod";

export const CreatePlanSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  durationDays: z.number().int().positive(),
  tier: z.enum(["MEMBERSHIP", "PREMIUM"]),
});

export const UpdatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  tier: z.enum(["MEMBERSHIP", "PREMIUM"]).optional(),
  isActive: z.boolean().optional(),
});

export const PlanQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  tier: z.enum(["MEMBERSHIP", "PREMIUM"]).optional(),
  isActive: z.string().optional(),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
