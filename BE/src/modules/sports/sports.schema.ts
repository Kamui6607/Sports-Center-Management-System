import { z } from "zod";

export const CreateSportSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

export const UpdateSportSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const SportQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  isActive: z.string().optional(),
});
