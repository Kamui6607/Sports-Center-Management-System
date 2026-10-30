import { z } from "zod";
import { COACH_TERM } from "../../config/coach-term.js";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");

export const TermIdParamSchema = z.object({ id: z.string().min(1) });
export const TermCoachParamSchema = z.object({ id: z.string().min(1), coachId: z.string().min(1) });
export const LeaveIdParamSchema = z.object({ id: z.string().min(1) });

/** MANAGER: `PATCH /terms/:id`. */
export const UpdateTermSchema = z.object({
  graceDays: z.number().int().min(0).max(COACH_TERM.MAX_GRACE_DAYS),
});

/** MANAGER: `GET /terms/:id/coaches`. */
export const TermRosterQuerySchema = z.object({
  state: z.enum(["PENDING", "COMPLIANT", "NON_COMPLIANT", "EXEMPT"]).optional(),
  search: z.string().trim().max(100).optional(),
});

/** MANAGER: `PUT /terms/:id/coaches/:coachId/exempt`. */
export const ExemptSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

/** COACH: `POST /terms/me/leaves`. */
export const CreateLeaveSchema = z.object({
  startDate: dateKey,
  endDate: dateKey,
  kind: z.enum(["SICK", "PERSONAL", "OTHER"]).default("PERSONAL"),
  reason: z.string().trim().min(3).max(500),
});

/** MANAGER: `GET /terms/leaves`. */
export const LeaveListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

/** MANAGER: `PATCH /terms/leaves/:id/review`. */
export const ReviewLeaveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).optional(),
});

/** MANAGER: `POST /terms/pass/verify`. */
export const VerifyPassSchema = z.object({
  token: z.string().trim().min(10).max(2000),
});

/** MANAGER: `GET /terms/pass/scans`. */
export const PassScanQuerySchema = z.object({
  valid: z.enum(["true", "false"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type TermRosterQuery = z.infer<typeof TermRosterQuerySchema>;
export type LeaveListQuery = z.infer<typeof LeaveListQuerySchema>;
export type PassScanQuery = z.infer<typeof PassScanQuerySchema>;

/** COACH: `POST /terms/check-in` — token đọc từ QR do Manager tạo. */
export const ScanCheckInSchema = z.object({
  token: z.string().trim().min(10).max(2000),
});

/** MANAGER: `GET /terms/check-ins`. */
export const CheckInListQuerySchema = z.object({
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD").optional(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Tháng phải có dạng YYYY-MM").optional(),
  coachId: z.string().min(1).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CheckInListQuery = z.infer<typeof CheckInListQuerySchema>;
