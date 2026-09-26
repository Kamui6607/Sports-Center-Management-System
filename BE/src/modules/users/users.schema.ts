import { z } from "zod";

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phone: z.string().regex(/^[0-9+\-() ]*$/, "Phone must not contain special characters").optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string().optional(),
  role: z.enum(["MEMBER", "COACH", "STAFF", "MANAGER"]),
  fitnessGoal: z.string().optional(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  trainingPreference: z.string().optional(),
});

export const UpdateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().regex(/^[0-9+\-() ]*$/, "Phone must not contain special characters").optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string().optional(),
  isActive: z.boolean().optional(),
  role: z.enum(["MEMBER", "COACH", "STAFF", "MANAGER"]).optional(),
});

export const UserQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  role: z.enum(["MEMBER", "COACH", "STAFF", "MANAGER"]).optional(),
  isActive: z.string().optional(),
  search: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserQueryInput = z.infer<typeof UserQuerySchema>;
