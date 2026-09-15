import { z } from "zod";

export const DateRangeSchema = z.object({
  startDate: z.string().min(1, "startDate is required"),
  endDate: z.string().min(1, "endDate is required"),
}).refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
  message: "endDate must be after or equal to startDate",
  path: ["endDate"],
});
