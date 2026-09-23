import { z } from "zod";

export const CreateAttendanceSchema = z.object({
  scheduleId: z.string().uuid(),
  memberId: z.string().uuid(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  note: z.string().optional()
});

export const UpdateAttendanceSchema = z.object({
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).optional(),
  note: z.string().optional()
});

export const GenerateQrSchema = z.object({
  scheduleId: z.string().uuid()
});

/** Mã dự phòng: 6 ký tự alphabet A-HJ-NP-Z2-9 (bỏ 0/O/1/I); nhận cả chữ thường/khoảng trắng thừa. */
export const ManualCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, "Mã điểm danh gồm 6 ký tự (không dùng 0, O, 1, I)");

/**
 * POST /attendance/scan-qr nhận ĐÚNG MỘT trong hai credential:
 * - `qrToken`: JWT trong mã QR do COACH/MANAGER hiển thị.
 * - `code`: mã dự phòng nhập tay cho member không quét được QR (camera hỏng).
 * Member KHÔNG gửi `scheduleId` — buổi học suy ra từ credential; key lạ bị từ chối (.strict()).
 */
export const ScanQrSchema = z
  .object({
    qrToken: z.string().min(1, "QR token is required").optional(),
    code: ManualCodeSchema.optional(),
  })
  .strict()
  .refine((value) => Number(Boolean(value.qrToken)) + Number(Boolean(value.code)) === 1, {
    message: "Chỉ gửi một trong hai: qrToken hoặc code",
  });

export const AttendanceRosterQuerySchema = z.object({
  scheduleId: z.string().min(1, "scheduleId là bắt buộc"),
});

export const MyAttendanceQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).optional(),
  classId: z.string().optional(),
});

export const PenaltyListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPLIED", "REVOKED", "EXPIRED"]).optional(),
  memberId: z.string().optional(),
  classId: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const PenaltyApplySchema = z.object({
  memberId: z.string().min(1),
  classId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const PenaltyAppealSchema = z.object({
  reason: z.string().min(5, "Lý do khiếu nại tối thiểu 5 ký tự").max(1000),
});

export const PenaltyRevokeSchema = z.object({
  reason: z.string().max(500).optional(),
  restoreSlots: z.boolean().optional(),
});