import { z } from "zod";

export const ScheduleIdSchema = z.object({
  id: z.string().min(1),
});

// ── Weekday filter (Thứ 2..Chủ nhật) ──
// Quy ước VN cho query: 2=T2 ... 7=T7, 8=CN.
// Chấp nhận thêm alias chữ: MON/MONDAY/T2, ..., SUN/SUNDAY/CN,
// và "Thứ 2".."Thứ 7", "Chủ nhật" (không dấu vẫn được).
// Chuẩn hoá về ISO 1..7 (1=Mon..7=Sun) để service lọc theo giờ VN.
const INVALID_WEEKDAY = "__invalid_weekday__";

function tokenToIsoWeekday(token: string): number | typeof INVALID_WEEKDAY {
  const t = token
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/Đ/g, "D")
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ");
  switch (t) {
    case "2":
    case "T2":
    case "THU 2":
    case "THU2":
    case "MON":
    case "MONDAY":
      return 1;
    case "3":
    case "T3":
    case "THU 3":
    case "THU3":
    case "TUE":
    case "TUES":
    case "TUESDAY":
      return 2;
    case "4":
    case "T4":
    case "THU 4":
    case "THU4":
    case "WED":
    case "WEDNESDAY":
    case "THU TU":
    case "THUTU":
      return 3;
    case "5":
    case "T5":
    case "THU 5":
    case "THU5":
    case "THU":
    case "THUR":
    case "THURS":
    case "THURSDAY":
    case "THU NAM":
    case "THUNAM":
      return 4;
    case "6":
    case "T6":
    case "THU 6":
    case "THU6":
    case "FRI":
    case "FRIDAY":
    case "THU SAU":
    case "THUSAU":
      return 5;
    case "7":
    case "T7":
    case "THU 7":
    case "THU7":
    case "SAT":
    case "SATURDAY":
    case "THU BAY":
    case "THUBAY":
      return 6;
    case "8":
    case "CN":
    case "SUN":
    case "SUNDAY":
    case "CHU NHAT":
    case "CHUNHAT":
      return 7;
    default:
      return INVALID_WEEKDAY;
  }
}

function normalizeWeekdayQuery(v: unknown): Array<number | string> | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const tokens: string[] = Array.isArray(v)
    ? (v as unknown[]).flatMap((x) => String(x).split(","))
    : String(v).split(",");
  const cleaned = tokens.map((t) => String(t).trim()).filter((t) => t !== "");
  if (cleaned.length === 0) return undefined;
  const mapped: Array<number | string> = [];
  for (const tok of cleaned) {
    // Token lạ -> giữ sentinel string để zod báo 400 đúng field.
    mapped.push(tokenToIsoWeekday(tok));
  }
  return mapped;
}

const WeekdayArraySchema = z
  .preprocess(
    normalizeWeekdayQuery,
    z.array(z.number().int().min(1).max(7), {
      invalid_type_error: "weekday must be Thứ 2..8/CN (VD: weekday=2&weekday=4 hoặc weekdays=2,4,8)",
    }).min(1).max(7)
  )
  .optional();

export const CreateScheduleSchema = z.object({
  classId: z.string().min(1),
  roomId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
}).refine((d) => new Date(d.endTime) > new Date(d.startTime), {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

const PlannerScheduleSchema = z.object({
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
}).refine((d) => new Date(d.endTime) > new Date(d.startTime), {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

export const CreateActivityPlanSchema = z.object({
  sport: z.union([
    z.object({ mode: z.literal("existing"), id: z.string().min(1) }),
    z.object({
      mode: z.literal("new"),
      name: z.string().trim().min(2),
      description: z.string().trim().optional(),
    }),
  ]),
  class: z.object({
    name: z.string().trim().min(2),
    description: z.string().trim().optional(),
    capacity: z.number().int().positive().max(200),
    classType: z.enum(["REGULAR", "PREMIUM"]),
    areaType: z.enum(["POOL", "INDOOR", "OUTDOOR"]),
  }),
  primaryCoachId: z.string().min(1),
  supportCoachId: z.string().min(1).optional(),
  roomId: z.string().min(1),
  schedules: z.array(PlannerScheduleSchema).min(1).max(500),
}).superRefine((data, ctx) => {
  if (data.supportCoachId === data.primaryCoachId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["supportCoachId"],
      message: "Support coach must be different from primary coach",
    });
  }

  const ordered = data.schedules
    .map((schedule, index) => ({
      index,
      start: new Date(schedule.startTime).getTime(),
      end: new Date(schedule.endTime).getTime(),
    }))
    .sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedules", ordered[index].index],
        message: "Schedules in the activity plan must not overlap",
      });
      break;
    }
  }
});

export const UpdateScheduleSchema = z.object({
  roomId: z.string().min(1).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(["SCHEDULED", "CANCELLED", "COMPLETED"]).optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (d) => {
    // Validate sớm khi request cung cấp đủ 2 mốc giờ mới.
    if (d.startTime && d.endTime) return new Date(d.endTime) > new Date(d.startTime);
    return true;
  },
  { message: "endTime must be after startTime", path: ["endTime"] }
);

export const ScheduleQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  classId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  status: z.enum(["SCHEDULED", "CANCELLED", "COMPLETED"]).optional(),
  date: z.string().optional(),
  startAfter: z.string().optional(),
  startBefore: z.string().optional(),
  // Overlap-range filtering: schedule.startTime < to AND schedule.endTime > from.
  // Legacy date/startAfter/startBefore vẫn là start-time filtering.
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  // Lọc theo thứ trong tuần (giờ VN, tính trên startTime).
  // weekday: 1 giá trị; weekdays: nhiều giá trị. Cả 2 đều hợp nhất.
  weekday: WeekdayArraySchema,
  weekdays: WeekdayArraySchema,
}).refine(
  (d) => {
    if (d.from && d.to) return new Date(d.to) > new Date(d.from);
    return true;
  },
  { message: "to must be after from", path: ["to"] }
).transform((d) => {
  const merged = [...(d.weekday ?? []), ...(d.weekdays ?? [])];
  const unique = [...new Set(merged)].sort((a, b) => a - b);
  // Giữ nguyên weekday/weekdays đã chuẩn hoá + thêm mảng gộp để service dùng.
  return {
    ...d,
    weekday: d.weekday ? ([...new Set(d.weekday)] as number[]).sort((a, b) => a - b) : undefined,
    weekdays: d.weekdays ? ([...new Set(d.weekdays)] as number[]).sort((a, b) => a - b) : undefined,
    weekdayIso: unique.length ? (unique as number[]) : undefined,
  };
});
