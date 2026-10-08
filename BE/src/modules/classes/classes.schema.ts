import { z } from "zod";

export const AreaTypeEnum = z.enum(["POOL", "INDOOR", "OUTDOOR"]);

export const CreateClassSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  // Mục tiêu của lớp — Member xem để quyết định có đăng ký hay không.
  goal: z.string().trim().min(1).max(1000).optional(),
  sportIds: z.array(z.string().min(1)).min(1, "Must assign at least one sport"),
  capacity: z.number().int().positive().max(200),
  classType: z.enum(["REGULAR", "PREMIUM"]).default("REGULAR"),
  areaType: AreaTypeEnum,
  // Coach bắt buộc set giá; Manager có thể để 0 nếu muốn lớp miễn phí
  price: z.number().min(0).default(0),
});

export const UpdateClassSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  goal: z.string().trim().min(1).max(1000).optional(),
  sportIds: z.array(z.string().min(1)).min(1, "Must assign at least one sport").optional(),
  capacity: z.number().int().positive().max(200).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.boolean().optional(),
  price: z.number().min(0).optional(),
});

export const ApproveClassSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(500).optional(),
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
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "COMPLETED"]).optional(),
  createdByMe: z.string().optional(), // "true" → chỉ trả lớp Coach đã tạo
});

