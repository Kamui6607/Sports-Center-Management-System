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

// ── SePay online payment (VietQR + webhook) ──────────────────────────────────
/** MEMBER tự tạo giao dịch mua gói qua chuyển khoản VietQR (chỉ nhận planId, không nhận memberId). */
export const SepayCheckoutSchema = z.object({
  planId: z.string().min(1),
});

/** DEV/DEMO: mô phỏng SePay gửi webhook "đã thu tiền" (chỉ khi SEPAY_MOCK_MODE=true). */
export const SepayMockConfirmSchema = z.object({
  paymentId: z.string().min(1),
});

/**
 * Payload webhook do SePay gửi (xem docs: Tích hợp webhook → Payload).
 * `passthrough()` giữ nguyên các field chưa biết để lưu vết đối soát đầy đủ.
 */
export const SepayWebhookSchema = z
  .object({
    id: z.coerce.number().int().nonnegative(),
    gateway: z.string().optional(),
    transactionDate: z.string().optional(),
    accountNumber: z.string().optional().default(""),
    subAccount: z.string().optional().default(""),
    code: z.string().nullish(),
    content: z.string().optional().default(""),
    transferType: z.string().optional().default("in"),
    description: z.string().optional().default(""),
    transferAmount: z.coerce.number().optional().default(0),
    accumulated: z.coerce.number().optional().default(0),
    referenceCode: z.string().optional().default(""),
  })
  .passthrough();

export type SepayWebhookBody = z.infer<typeof SepayWebhookSchema>;

export const PaymentQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  memberId: z.string().optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "SEPAY"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

