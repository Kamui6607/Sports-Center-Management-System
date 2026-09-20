import { prisma } from "../../config/prisma.js";

export async function getRevenueReport(startDate: string, endDate: string) {
  // BR-26: Parse as VN business day boundaries (start of startDate, end of endDate in +07:00)
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);

  // BR-20: Use paidAt for actual cash-collected revenue (not createdAt)
  const paidFilter = { paidAt: { gte: start, lte: end } };
  const createdFilter = { createdAt: { gte: start, lte: end } };

  const [totalAgg, byStatus, byMethod, recentPayments] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...paidFilter, status: "SUCCESS" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.groupBy({
      by: ["status"],
      where: createdFilter,
      _count: true,
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { ...paidFilter, status: "SUCCESS" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.findMany({
      where: createdFilter,
      include: {
        member: { include: { user: { select: { fullName: true } } } },
        invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) statusMap[s.status] = s._count;

  const methodMap: Record<string, number> = {};
  for (const m of byMethod) methodMap[m.method] = Number(m._sum.amount ?? 0);

  return {
    totalRevenue: Number(totalAgg._sum.amount ?? 0),
    totalPayments: byStatus.reduce((acc, s) => acc + s._count, 0),
    successPayments: statusMap["SUCCESS"] ?? 0,
    failedPayments: statusMap["FAILED"] ?? 0,
    pendingPayments: statusMap["PENDING"] ?? 0,
    refundedPayments: statusMap["REFUNDED"] ?? 0,
    revenueByMethod: {
      CASH: methodMap["CASH"] ?? 0,
      BANK_TRANSFER: methodMap["BANK_TRANSFER"] ?? 0,
    },
    recentPayments,
    note: "totalRevenue = cash collected (paidAt in range). Refunds not yet deducted.",
  };
}

export async function getMemberReport(startDate: string, endDate: string) {
  // BR-26: VN timezone boundary
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);
  const now = new Date();

  // BR-19: Use distinct memberId to count PEOPLE not subscriptions
  const [totalMembers, newMembers, activeSubs] = await Promise.all([
    // Count members whose user is still MEMBER role and active
    prisma.memberProfile.count({
      where: { user: { role: "MEMBER", isActive: true } },
    }),
    prisma.memberProfile.count({
      where: {
        createdAt: { gte: start, lte: end },
        user: { role: "MEMBER", isActive: true },
      },
    }),
    prisma.membershipSubscription.findMany({
      where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } },
      select: { memberId: true, tier: true },
    }),
  ]);

  // Count distinct members (max tier per person)
  const memberTierMap: Record<string, string> = {};
  for (const s of activeSubs) {
    // Priority: PREMIUM > MEMBERSHIP
    if (!memberTierMap[s.memberId] || s.tier === "PREMIUM") {
      memberTierMap[s.memberId] = s.tier;
    }
  }

  const activeCount = Object.keys(memberTierMap).length;
  const tierCounts: Record<string, number> = { FREE: 0, MEMBERSHIP: 0, PREMIUM: 0 };
  for (const tier of Object.values(memberTierMap)) {
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }
  tierCounts.FREE = totalMembers - activeCount;

  return {
    totalMembers,
    newMembers,
    activeMembers: activeCount,
    expiredMembers: totalMembers - activeCount,
    membersByTier: tierCounts,
    note: "membersByTier counts PEOPLE (max tier per person), not subscriptions.",
  };
}

export async function getEnrollmentReport(startDate: string, endDate: string) {
  // BR-26: VN timezone boundary
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);
  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalEnrollments, completedEnrollments, cancelledEnrollments, topClasses, byClassType] = await Promise.all([
    // BR-19: Count both BOOKED and COMPLETED as "enrolled" (not just BOOKED)
    prisma.enrollment.count({ where: { ...dateFilter, status: { in: ["BOOKED", "COMPLETED"] } } }),
    prisma.enrollment.count({ where: { ...dateFilter, status: "COMPLETED" } }),
    prisma.enrollment.count({ where: { ...dateFilter, status: "CANCELLED" } }),
    prisma.enrollment.groupBy({
      by: ["classId"],
      where: { ...dateFilter, status: { in: ["BOOKED", "COMPLETED"] } },
      _count: { classId: true },
      orderBy: { _count: { classId: "desc" } },
      take: 5,
    }),
    prisma.enrollment.groupBy({
      by: ["classId"],
      where: { ...dateFilter, status: { in: ["BOOKED", "COMPLETED"] } },
      _count: true,
    }),
  ]);

  // Fetch class names for top classes
  const topClassIds = topClasses.map((c) => c.classId);
  const topClassDetails = await prisma.class.findMany({
    where: { id: { in: topClassIds } },
    select: { id: true, name: true, classType: true },
  });
  const classMap = Object.fromEntries(topClassDetails.map((c) => [c.id, c]));
  const topClassesResult = topClasses.map((c) => ({
    classId: c.classId,
    className: classMap[c.classId]?.name ?? "Unknown",
    count: c._count.classId,
  }));

  // By class type
  const allClassIds = byClassType.map((c) => c.classId);
  const allClassDetails = await prisma.class.findMany({
    where: { id: { in: allClassIds } },
    select: { id: true, classType: true },
  });
  const classTypeMap = Object.fromEntries(allClassDetails.map((c) => [c.id, c.classType]));
  const byType = { REGULAR: 0, PREMIUM: 0 };
  for (const item of byClassType) {
    const type = classTypeMap[item.classId] ?? "REGULAR";
    byType[type as "REGULAR" | "PREMIUM"] = (byType[type as "REGULAR" | "PREMIUM"] ?? 0) + item._count;
  }

  return {
    totalEnrollments,
    completedEnrollments,
    cancelledEnrollments,
    topClasses: topClassesResult,
    enrollmentsByClassType: byType,
  };
}

export async function getMembershipReport(startDate: string, endDate: string) {
  // BR-26: VN timezone boundary
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);
  const now = new Date();
  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalSubs, newSubs, byStatus, byTier, revenueAgg] = await Promise.all([
    prisma.membershipSubscription.count(),
    prisma.membershipSubscription.count({ where: dateFilter }),
    prisma.membershipSubscription.groupBy({
      by: ["status"],
      _count: true,
    }),
    // BR-19: Count subscriptions currently effective (not just in date range) by tier
    prisma.membershipSubscription.groupBy({
      by: ["tier"],
      where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } },
      _count: true,
    }),
    // BR-20: Use paidAt for revenue
    prisma.payment.aggregate({
      where: {
        paidAt: { gte: start, lte: end },
        status: "SUCCESS",
        subscriptionId: { not: null },
      },
      _sum: { amount: true },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) statusMap[s.status] = s._count;

  const tierMap: Record<string, number> = { MEMBERSHIP: 0, PREMIUM: 0 };
  for (const t of byTier) tierMap[t.tier] = t._count;

  return {
    totalSubscriptions: totalSubs,
    newSubscriptions: newSubs,
    activeSubscriptions: statusMap["ACTIVE"] ?? 0,
    expiredSubscriptions: statusMap["EXPIRED"] ?? 0,
    cancelledSubscriptions: statusMap["CANCELLED"] ?? 0,
    suspendedSubscriptions: statusMap["SUSPENDED"] ?? 0,
    subscriptionsByTier: tierMap,
    totalRevenue: Number(revenueAgg._sum.amount ?? 0),
  };
}

export async function getSubscriptionLogs(startDate?: string, endDate?: string, pageStr?: string, limitStr?: string) {
  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? "20") || 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00+07:00`);
    const end = new Date(`${endDate}T23:59:59.999+07:00`);
    where.createdAt = { gte: start, lte: end };
  }

  const [total, subs] = await Promise.all([
    prisma.membershipSubscription.count({ where }),
    prisma.membershipSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        member: { include: { user: { select: { fullName: true, email: true } } } },
        plan: { select: { name: true, price: true } },
        payments: { select: { amount: true, status: true, paidAt: true }, take: 1, orderBy: { createdAt: "desc" } }
      }
    })
  ]);

  const formattedLogs = subs.map(sub => ({
    id: sub.id,
    action: "Mua / Gia hạn gói", // Action description as requested
    username: sub.member.user.fullName,
    email: sub.member.user.email,
    planName: sub.plan.name,
    planTier: sub.tier,
    price: Number(sub.payments[0]?.amount ?? sub.plan.price),
    paymentStatus: sub.payments[0]?.status ?? "N/A",
    startDate: sub.startDate,
    endDate: sub.endDate,
    purchasedAt: sub.createdAt, // Real-time timestamp
  }));

  return {
    data: formattedLogs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  };
}
