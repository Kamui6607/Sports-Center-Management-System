import { z } from "zod";

export const MakeupListQuerySchema = z.object({
  status: z.enum(["PENDING", "SCHEDULED", "REJECTED", "EXPIRED", "CANCELLED"]).optional(),
  classId: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const AssignMakeupSchema = z.object({ scheduleId: z.string().uuid() }).strict();

export const RejectMakeupSchema = z
  .object({ reason: z.string().trim().min(5, "Lý do từ chối tối thiểu 5 ký tự").max(300) })
  .strict();

export const OpenMakeupSlotSchema = z
  .object({
    classId: z.string().uuid(),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
    roomId: z.string().uuid().optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    assignRequestIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();
