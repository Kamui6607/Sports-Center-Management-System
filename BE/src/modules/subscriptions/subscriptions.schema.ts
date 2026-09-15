import { z } from "zod";

export const CreateSubscriptionSchema = z.object({
  memberId: z.string().min(1),
  planId: z.string().min(1),
  startDate: z.string().optional(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
  note: z.string().optional(),
});

export const RenewSubscriptionSchema = z.object({
  planId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
  note: z.string().optional(),
});

export const UpdateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED", "SUSPENDED"]),
});

export const SubscriptionQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED", "SUSPENDED"]).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;
export type RenewSubscriptionInput = z.infer<typeof RenewSubscriptionSchema>;
