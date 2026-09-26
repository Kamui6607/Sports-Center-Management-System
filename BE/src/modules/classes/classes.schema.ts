import { z } from "zod";

export const AreaTypeEnum = z.enum(["POOL", "INDOOR", "OUTDOOR"]);

export const CreateClassSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  sportIds: z.array(z.string().min(1)).min(1, "Must assign at least one sport"),
  capacity: z.number().int().positive().max(200),
  classType: z.enum(["REGULAR", "PREMIUM"]).default("REGULAR"),
  areaType: AreaTypeEnum,
});

export const UpdateClassSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  sportIds: z.array(z.string().min(1)).min(1, "Must assign at least one sport").optional(),
  capacity: z.number().int().positive().max(200).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.boolean().optional(),
});

export const AssignCoachSchema = z.object({
  coachId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

// Phân công HLV hỗ trợ (support coach): luôn lưu với isPrimary = false.
// Mỗi Class chỉ có duy nhất 1 HLV chính nên endpoint này không nhận isPrimary.
export const AssignSupportCoachSchema = z.object({
  coachId: z.string().min(1),
});

export const ClassQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sportId: z.string().optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.string().optional(),
  coachId: z.string().optional(),
});
