import { z } from "zod";

export const CreateClassSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  sportId: z.string().min(1),
  capacity: z.number().int().positive().max(200),
  classType: z.enum(["REGULAR", "PREMIUM"]).default("REGULAR"),
});

export const UpdateClassSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  sportId: z.string().optional(),
  capacity: z.number().int().positive().max(200).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  isActive: z.boolean().optional(),
});

export const AssignCoachSchema = z.object({
  coachId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

export const ClassQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sportId: z.string().optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  isActive: z.string().optional(),
  coachId: z.string().optional(),
});
