import { z } from "zod";
import { FITNESS_GOAL_CODES, GYM_FITNESS, MAX_CLASS_GOALS } from "../../config/fitness-goals.js";

export const AreaTypeEnum = z.enum(["POOL", "INDOOR", "OUTDOOR"]);
const TrainingLevelEnum = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
const GoalTagsSchema = z.array(z.enum(FITNESS_GOAL_CODES)).max(MAX_CLASS_GOALS);

export const CreateClassSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  // Phạm vi Gym: bộ môn cố định "Gym" — giữ field để tương thích client cũ.
  fitness: z.string().trim().min(2).max(60).default(GYM_FITNESS),
  // Mục tiêu của lớp — Member xem để quyết định có đăng ký hay không.
  goal: z.string().trim().min(1).max(1000).optional(),
  goalTags: GoalTagsSchema.default([]),
  targetLevel: TrainingLevelEnum.nullable().optional(),
  capacity: z.number().int().positive().max(200),
  classType: z.enum(["REGULAR", "PREMIUM"]).default("REGULAR"),
  areaType: AreaTypeEnum.default("INDOOR"),
  // Coach bắt buộc set giá; Manager có thể để 0 nếu muốn lớp miễn phí
  price: z.number().min(0).default(0),
});

export const UpdateClassSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  goal: z.string().trim().min(1).max(1000).optional(),
  goalTags: GoalTagsSchema.optional(),
  targetLevel: TrainingLevelEnum.nullable().optional(),
  fitness: z.string().trim().min(2).max(60).optional(),
  capacity: z.number().int().positive().max(200).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.boolean().optional(),
  price: z.number().min(0).optional(),
});

/**
 * Bản nháp khóa học (wizard tự lưu): mọi field đều tùy chọn, chưa kiểm tra đủ điều kiện gửi duyệt.
 * `draftData` = toàn bộ trạng thái wizard (phòng, lịch lặp, danh sách buổi dự kiến…), client tự định nghĩa.
 */
export const ClassDraftSchema = z.object({
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  goal: z.string().trim().max(1000).nullable().optional(),
  goalTags: GoalTagsSchema.optional(),
  targetLevel: TrainingLevelEnum.nullable().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  price: z.number().min(0).max(1_000_000_000).optional(),
  draftData: z.record(z.unknown()).optional(),
});

export type ClassDraftInput = z.infer<typeof ClassDraftSchema>;

export const ApproveClassSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(500).optional(),
});

export const ClassQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  /** Tìm theo tên — không phân biệt hoa/thường, gõ không dấu vẫn khớp. */
  search: z.string().optional(),
  fitness: z.string().optional(),
  /** Lọc theo một mục tiêu (mã trong GET /classes/goal-options). */
  goal: z.enum(FITNESS_GOAL_CODES).optional(),
  /** MEMBER: "true" ⇒ chỉ khóa khớp ít nhất 1 mục tiêu của tôi, sắp theo độ phù hợp. */
  matchMyGoals: z.enum(["true", "false"]).optional(),
  classType: z.enum(["REGULAR", "PREMIUM"]).optional(),
  areaType: AreaTypeEnum.optional(),
  isActive: z.string().optional(),
  coachId: z.string().optional(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "COMPLETED"]).optional(),
  createdByMe: z.string().optional(), // "true" → chỉ trả lớp Coach đã tạo
  /** "true" ⇒ chỉ lấy khóa học có ít nhất 1 buổi học SCHEDULED sắp tới chưa diễn ra. */
  hasUpcomingSchedules: z.enum(["true", "false"]).optional(),
});
