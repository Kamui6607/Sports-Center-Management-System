import { z } from "zod";

export const CreateRoomSchema = z.object({
  name: z.string().min(2),
  capacity: z.number().int().positive(),
  location: z.string().optional(),
});

export const UpdateRoomSchema = z.object({
  name: z.string().min(2).optional(),
  capacity: z.number().int().positive().optional(),
  location: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const RoomQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  isActive: z.string().optional(),
});
