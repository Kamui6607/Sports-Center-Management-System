import { prisma } from "../../config/prisma.js";

export async function getRevenueReport(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  // Set end to end of day
  end.setHours(23, 59, 59, 999);

  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalAgg, byStatus, byMethod, recentPayments] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...dateFilter, status: "SUCCESS" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.groupBy({
      by: ["status"],
      where: dateFilter,
      _count: true,
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { ...dateFilter, status: "SUCCESS" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.findMany({
      where: dateFilter,
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
  };
}

export async function getMemberReport(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const now = new Date();

  const [totalMembers, newMembers, activeSubs, membersByTier] = await Promise.all([
    prisma.memberProfile.count(),
    prisma.memberProfile.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.membershipSubscription.findMany({
      where: { status: "ACTIVE", endDate: { gte: now } },
      select: { memberId: true, tier: true },
      distinct: ["memberId"],
    }),
    prisma.membershipSubscription.groupBy({
      by: ["tier"],
      where: { status: "ACTIVE", endDate: { gte: now } },
      _count: { memberId: true },
    }),
  ]);

  const activeCount = activeSubs.length;
  const expiredCount = totalMembers - activeCount;

  const tierMap: Record<string, number> = { FREE: 0, MEMBERSHIP: 0, PREMIUM: 0 };
  for (const t of membersByTier) tierMap[t.tier] = t._count.memberId;
  tierMap.FREE = totalMembers - activeCount;

  return {
    totalMembers,
    newMembers,
    activeMembers: activeCount,
    expiredMembers: expiredCount,
    membersByTier: tierMap,
  };
}

export async function getEnrollmentReport(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalEnrollments, cancelledEnrollments, topClasses, byClassType] = await Promise.all([
    prisma.enrollment.count({ where: { ...dateFilter, status: "BOOKED" } }),
    prisma.enrollment.count({ where: { ...dateFilter, status: "CANCELLED" } }),
    prisma.enrollment.groupBy({
      by: ["classId"],
      where: dateFilter,
      _count: { classId: true },
      orderBy: { _count: { classId: "desc" } },
      take: 5,
    }),
    prisma.enrollment.groupBy({
      by: ["classId"],
      where: dateFilter,
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
    cancelledEnrollments,
    topClasses: topClassesResult,
    enrollmentsByClassType: byType,
  };
}

export async function getMembershipReport(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const now = new Date();

  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalSubs, newSubs, byStatus, byTier, revenueAgg] = await Promise.all([
    prisma.membershipSubscription.count(),
    prisma.membershipSubscription.count({ where: dateFilter }),
    prisma.membershipSubscription.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.membershipSubscription.groupBy({
      by: ["tier"],
      where: { ...dateFilter, status: "ACTIVE" },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        ...dateFilter,
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
