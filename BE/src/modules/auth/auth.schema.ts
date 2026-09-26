import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address").transform(v => v.toLowerCase().trim()),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(100).transform(v => v.trim()),
  phone: z.string()
    .regex(/^[0-9+]{9,15}$/, "Phone must be 9-15 digits (optionally starting with +)")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string()
    .refine(v => !v || !isNaN(Date.parse(v)), "Invalid date of birth")
    .refine(v => !v || new Date(v) <= new Date(), "Date of birth cannot be in the future")
    .optional(),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).transform(v => v.trim()).optional(),
  phone: z.string()
    .regex(/^[0-9+]{9,15}$/, "Phone must be 9-15 digits (optionally starting with +)")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string()
    .refine(v => !v || !isNaN(Date.parse(v)), "Invalid date of birth")
    .refine(v => !v || new Date(v) <= new Date(), "Date of birth cannot be in the future")
    .optional(),
  fitnessGoal: z.string().max(500).optional(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  trainingPreference: z.string().max(500).optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
