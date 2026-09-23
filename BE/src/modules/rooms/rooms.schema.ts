import { z } from "zod";

export const AreaTypeEnum = z.enum(["POOL", "INDOOR", "OUTDOOR"]);

export const CreateRoomSchema = z.object({
  name: z.string().min(2),
  capacity: z.number().int().positive(),
  location: z.string().optional(),
  areaType: AreaTypeEnum,
});

export const UpdateRoomSchema = z.object({
  name: z.string().min(2).optional(),
  capacity: z.number().int().positive().optional(),
  location: z.string().optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.boolean().optional(),
});

export const RoomQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.string().optional(),
});

export const RoomIdSchema = z.object({
  roomId: z.string().min(1),
});

export const TransferSchedulesSchema = z.object({
  targetRoomId: z.string().min(1, "targetRoomId is required"),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (d) => {
    if (d.from && d.to) return new Date(d.to) > new Date(d.from);
    return true;
  },
  { message: "to must be after from", path: ["to"] }
);

export type TransferSchedulesInput = z.infer<typeof TransferSchedulesSchema>;
