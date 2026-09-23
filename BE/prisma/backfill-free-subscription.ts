/**
 * One-time idempotent backfill: cấp subscription FREE ACTIVE cho Member "legacy" chưa có gói ACTIVE
 * (tài khoản tạo trước khi có flow auto-provisioning). Reuse `ensureActiveFreeSubscription()` —
 * KHÔNG duplicate logic (reuse FREE plan + advisory lock + chống duplicate nằm trong service đó).
 *
 * Chạy:
 *   npx tsx prisma/backfill-free-subscription.ts            # dry-run: chỉ liệt kê, không mutate
 *   npx tsx prisma/backfill-free-subscription.ts --apply    # áp dụng (idempotent)
 *   (npm:  npm run db:backfill:free-subscription -- --apply)
 *
 * Phạm vi & an toàn:
 * - CHỈ MemberProfile có user.role = MEMBER (COACH/STAFF/MANAGER không có memberProfile).
 * - Bỏ qua member đang có subscription ACTIVE (bất kể tier) → chạy lại không tạo thêm.
 * - Bỏ qua tài khoản đã khóa (user.isActive = false) — chỉ report, không mutate.
 * - KHÔNG đụng enrollment / attendance / payment / invoice.
 *
 * Rollback: script in ra id của từng subscription đã tạo; xoá đúng các id đó:
 *   DELETE FROM "MembershipSubscription" WHERE id IN ('<id1>', ...);
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";
import { ensureActiveFreeSubscription } from "../src/modules/subscriptions/free-subscription.service.js";

type Row = {
  id: string;
  email: string;
  isActive: boolean;
  hasActiveSubscription: boolean;
};

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const members = await prisma.memberProfile.findMany({
    where: { user: { role: "MEMBER" } },
    select: {
      id: true,
      user: { select: { email: true, isActive: true } },
      subscriptions: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: Row[] = members.map((m) => ({
    id: m.id,
    email: m.user.email,
    isActive: m.user.isActive,
    hasActiveSubscription: m.subscriptions.length > 0,
  }));

  const withoutActive = rows.filter((r) => !r.hasActiveSubscription);
  const eligible = withoutActive.filter((r) => r.isActive);
  const skipped = withoutActive.filter((r) => !r.isActive);

  console.log(`\n=== Backfill FREE subscription (${apply ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`Tổng MemberProfile            : ${rows.length}`);
  console.log(`Không có gói ACTIVE           : ${withoutActive.length}`);
  console.log(`  - sẽ cấp FREE (đang active) : ${eligible.length}`);
  console.log(`  - bỏ qua (tài khoản khóa)   : ${skipped.length}`);
  for (const r of eligible) console.log(`    [${apply ? "create" : "would create"}] ${r.email} (${r.id})`);
  for (const r of skipped) console.log(`    [skip] ${r.email} (${r.id}) — account locked`);

  const createdIds: string[] = [];
  if (apply) {
    for (const r of eligible) {
      const result = await prisma.$transaction((tx) => ensureActiveFreeSubscription(tx, r.id));
      if (result.created) createdIds.push(result.subscription.id);
    }
    console.log(`\nĐã tạo ${createdIds.length} subscription FREE ACTIVE:`);
    for (const id of createdIds) console.log(`  - ${id}`);
  } else if (eligible.length > 0) {
    console.log("\n(dry-run) Chưa mutate gì. Chạy lại với --apply để áp dụng.");
  }

  // ─── Verification (sau khi apply, hoặc baseline khi dry-run) ───
  const [totalMembers, membersWithoutActive, duplicateActive, freePlans, nonMemberSubs] =
    await Promise.all([
      prisma.memberProfile.count(),
      prisma.memberProfile.count({
        where: { NOT: { subscriptions: { some: { status: "ACTIVE" } } } },
      }),
      prisma.$queryRaw<{ memberId: string }[]>`
        SELECT "memberId" FROM "MembershipSubscription"
        WHERE status = 'ACTIVE' GROUP BY "memberId" HAVING COUNT(*) > 1`,
      prisma.membershipPlan.count({ where: { tier: "FREE" } }),
      prisma.membershipSubscription.count({
        where: { member: { user: { role: { not: "MEMBER" } } } },
      }),
    ]);

  console.log("\n=== Verification ===");
  console.log(`Member còn thiếu gói ACTIVE   : ${membersWithoutActive}/${totalMembers}`);
  console.log(
    `Member có >1 gói ACTIVE       : ${duplicateActive.length}` +
      (duplicateActive.length ? ` (${duplicateActive.map((d) => d.memberId).join(", ")})` : " (none)")
  );
  console.log(`Số plan FREE                  : ${freePlans} (kỳ vọng 1)`);
  console.log(`Subscription của role khác    : ${nonMemberSubs} (kỳ vọng 0)`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });