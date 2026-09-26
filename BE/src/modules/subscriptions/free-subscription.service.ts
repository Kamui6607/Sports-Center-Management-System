import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { DEFAULT_MAX_CONCURRENT_CLASSES, FREE_PLAN } from "../../config/membership.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Khoá advisory cho toàn bộ provisioning FREE (plan + subscription) — chống tạo trùng khi chạy song song. */
const FREE_PROVISION_LOCK_KEY = "membership:free-provision";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gói FREE hệ thống: reuse plan FREE đang active nếu có; chỉ tạo khi thật sự chưa tồn tại.
 * Luôn chạy trong advisory lock transaction để 2 request provisioning song song
 * không sinh ra 2 FREE plan (rule: chỉ MỘT FREE plan, không duplicate).
 */
async function findOrCreateFreePlan(db: DbClient) {
  const existing = await db.membershipPlan.findFirst({
    where: { tier: FREE_PLAN.tier, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FREE_PROVISION_LOCK_KEY}))`;

  const raced = await db.membershipPlan.findFirst({
    where: { tier: FREE_PLAN.tier, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (raced) return raced;

  return db.membershipPlan.create({
    data: {
      name: FREE_PLAN.name,
      description: FREE_PLAN.description,
      price: FREE_PLAN.price,
      durationDays: FREE_PLAN.durationDays,
      tier: FREE_PLAN.tier,
      maxConcurrentClasses: DEFAULT_MAX_CONCURRENT_CLASSES.FREE,
      isActive: true,
    },
  });
}

/**
 * Bảo đảm Member luôn có một MembershipSubscription ACTIVE (idempotent):
 *
 * - Đã có subscription `ACTIVE` (bất kể tier)  → KHÔNG tạo gì thêm
 *   (đúng rule hiện tại: 1 member tối đa 1 subscription ACTIVE).
 * - Chưa có                                    → tạo subscription ACTIVE với plan FREE
 *   (`tier = FREE`, `maxConcurrentClasses = 0`), startDate = now, endDate = now + plan.durationDays.
 *
 * Dùng cho MỌI flow provision Member (register, Manager tạo user MEMBER, seed).
 * KHÔNG gọi cho COACH/STAFF/MANAGER — họ không có memberProfile.
 *
 * BẮT BUỘC gọi trong transaction: advisory lock `pg_advisory_xact_lock` chỉ có tác dụng
 * trong transaction (register/createUser/seed đều đã bọc sẵn).
 */
export async function ensureActiveFreeSubscription(db: DbClient, memberProfileId: string) {
  const existing = await db.membershipSubscription.findFirst({
    where: { memberId: memberProfileId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { subscription: existing, created: false };

  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FREE_PROVISION_LOCK_KEY}))`;

  const raced = await db.membershipSubscription.findFirst({
    where: { memberId: memberProfileId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (raced) return { subscription: raced, created: false };

  const plan = await findOrCreateFreePlan(db);
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * DAY_MS);

  const subscription = await db.membershipSubscription.create({
    data: {
      memberId: memberProfileId,
      planId: plan.id,
      tier: plan.tier,
      startDate,
      endDate,
      status: "ACTIVE",
    },
  });

  return { subscription, created: true };
}
