import { z } from "zod";

export const CreateScheduleSchema = z.object({
  classId: z.string().min(1),
  roomId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
}).refine((d) => new Date(d.endTime) > new Date(d.startTime), {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

export const UpdateScheduleSchema = z.object({
  roomId: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(["SCHEDULED", "CANCELLED", "COMPLETED"]).optional(),
});

export const ScheduleQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  classId: z.string().optional(),
  roomId: z.string().optional(),
  status: z.enum(["SCHEDULED", "CANCELLED", "COMPLETED"]).optional(),
  date: z.string().optional(),
  startAfter: z.string().optional(),
  startBefore: z.string().optional(),
});
