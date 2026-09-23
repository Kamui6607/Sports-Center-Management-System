import { Prisma, MemberTier } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Hội viên KHÔNG có MembershipSubscription ACTIVE => quota 0 (không được giữ Class mới).
 * `used` vẫn phản ánh số Class đang giữ thật (grandfathered) nhưng `remaining` luôn = 0.
 */
const NO_ACTIVE_SUBSCRIPTION_QUOTA = 0;

/** Error code cho 403 khi vượt quota lớp học song song. */
export const CONCURRENT_CLASS_LIMIT_CODE = "CONCURRENT_CLASS_LIMIT_REACHED";

export interface ConcurrentClassUsage {
  classId: string;
  className: string;
  /** Số buổi tương lai (BOOKED + SCHEDULED) của Class này — quota vẫn chỉ tính 1 cho cả Class. */
  futureBookedScheduleCount: number;
  /** Buổi ĐẠI DIỆN (gần nhất) của Class; Class có thể còn nhiều buổi BOOKED khác. */
  scheduleId: string;
  scheduleStartTime: Date;
  enrollmentId: string;
}

export interface ConcurrentClassQuota {
  /** `false` => member không có MembershipSubscription ACTIVE (tier = null, limit = 0, remaining = 0). */
  hasActiveSubscription: boolean;
  /** Tier của gói ACTIVE; `null` khi không có gói ACTIVE — KHÔNG dùng "FREE" để đại diện trường hợp này. */
  tier: MemberTier | null;
  limit: number;
  used: number;
  remaining: number;
  classes: ConcurrentClassUsage[];
}

/**
 * Resolver MembershipSubscription đang hiệu lực — NGUỒN DUY NHẤT dùng chung cho
 * luật đặt chỗ (`assertCanBook`) và quota: ACTIVE + startDate <= now <= endDate,
 * ưu tiên tier cao hơn rồi endDate xa hơn (giữ nguyên cách chọn hiện có của dự án).
 */
export async function findActiveSubscription(
  db: DbClient,
  memberProfileId: string,
  now: Date = new Date()
) {
  return db.membershipSubscription.findFirst({
    where: {
      memberId: memberProfileId,
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: [{ tier: "desc" }, { endDate: "desc" }],
    include: { plan: true },
  });
}

/**
 * Quota lớp học song song của một hội viên — tính ĐỘNG từ DB, không lưu counter.
 *
 * `used` = COUNT(DISTINCT Class) mà hội viên đang có ít nhất 1 Enrollment BOOKED ở
 * một buổi CHƯA bắt đầu và còn hợp lệ để học (ClassSchedule.status = SCHEDULED,
 * startTime > now). Nhiều buổi BOOKED trong CÙNG một Class vẫn chỉ tính 1 quota.
 *
 * Không tính: Enrollment COMPLETED/CANCELLED, buổi đã bắt đầu, buổi CANCELLED/COMPLETED.
 *
 * Subscription:
 * - Có MembershipSubscription ACTIVE  → `hasActiveSubscription = true`, `tier` = tier gói,
 *   `limit` = `MembershipPlan.maxConcurrentClasses`.
 * - KHÔNG có ACTIVE subscription (dữ liệu cũ/bất thường) → `hasActiveSubscription = false`,
 *   `tier = null`, `limit = 0`, `remaining = 0`; `used` vẫn phản ánh Class đang giữ thật.
 *   Không bao giờ trả `tier = "FREE"` cho trường hợp thiếu subscription (FREE là tier thật).
 */
export async function getMemberConcurrentClassQuota(
  db: DbClient,
  memberProfileId: string,
  options: { now?: Date } = {}
): Promise<ConcurrentClassQuota> {
  const now = options.now ?? new Date();

  const [activeSub, bookedRows] = await Promise.all([
    findActiveSubscription(db, memberProfileId, now),
    db.enrollment.findMany({
      where: {
        memberId: memberProfileId,
        status: "BOOKED",
        schedule: { status: "SCHEDULED", startTime: { gt: now } },
      },
      select: {
        id: true,
        classId: true,
        schedule: { select: { id: true, startTime: true, class: { select: { name: true } } } },
      },
      // Buổi gần nhất đại diện cho Class trong response.
      orderBy: { schedule: { startTime: "asc" } },
    }),
  ]);

  const hasActiveSubscription = Boolean(activeSub);
  const limit = activeSub
    ? activeSub.plan.maxConcurrentClasses
    : NO_ACTIVE_SUBSCRIPTION_QUOTA;
  // Không có gói ACTIVE => tier = null. "FREE" là tier THẬT của một MembershipPlan/Subscription,
  // không được dùng để đại diện cho "không có subscription".
  const tier: MemberTier | null = activeSub ? activeSub.tier : null;

  // DISTINCT Class: 1 entry / Class. Buổi gần nhất làm đại diện; đếm thêm số buổi tương lai
  // đang BOOKED của Class đó (quota KHÔNG nhân theo số buổi).
  const classes = new Map<string, ConcurrentClassUsage>();
  for (const row of bookedRows) {
    const existing = classes.get(row.classId);
    if (existing) {
      existing.futureBookedScheduleCount += 1;
      continue;
    }
    classes.set(row.classId, {
      classId: row.classId,
      className: row.schedule.class.name,
      futureBookedScheduleCount: 1,
      scheduleId: row.schedule.id,
      scheduleStartTime: row.schedule.startTime,
      enrollmentId: row.id,
    });
  }

  const used = classes.size;
  return {
    hasActiveSubscription,
    tier,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    classes: [...classes.values()],
  };
}

/**
 * Chốt chặn quota khi Member đăng ký/thêm một Class mới (§8 — dùng trong `assertCanBook`).
 *
 * - Class đã nằm trong quota (đang có buổi BOOKED tương lai) => không tiêu thêm quota.
 * - `quotaExempt`: transfer trong CÙNG Class (BR-08) — số Class không đổi nên không cần quota mới.
 *   Vẫn phải gọi sau `lockMemberQuota()` để không chen với booking khác của cùng member.
 * - Vượt quota => 403 CONCURRENT_CLASS_LIMIT_REACHED kèm tier/limit/used/remaining.
 *
 * Không thay thế luật duplicate-time/capacity hiện có: các luật đó vẫn chạy riêng.
 */
export async function assertConcurrentClassQuota(
  db: DbClient,
  memberProfileId: string,
  targetClassId: string,
  options: { now?: Date; quotaExempt?: boolean } = {}
): Promise<ConcurrentClassQuota> {
  const quota = await getMemberConcurrentClassQuota(db, memberProfileId, options);
  if (options.quotaExempt) return quota;

  const alreadyHoldingClass = quota.classes.some((c) => c.classId === targetClassId);
  if (alreadyHoldingClass || quota.used < quota.limit) return quota;

  throw new AppError(
    `Bạn đã đạt giới hạn ${quota.limit} lớp học song song của gói ${quota.tier ?? "hiện tại"}. ` +
      `Vui lòng hủy hoặc chuyển một lớp đang đặt trước khi đăng ký lớp mới.`,
    403,
    {
      code: CONCURRENT_CLASS_LIMIT_CODE,
      tier: quota.tier,
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
    }
  );
}

/**
 * GET /enrollments/my/quota — chỉ trả quota của chính hội viên đang đăng nhập
 * (không nhận memberId từ bên ngoài => không rò quota của member khác).
 */
export async function getMyConcurrentClassQuota(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  return getMemberConcurrentClassQuota(prisma, memberProfile.id);
}
