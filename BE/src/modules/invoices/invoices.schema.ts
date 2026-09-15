import { z } from "zod";

export const InvoiceQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  memberId: z.string().optional(),
  status: z.enum(["ISSUED", "CANCELLED"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
