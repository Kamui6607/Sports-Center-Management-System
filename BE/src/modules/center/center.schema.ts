import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const UpdateCenterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  mapUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal("").transform(() => null)),
  hotline: optionalText(30),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal("").transform(() => null)),
  openingHours: optionalText(200),
  parkingNote: optionalText(500),
  description: optionalText(1000),
});

export type UpdateCenterInput = z.infer<typeof UpdateCenterSchema>;
