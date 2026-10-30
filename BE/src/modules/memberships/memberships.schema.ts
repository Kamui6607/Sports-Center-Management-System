import { z } from "zod";

/** `POST /memberships/purchase`. */
export const PurchaseMembershipSchema = z.object({
  planId: z.string().min(1),
});

/** MANAGER: `GET /memberships`. */
export const MembershipQuerySchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
  planId: z.string().optional(),
  /** Tìm theo tên / email / SĐT hội viên. */
  search: z.string().trim().max(100).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const UserIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const PlanIdParamSchema = z.object({
  id: z.string().min(1),
});

const planFields = {
  name: z.string().trim().min(1).max(100),
  durationDays: z.number().int().min(1).max(3650),
  price: z.number().int().min(1000),
  description: z.string().trim().max(500).optional(),
  /** Quyền lợi hiển thị trên thẻ gói (tối đa 8 dòng, mỗi dòng ≤ 120 ký tự). */
  benefits: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
};

/** MANAGER: `POST /membership-plans`. */
export const CreatePlanSchema = z.object(planFields);

/** MANAGER: `PATCH /membership-plans/:id` — gửi field nào sửa field đó (chỉ áp dụng cho giao dịch mới). */
export const UpdatePlanSchema = z
  .object(planFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Không có thay đổi nào." });

/** MANAGER: `PATCH /membership-plans/:id/toggle` — bỏ trống `isActive` ⇒ đảo trạng thái hiện tại. */
export const TogglePlanSchema = z.object({
  isActive: z.boolean().optional(),
});

/** MANAGER/COACH: `POST /memberships/pass/verify` — mã QR động trên thẻ thành viên. */
export const VerifyMemberPassSchema = z.object({
  token: z.string().trim().min(10).max(2000),
});

/** MANAGER: `GET /memberships/pass/scans`. */
export const MemberPassScanQuerySchema = z.object({
  valid: z.enum(["true", "false"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

/** MANAGER: `POST /memberships/:id/cancel`. */
export const CancelMembershipSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  /** Số tiền hoàn (0 = không hoàn) — tối đa giá trị còn lại của gói. */
  refundAmount: z.number().int().min(0).optional(),
});

export type MembershipQueryInput = z.infer<typeof MembershipQuerySchema>;
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type CancelMembershipInput = z.infer<typeof CancelMembershipSchema>;
