import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { computeAttendanceBuckets } from "../attendance/attendance-analytics.service.js";
import { expireStalePenalties } from "../attendance/attendance-penalties.service.js";

export async function getRevenueReport(startDate: string, endDate: string) {
  // BR-26: Parse as VN business day boundaries (start of startDate, end of endDate in +07:00)
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);

  // C11 — TÁCH RÕ HAI COHORT (trước đây doanh thu theo paidAt nhưng đếm/list theo createdAt):
  //  * "cash" (paidAt): tiền THỰC THU / ĐÃ HOÀN trong kỳ → revenue, refunded, net, by-method, danh sách.
  //  * "order" (createdAt): đơn được TẠO trong kỳ nhưng CHƯA/không thu được → đếm PENDING/FAILED.
  const cashFilter = { paidAt: { gte: start, lte: end } };
  const orderFilter = { createdAt: { gte: start, lte: end } };

  const [collectedAgg, refundedAgg, pendingCount, failedCount, ordersCreated, byMethod, recentPayments, partialRefundAgg] =
    await Promise.all([
      prisma.payment.aggregate({
        where: { ...cashFilter, status: "SUCCESS" },
        _sum: { amount: true },
        _count: true,
      }),
      // Tiền đã hoàn trong kỳ — payment REFUNDED giữ `paidAt` của lần thu gốc.
      prisma.payment.aggregate({
        where: { ...cashFilter, status: "REFUNDED" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.count({ where: { ...orderFilter, status: "PENDING" } }),
      prisma.payment.count({ where: { ...orderFilter, status: "FAILED" } }),
      prisma.payment.count({ where: orderFilter }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { ...cashFilter, status: "SUCCESS" },
        _sum: { amount: true },
        _count: true,
      }),
      // Danh sách "dòng tiền" CÙNG cohort cash (SUCCESS/REFUNDED, sắp theo paidAt) — không lẫn đơn PENDING.
      prisma.payment.findMany({
        where: { ...cashFilter, status: { in: ["SUCCESS", "REFUNDED"] } },
        include: {
          member: { include: { user: { select: { fullName: true } } } },
        },
        orderBy: { paidAt: "desc" },
        take: 10,
      }),
      // Hoàn tiền TỪNG PHẦN đã duyệt trong kỳ (hủy buổi không dạy bù) — giao dịch gốc vẫn SUCCESS
      // nên chưa nằm trong refundedAgg. Hoàn cả khóa đã đổi giao dịch sang REFUNDED (tính ở refundedAgg).
      prisma.refund.aggregate({
        where: { status: "COMPLETED", processedAt: { gte: start, lte: end }, payment: { status: "SUCCESS" } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

  const methodMap: Record<string, number> = {};
  for (const m of byMethod) methodMap[m.method] = Number(m._sum.amount ?? 0);

  const totalRevenue = Number(collectedAgg._sum.amount ?? 0);
  const partialRefundedAmount = Number(partialRefundAgg._sum.amount ?? 0);
  const refundedAmount = Number(refundedAgg._sum.amount ?? 0) + partialRefundedAmount;

  return {
    /** Tiền THỰC THU trong kỳ (tổng payment SUCCESS theo `paidAt`). */
    totalRevenue,
    /** Tiền ĐÃ HOÀN trong kỳ (payment REFUNDED theo `paidAt` + hoàn từng phần đã duyệt theo `processedAt`). */
    refundedAmount,
    /** Riêng phần hoàn TỪNG PHẦN (hủy buổi không dạy bù) đã duyệt trong kỳ. */
    partialRefundedAmount,
    partialRefunds: partialRefundAgg._count,
    /** Thực nhận = totalRevenue − refundedAmount (không âm). */
    netRevenue: Math.max(0, totalRevenue - refundedAmount),
    /** Tổng số ĐƠN được tạo trong kỳ (mọi trạng thái, theo `createdAt`). */
    totalPayments: ordersCreated,
    /** Số giao dịch THU ĐƯỢC trong kỳ (cùng cohort paidAt với totalRevenue). */
    successPayments: collectedAgg._count,
    /** Số giao dịch ĐÃ HOÀN trong kỳ (cùng cohort paidAt với refundedAmount). */
    refundedPayments: refundedAgg._count,
    /** Đơn tạo trong kỳ còn chờ thanh toán (cohort createdAt). */
    pendingPayments: pendingCount,
    /** Đơn tạo trong kỳ đã đóng/thất bại (cohort createdAt). */
    failedPayments: failedCount,
    revenueByMethod: {
      CASH: methodMap["CASH"] ?? 0,
      BANK_TRANSFER: methodMap["BANK_TRANSFER"] ?? 0,
      SEPAY: methodMap["SEPAY"] ?? 0,
    },
    recentPayments,
    note:
      "totalRevenue = tiền THỰC THU trong kỳ (SUCCESS theo paidAt); refundedAmount = tiền ĐÃ HOÀN " +
      "(REFUNDED theo paidAt); netRevenue = thực nhận (gross − refunded). pendingPayments/failedPayments/" +
      "totalPayments đếm theo ĐƠN tạo trong kỳ (createdAt). refundedAmount gồm cả hoàn TỪNG PHẦN " +
      "(bảng Refund, hủy buổi không dạy bù) đã duyệt trong kỳ theo processedAt.",
  };
}

export async function getMemberReport(startDate: string, endDate: string) {
  // BR-26: VN timezone boundary
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);
  const now = new Date();

  // BR-19: đếm NGƯỜI (distinct memberId), không đếm số lần mua gói.
  const [totalMembers, newMembers, activeMemberships] = await Promise.all([
    // Count members whose user is still MEMBER role and active
    prisma.memberProfile.count({
      where: { user: { role: { name: "MEMBER" }, isActive: true } },
    }),
    prisma.memberProfile.count({
      where: {
        createdAt: { gte: start, lte: end },
        user: { role: { name: "MEMBER" }, isActive: true },
      },
    }),
    prisma.membership.findMany({
      where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gt: now } },
      select: { memberId: true, plan: { select: { name: true } } },
      orderBy: { endDate: "desc" },
    }),
  ]);

  // Mỗi người tính 1 lần, theo gói có hạn xa nhất (orderBy endDate desc ⇒ dòng đầu của mỗi người).
  const memberPlanMap: Record<string, string> = {};
  for (const m of activeMemberships) {
    if (!memberPlanMap[m.memberId]) memberPlanMap[m.memberId] = m.plan.name;
  }

  const activeCount = Object.keys(memberPlanMap).length;
  const planCounts: Record<string, number> = {};
  for (const name of Object.values(memberPlanMap)) {
    planCounts[name] = (planCounts[name] ?? 0) + 1;
  }

  return {
    totalMembers,
    newMembers,
    activeMembers: activeCount,
    expiredMembers: Math.max(0, totalMembers - activeCount),
    // Tên khóa giữ nguyên cho FE; giá trị là số người theo TÊN GÓI đang hiệu lực (không còn hạng gói).
    membersByTier: planCounts,
    note: "membersByTier counts PEOPLE by their active membership plan name (one plan per person).",
  };
}

export async function getEnrollmentReport(startDate: string, endDate: string) {
  // BR-26: VN timezone boundary
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T23:59:59.999+07:00`);
  const dateFilter = { createdAt: { gte: start, lte: end } };

  const [totalEnrollments, completedEnrollments, cancelledEnrollments, enrolledRows] = await Promise.all([
    // BR-19: Count both BOOKED and COMPLETED as "enrolled" (not just BOOKED)
    prisma.enrollment.count({ where: { ...dateFilter, status: { in: ["BOOKED", "COMPLETED"] } } }),
    prisma.enrollment.count({ where: { ...dateFilter, status: "COMPLETED" } }),
    prisma.enrollment.count({ where: { ...dateFilter, status: "CANCELLED" } }),
    // Enrollment không lưu classId — lớp lấy qua schedule.classId (groupBy không group theo quan hệ).
    prisma.enrollment.findMany({
      where: { ...dateFilter, status: { in: ["BOOKED", "COMPLETED"] } },
      select: { schedule: { select: { classId: true } } },
    }),
  ]);

  const countByClass = new Map<string, number>();
  for (const row of enrolledRows) {
    const id = row.schedule.classId;
    countByClass.set(id, (countByClass.get(id) ?? 0) + 1);
  }
  const byClassType = [...countByClass].map(([classId, count]) => ({ classId, _count: count }));
  const topClasses = [...byClassType]
    .sort((a, b) => b._count - a._count)
    .slice(0, 5)
    .map((c) => ({ classId: c.classId, _count: { classId: c._count } }));

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

  const [totalSubs, newSubs, byStatus, activeByPlan, revenueAgg] = await Promise.all([
    prisma.membership.count(),
    prisma.membership.count({ where: dateFilter }),
    prisma.membership.groupBy({ by: ["status"], _count: true }),
    // BR-19: gói đang hiệu lực hiện tại (không giới hạn theo kỳ), nhóm theo gói.
    prisma.membership.groupBy({
      by: ["planId"],
      where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gt: now } },
      _count: true,
    }),
    // BR-20: doanh thu theo paidAt — chỉ tính giao dịch MUA GÓI thành viên.
    prisma.payment.aggregate({
      where: { paidAt: { gte: start, lte: end }, status: "SUCCESS", membership: { isNot: null } },
      _sum: { amount: true },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) statusMap[s.status] = s._count;

  const plans = await prisma.membershipPlan.findMany({
    where: { id: { in: activeByPlan.map((r) => r.planId) } },
    select: { id: true, name: true },
  });
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  // Tên khóa `subscriptionsByTier` giữ nguyên cho FE; giá trị nhóm theo TÊN GÓI.
  const planMap: Record<string, number> = {};
  for (const r of activeByPlan) {
    const name = planName.get(r.planId) ?? r.planId;
    planMap[name] = (planMap[name] ?? 0) + r._count;
  }

  return {
    totalSubscriptions: totalSubs,
    newSubscriptions: newSubs,
    activeSubscriptions: statusMap["ACTIVE"] ?? 0,
    expiredSubscriptions: statusMap["EXPIRED"] ?? 0,
    cancelledSubscriptions: statusMap["CANCELLED"] ?? 0,
    suspendedSubscriptions: 0,
    subscriptionsByTier: planMap,
    totalRevenue: Number(revenueAgg._sum.amount ?? 0),
  };
}

export async function getSubscriptionLogs(startDate?: string, endDate?: string, pageStr?: string, limitStr?: string) {
  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? "20") || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.MembershipWhereInput = {};
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00+07:00`);
    const end = new Date(`${endDate}T23:59:59.999+07:00`);
    where.createdAt = { gte: start, lte: end };
  }

  const [total, subs] = await Promise.all([
    prisma.membership.count({ where }),
    prisma.membership.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        member: { include: { user: { select: { fullName: true, email: true } } } },
        plan: { select: { name: true, price: true } },
        payment: { select: { amount: true, status: true, paidAt: true } },
      },
    }),
  ]);

  const formattedLogs = subs.map((sub) => ({
    id: sub.id,
    action: "Mua / Gia hạn gói",
    username: sub.member.user.fullName,
    email: sub.member.user.email,
    planName: sub.plan.name,
    planTier: sub.plan.name,
    price: Number(sub.payment?.amount ?? sub.plan.price),
    paymentStatus: sub.payment?.status ?? "N/A",
    startDate: sub.startDate,
    endDate: sub.endDate,
    purchasedAt: sub.createdAt,
  }));

  return {
    data: formattedLogs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
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
    const penalty = penaltyMap.get(`${(bucket as any).memberId}|${bucket.classId}`);
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
