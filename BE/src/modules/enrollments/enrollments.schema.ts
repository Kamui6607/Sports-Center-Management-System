import { z } from "zod";

export const CreateEnrollmentSchema = z.object({
  scheduleId: z.string().min(1),
  memberId: z.string().optional(), // required when staff/manager books for a member
});

export const EnrollmentQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["BOOKED", "CANCELLED", "COMPLETED"]).optional(),
  scheduleId: z.string().optional(),
  memberId: z.string().optional(),
});
