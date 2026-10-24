import { z } from "zod";

export const UpdateCoachSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().regex(/^[0-9+\-() ]*$/, "Phone must not contain special characters").optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string().optional(),
  specialization: z.string().min(1).optional(),
  experienceYears: z.number().int().nonnegative().optional(),
  bio: z.string().optional(),
});

export const CoachQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  specialization: z.string().optional(),
});

/** `GET /coaches/cv/pending` — trạng thái lạ trước đây lọt xuống Prisma ⇒ 500. */
export const CvQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type UpdateCoachInput = z.infer<typeof UpdateCoachSchema>;
export type CoachQueryInput = z.infer<typeof CoachQuerySchema>;
