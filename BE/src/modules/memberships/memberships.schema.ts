import { z } from "zod";

/** `POST /memberships/purchase`. */
export const PurchaseMembershipSchema = z.object({
  planId: z.string().min(1),
});

/** MANAGER: `GET /memberships`. */
export const MembershipQuerySchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const UserIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const PlanIdParamSchema = z.object({
  id: z.string().min(1),
});

/** MANAGER: `POST /membership-plans`. */
export const CreatePlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  durationDays: z.number().int().min(1).max(3650),
  price: z.number().int().min(1000),
  description: z.string().trim().max(500).optional(),
});

/** MANAGER: `PATCH /membership-plans/:id/toggle` — bỏ trống `isActive` ⇒ đảo trạng thái hiện tại. */
export const TogglePlanSchema = z.object({
  isActive: z.boolean().optional(),
});

export type MembershipQueryInput = z.infer<typeof MembershipQuerySchema>;
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
