import { prisma } from "../../config/prisma.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { computeAttendanceBuckets } from "../attendance/attendance-analytics.service.js";
import { expireStalePenalties } from "../attendance/attendance-penalties.service.js";

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

  // BR-19: Use distinct memberId to count PEOPLE not purchases
  const [totalMembers, newMembers, activePurchases] = await Promise.all([
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
    // "Member đang hoạt động" = đang sở hữu ít nhất 1 khóa học còn hiệu lực
    // (thay cho định nghĩa cũ "đang có MembershipSubscription ACTIVE").
    prisma.coursePurchase.findMany({
      where: {
        status: "ACTIVE",
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      select: { memberId: true, price: true },
    }),
  ]);

  // Count distinct members owning at least one active course
  const activeMemberIds = new Set(activePurchases.map((p) => p.memberId));
  const activeCount = activeMemberIds.size;
  const activeCourseRevenue = activePurchases.reduce((sum, p) => sum + Number(p.price), 0);

  return {
    totalMembers,
    newMembers,
    activeMembers: activeCount,
    expiredMembers: totalMembers - activeCount,
    activeCoursePurchases: activePurchases.length,
    activeCourseRevenue,
    note: "activeMembers = distinct members owning at least one ACTIVE course purchase (Membership tiers removed).",
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

/**
 * Báo cáo doanh thu khóa học (thay cho báo cáo Membership cũ).
 * Tách rõ 3 con số: tổng tiền Member trả (`price`), hoa hồng nền tảng, phần trả cho Coach.
 */
export async function getCourseRevenueReport(startDate: string, endDate: string) {
  // BR-26: VN timezone boundary
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);
  const now = new Date();
  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalPurchases, newPurchases, byStatus, revenueAgg, activeAgg, topCourses] = await Promise.all([
    prisma.coursePurchase.count(),
    prisma.coursePurchase.count({ where: dateFilter }),
    prisma.coursePurchase.groupBy({
      by: ["status"],
      _count: true,
    }),
    // BR-20: Use paidAt for actual cash-collected revenue (chỉ payment gắn với lượt mua khóa học)
    prisma.payment.aggregate({
      where: {
        paidAt: { gte: start, lte: end },
        status: "SUCCESS",
        coursePurchaseId: { not: null },
      },
      _sum: { amount: true },
    }),
    // Hoa hồng nền tảng & phần Coach của các lượt mua ĐANG hiệu lực (đối soát chi trả Coach)
    prisma.coursePurchase.aggregate({
      where: {
        status: "ACTIVE",
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      _sum: { price: true, commissionAmount: true, coachEarning: true },
      _count: true,
    }),
    // Top khóa học bán chạy trong kỳ
    prisma.coursePurchase.groupBy({
      by: ["classId"],
      where: { ...dateFilter, status: { not: "CANCELLED" } },
      _count: { classId: true },
      _sum: { price: true },
      orderBy: { _count: { classId: "desc" } },
      take: 5,
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) statusMap[s.status] = s._count;

  const classDetails = await prisma.class.findMany({
    where: { id: { in: topCourses.map((c) => c.classId) } },
    select: { id: true, name: true, price: true },
  });
  const classMap = new Map(classDetails.map((c) => [c.id, c]));

  return {
    totalPurchases,
    newPurchases,
    activePurchases: statusMap["ACTIVE"] ?? 0,
    expiredPurchases: statusMap["EXPIRED"] ?? 0,
    cancelledPurchases: statusMap["CANCELLED"] ?? 0,
    totalRevenue: Number(revenueAgg._sum.amount ?? 0),
    activeGrossRevenue: Number(activeAgg._sum.price ?? 0),
    platformCommission: Number(activeAgg._sum.commissionAmount ?? 0),
    coachEarnings: Number(activeAgg._sum.coachEarning ?? 0),
    topCourses: topCourses.map((c) => ({
      classId: c.classId,
      className: classMap.get(c.classId)?.name ?? "Unknown",
      purchaseCount: c._count.classId,
      revenue: Number(c._sum.price ?? 0),
    })),
    note: "totalRevenue = payments gắn coursePurchaseId (paidAt trong kỳ). platformCommission/coachEarnings chỉ tính lượt mua đang ACTIVE.",
  };
}

/** Log chi tiết từng lượt Member mua khóa học (thay cho subscription-logs cũ). */
export async function getCoursePurchaseLogs(startDate?: string, endDate?: string, pageStr?: string, limitStr?: string) {
  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? "20") || 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00+07:00`);
    const end = new Date(`${endDate}T23:59:59.999+07:00`);
    where.createdAt = { gte: start, lte: end };
  }

  const [total, purchases] = await Promise.all([
    prisma.coursePurchase.count({ where }),
    prisma.coursePurchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        member: { include: { user: { select: { fullName: true, email: true } } } },
        class: { select: { id: true, name: true, price: true } },
        coach: { include: { user: { select: { fullName: true } } } },
        payments: { select: { amount: true, status: true, paidAt: true }, take: 1, orderBy: { createdAt: "desc" } }
      }
    })
  ]);

  const formattedLogs = purchases.map(p => ({
    id: p.id,
    action: "Mua khóa học",
    username: p.member.user.fullName,
    email: p.member.user.email,
    className: p.class.name,
    coachName: p.coach?.user.fullName ?? null,
    price: Number(p.payments[0]?.amount ?? p.price),
    commissionAmount: Number(p.commissionAmount),
    coachEarning: Number(p.coachEarning),
    status: p.status,
    paymentStatus: p.payments[0]?.status ?? "N/A",
    startDate: p.startDate,
    endDate: p.endDate,
    purchasedAt: p.createdAt, // Real-time timestamp
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

/**
 * §6: Báo cáo chuyên cần theo (member × class) cho Manager review trước khi áp dụng hình phạt.
 * Cửa sổ tính cố định: tối đa 10 buổi đã kết thúc gần nhất (không dùng date range).
 * status: OK | WARN | RELEASE; kèm penalty đang hiệu lực (nếu có).
 */
export async function getAttendanceReport(query: {
  status?: string;
  classId?: string;
  memberId?: string;
  page?: string;
  limit?: string;
}) {
  await expireStalePenalties();

  const buckets = await computeAttendanceBuckets(prisma);
  const penalties = await prisma.attendancePenalty.findMany({
    where: { status: { in: ["PENDING", "APPLIED"] } },
    select: {
      id: true,
      memberId: true,
      classId: true,
      status: true,
      blockedUntil: true,
      releasedCount: true,
    },
  });
  const penaltyMap = new Map(penalties.map((p) => [`${p.memberId}|${p.classId}`, p]));

  let rows = buckets.map((bucket) => {
    const penalty = penaltyMap.get(`${bucket.memberId}|${bucket.classId}`);
    return {
      ...bucket,
      activePenalty: penalty
        ? {
            id: penalty.id,
            status: penalty.status,
            blockedUntil: penalty.blockedUntil,
            releasedCount: penalty.releasedCount,
          }
        : null,
    };
  });

  const summary = {
    total: rows.length,
    ok: rows.filter((r) => r.status === "OK").length,
    warn: rows.filter((r) => r.status === "WARN").length,
    release: rows.filter((r) => r.status === "RELEASE").length,
  };

  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.classId) rows = rows.filter((r) => r.classId === query.classId);
  if (query.memberId) rows = rows.filter((r) => r.memberId === query.memberId);

  // Ưu tiên rủi ro cao trước: rate thấp nhất, rồi tới mẫu lớn hơn.
  rows.sort((a, b) => a.attendanceRate - b.attendanceRate || b.sampleSize - a.sampleSize);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const total = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);

  return { rows: paged, summary, pagination: buildPaginationMeta(total, page, limit) };
}
