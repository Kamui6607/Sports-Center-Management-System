import { z } from "zod";

export const AreaTypeEnum = z.enum(["POOL", "INDOOR", "OUTDOOR"]);

export const CreateSportSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  areaTypes: z.array(AreaTypeEnum).min(1, "Sport must support at least one area type"),
});

export const UpdateSportSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  areaTypes: z.array(AreaTypeEnum).min(1, "Sport must support at least one area type").optional(),
  isActive: z.boolean().optional(),
});

export const SportQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.string().optional(),
});
