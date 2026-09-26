import type { MemberTier } from "@prisma/client";

/**
 * Quota lớp học song song (MembershipPlan.maxConcurrentClasses) — nguồn duy nhất cho con số
 * nghiệp vụ mặc định, KHÔNG hard-code trong service đặt chỗ.
 *
 * Luật: một hội viên được giữ đồng thời tối đa N Class KHÁC NHAU
 * (đếm DISTINCT Class có Enrollment BOOKED ở buổi SCHEDULED chưa bắt đầu).
 */
export const DEFAULT_MAX_CONCURRENT_CLASSES: Record<MemberTier, number> = {
  FREE: 0,
  MEMBERSHIP: 3,
  PREMIUM: 6,
};

/**
 * Quota dùng khi Manager tạo MembershipPlan mà không chỉ định `maxConcurrentClasses`.
 * Cùng giá trị với backfill của migration `20260923150000_add_max_concurrent_classes`.
 */
export function resolveMaxConcurrentClasses(tier: MemberTier, provided?: number): number {
  return provided ?? DEFAULT_MAX_CONCURRENT_CLASSES[tier] ?? 0;
}

/**
 * FREE plan hệ thống (tier FREE, maxConcurrentClasses = 0, isActive = true).
 *
 * Member mới được auto-provision một MembershipSubscription ACTIVE với plan này
 * (`ensureActiveFreeSubscription`) để không rơi vào trạng thái "không có subscription".
 * Chỉ dùng ĐÚNG MỘT plan FREE: provisioning reuse plan FREE active đang có, seed upsert `plan-free-001`.
 */
export const FREE_PLAN = {
  name: "FREE",
  description:
    "Gói mặc định cấp khi tạo tài khoản hội viên: chưa bao gồm lớp học (0 lớp song song).",
  price: 0,
  /** 10 năm — đủ dài để subscription FREE luôn ACTIVE theo thời hạn của hội viên. */
  durationDays: 3650,
  tier: "FREE" as MemberTier,
} as const;

