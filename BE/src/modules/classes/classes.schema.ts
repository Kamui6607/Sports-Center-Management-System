import { z } from "zod";

export const AreaTypeEnum = z.enum(["POOL", "INDOOR", "OUTDOOR"]);

export const CreateClassSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  sportIds: z.array(z.string().min(1)).min(1, "Must assign at least one sport"),
  capacity: z.number().int().positive().max(200),
  classType: z.enum(["REGULAR", "PREMIUM"]).default("REGULAR"),
  areaType: AreaTypeEnum,
  /** Giá khóa học member phải trả (0 = miễn phí). Member trả đúng số này; nền tảng giữ 15% hoa hồng. */
  price: z.number().min(0).max(999999999).default(0),
  /** Thời hạn sử dụng kể từ lúc mua; bỏ trống = vĩnh viễn. */
  durationDays: z.number().int().positive().max(3650).optional(),
  /** MANAGER có thể gán Coach sở hữu khóa học; COACH gửi field này sẽ bị 403. */
  ownerCoachId: z.string().min(1).optional(),
});

export const UpdateClassSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  sportIds: z.array(z.string().min(1)).min(1, "Must assign at least one sport").optional(),
  capacity: z.number().int().positive().max(200).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  price: z.number().min(0).max(999999999).optional(),
  durationDays: z.union([z.number().int().positive().max(3650), z.null()]).optional(),
  ownerCoachId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const AssignCoachSchema = z.object({
  coachId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

// Phân công HLV hỗ trợ (support coach): luôn lưu với isPrimary = false.
// Mỗi Class chỉ có duy nhất 1 HLV chính nên endpoint này không nhận isPrimary.
export const AssignSupportCoachSchema = z.object({
  coachId: z.string().min(1),
});

export const ClassQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sportId: z.string().optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.string().optional(),
  coachId: z.string().optional(),
  /** Lọc khóa học do một Coach SỞ HỮU (CoachProfile.id). */
  ownerCoachId: z.string().optional(),
});
