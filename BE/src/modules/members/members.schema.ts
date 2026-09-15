import { z } from "zod";

export const UpdateMemberSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().regex(/^[0-9+\-() ]*$/, "Phone must not contain special characters").optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string().optional(),
  fitnessGoal: z.string().optional(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  trainingPreference: z.string().optional(),
});

export const MemberQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
});

export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type MemberQueryInput = z.infer<typeof MemberQuerySchema>;
