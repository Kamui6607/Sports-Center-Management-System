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

export const ScanQrSchema = z.object({
  qrToken: z.string().min(1, "QR token is required")
});