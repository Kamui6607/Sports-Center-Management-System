import { z } from "zod";

export const CreatePaymentSchema = z.object({
  memberId: z.string().min(1),
  subscriptionId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER"]),
  status: z.enum(["PENDING", "SUCCESS", "FAILED"]).default("SUCCESS"),
  note: z.string().optional(),
  transactionCode: z.string().optional(),
});

export const UpdatePaymentStatusSchema = z.object({
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]),
});

export const PaymentQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  memberId: z.string().optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
