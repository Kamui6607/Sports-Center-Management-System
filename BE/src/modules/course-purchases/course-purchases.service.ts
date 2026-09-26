import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { COURSE_COMMISSION_RATE, splitCoursePrice } from "../../config/commission.js";
import { createNotification } from "../notifications/notifications.service.js";
import type {
  PurchaseCourseInput,
  CoursePurchaseQueryInput,
  UpdateCoursePurchaseStatusInput,
} from "./course-purchases.schema.js";

type Actor = { id: string; role: string };

const purchaseInclude = {
  member: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } },
  class: {
    include: {
      sports: true,
      ownerCoach: { include: { user: { select: { id: true, fullName: true, email: true } } } },
    },
  },
  coach: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  payments: true,
};

function daysRemaining(endDate: Date | null, now: Date = new Date()): number | null {
  if (!endDate) return null;
  return Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000));
}

/** Lượt mua hết hạn nhưng còn ACTIVE → đánh dấu EXPIRED (housekeeping, chạy trước khi đọc dữ liệu). */
export async function expireStalePurchases(memberProfileId?: string) {
  return prisma.coursePurchase.updateMany({
    where: {
      status: "ACTIVE",
      endDate: { lt: new Date() },
      ...(memberProfileId ? { memberId: memberProfileId } : {}),
    },
    data: { status: "EXPIRED" },
  });
}

/**
 * Member mua khóa học (MANAGER có thể mua hộ một member).
 *
 * Luồng: tạo CoursePurchase + Payment SUCCESS + Invoice trong CÙNG transaction.
 * - Member trả ĐÚNG giá niêm yết `Class.price` (mô hình hoa hồng khấu trừ).
 * - Nền tảng giữ 15% (`commissionAmount`), Coach sở hữu khóa học nhận 85% (`coachEarning`).
 * - `endDate = startDate + Class.durationDays`, `null` khi khóa không giới hạn thời hạn.
 * - Mỗi member chỉ giữ 1 lượt ACTIVE cho mỗi khóa (mua lại khi lượt cũ hết hạn/bị hủy).
 */
export async function purchaseCourse(data: PurchaseCourseInput, actor: Actor) {
  // 1. Resolve member: MEMBER tự mua; MANAGER mua hộ theo memberId (userId hoặc profileId).
  let memberProfile;
  if (actor.role === "MEMBER") {
    memberProfile = await prisma.memberProfile.findUnique({
      where: { userId: actor.id },
      include: { user: true },
    });
  } else if (!data.memberId) {
    throw new AppError("memberId is required when a MANAGER purchases on behalf of a member", 400);
  } else {
    memberProfile = await prisma.memberProfile.findFirst({
      where: { OR: [{ id: data.memberId }, { userId: data.memberId }] },
      include: { user: true },
    });
  }

  if (!memberProfile) throw new AppError("Member not found", 404);
  if (!memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot purchase: user is not an active MEMBER", 400);
  }

  // 2. Khóa học phải tồn tại và đang mở bán.
  const course = await prisma.class.findUnique({
    where: { id: data.classId },
    include: { ownerCoach: true },
  });
  if (!course) throw new AppError("Course (class) not found", 404);
  if (!course.isActive) throw new AppError("Khóa học hiện không mở bán", 400);

  await expireStalePurchases(memberProfile.id);

  const existingActive = await prisma.coursePurchase.findFirst({
    where: { memberId: memberProfile.id, classId: course.id, status: "ACTIVE" },
  });
  if (existingActive) throw new AppError("Bạn đã sở hữu khóa học này.", 409);

  // 3. Tách giá: Member trả giá niêm yết; nền tảng 15%; Coach 85%.
  const { price, commissionAmount, coachEarning } = splitCoursePrice(Number(course.price));
  const startDate = new Date();
  const endDate = course.durationDays
    ? new Date(startDate.getTime() + course.durationDays * 86_400_000)
    : null;

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.coursePurchase.create({
      data: {
        memberId: memberProfile.id,
        classId: course.id,
        coachId: course.ownerCoachId,
        price,
        commissionRate: COURSE_COMMISSION_RATE,
        commissionAmount,
        coachEarning,
        startDate,
        endDate,
        status: "ACTIVE",
      },
      include: purchaseInclude,
    });

    const payment = await tx.payment.create({
      data: {
        memberId: memberProfile.id,
        coursePurchaseId: created.id,
        amount: price,
        method: data.method,
        status: "SUCCESS",
        note: data.note,
        transactionCode: data.transactionCode,
        paidAt: new Date(),
        createdById: actor.id,
      },
    });

    // BR-25: hoá đơn snapshot người trả + khóa học tại thời điểm phát hành.
    await tx.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        memberId: memberProfile.id,
        paymentId: payment.id,
        subtotal: price,
        discount: 0,
        total: price,
        status: "ISSUED",
        issuedAt: new Date(),
        memberName: memberProfile.user.fullName,
        courseName: course.name,
      },
    });

    return created;
  });

  // Thông báo cho member + Coach sở hữu khóa (fire-and-forget).
  createNotification(
    memberProfile.userId,
    "COURSE_PURCHASED",
    `Mua khóa học thành công: ${course.name}`,
    `Bạn đã mua khóa học "${course.name}". Hãy đặt lịch các buổi học ngay bây giờ!`
  ).catch(() => {});

  if (purchase.coach) {
    createNotification(
      purchase.coach.userId,
      "COURSE_SOLD",
      `Khóa học của bạn có học viên mới: ${course.name}`,
      `Học viên ${memberProfile.user.fullName} đã mua khóa học "${course.name}" của bạn. Bạn nhận được ${coachEarning.toLocaleString("vi-VN")}đ (sau 15% hoa hồng nền tảng).`,
      { metadata: { coursePurchaseId: purchase.id, classId: course.id } }
    ).catch(() => {});
  }

  return purchase;
}

// ─── Đọc dữ liệu ───────────────────────────────────────────────────────────

function paginate(query: CoursePurchaseQueryInput) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  return { page, limit, skip: (page - 1) * limit };
}

/** MANAGER: toàn bộ lượt mua khóa học + tổng hợp doanh thu/hoa hồng theo bộ lọc. */
export async function listPurchases(query: CoursePurchaseQueryInput) {
  await expireStalePurchases();
  const { page, limit, skip } = paginate(query);

  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.classId) where.classId = query.classId;
  if (query.coachId) where.coachId = query.coachId;
  if (query.memberId) {
    where.member = { OR: [{ id: query.memberId }, { userId: query.memberId }] };
  }

  const [total, purchases, summary] = await Promise.all([
    prisma.coursePurchase.count({ where }),
    prisma.coursePurchase.findMany({
      where, skip, take: limit,
      include: purchaseInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.coursePurchase.aggregate({
      where: { ...where, status: "ACTIVE" },
      _sum: { price: true, commissionAmount: true, coachEarning: true },
      _count: true,
    }),
  ]);

  return {
    purchases,
    summary: {
      activePurchases: summary._count,
      grossRevenue: Number(summary._sum.price ?? 0),
      platformCommission: Number(summary._sum.commissionAmount ?? 0),
      coachEarnings: Number(summary._sum.coachEarning ?? 0),
      commissionRate: COURSE_COMMISSION_RATE,
    },
    pagination: buildPaginationMeta(total, page, limit),
  };
}

/** MEMBER: danh sách khóa học đã mua của chính mình (kèm số ngày còn lại). */
export async function getMyPurchases(userId: string, query: CoursePurchaseQueryInput) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);
  await expireStalePurchases(memberProfile.id);

  const { page, limit, skip } = paginate(query);
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;
  if (query.classId) where.classId = query.classId;

  const [total, purchases] = await Promise.all([
    prisma.coursePurchase.count({ where }),
    prisma.coursePurchase.findMany({
      where, skip, take: limit,
      include: purchaseInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    purchases: purchases.map((p) => ({ ...p, daysRemaining: daysRemaining(p.endDate) })),
    pagination: buildPaginationMeta(total, page, limit),
  };
}

/** COACH: các lượt mua của khóa do mình sở hữu + tổng thu nhập (sau hoa hồng nền tảng). */
export async function listMySales(userId: string, query: CoursePurchaseQueryInput) {
  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId } });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);
  await expireStalePurchases();

  const { page, limit, skip } = paginate(query);
  const where: any = { coachId: coachProfile.id };
  if (query.status) where.status = query.status;
  if (query.classId) where.classId = query.classId;

  const [total, purchases, summary] = await Promise.all([
    prisma.coursePurchase.count({ where }),
    prisma.coursePurchase.findMany({
      where, skip, take: limit,
      include: purchaseInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.coursePurchase.aggregate({
      where: { ...where, status: "ACTIVE" },
      _sum: { price: true, commissionAmount: true, coachEarning: true },
      _count: true,
    }),
  ]);

  return {
    purchases,
    summary: {
      activeSales: summary._count,
      grossRevenue: Number(summary._sum.price ?? 0),
      platformCommission: Number(summary._sum.commissionAmount ?? 0),
      coachEarning: Number(summary._sum.coachEarning ?? 0),
      commissionRate: COURSE_COMMISSION_RATE,
    },
    pagination: buildPaginationMeta(total, page, limit),
  };
}

// ─── Chi tiết / hủy / đổi trạng thái ───────────────────────────────────────

/** Chi tiết lượt mua — MEMBER xem lượt của mình, COACH xem lượt thuộc khóa của mình. */
export async function getPurchaseById(id: string, actor: Actor) {
  await expireStalePurchases();
  const purchase = await prisma.coursePurchase.findUnique({
    where: { id },
    include: purchaseInclude,
  });
  if (!purchase) throw new AppError("Course purchase not found", 404);

  if (actor.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: actor.id } });
    if (!memberProfile || purchase.memberId !== memberProfile.id) {
      throw new AppError("Forbidden: this is not your purchase", 403);
    }
  } else if (actor.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
    if (!coachProfile || purchase.coachId !== coachProfile.id) {
      throw new AppError("Forbidden: this purchase is not for your course", 403);
    }
  }

  return { ...purchase, daysRemaining: daysRemaining(purchase.endDate) };
}

/**
 * Hủy lượt mua khóa học: MEMBER tự hủy lượt của mình, MANAGER hủy bất kỳ.
 *
 * Hiệu lực: lượt mua → CANCELLED; toàn bộ buổi học TƯƠNG LAI của member trong khóa đó
 * (Enrollment BOOKED) bị CANCELLED để nhả chỗ. Hoàn tiền do MANAGER chủ động xử lý
 * qua `PATCH /payments/:id/status` (REFUNDED) nên không tự động hoàn ở đây.
 */
export async function cancelPurchase(id: string, actor: Actor, reason?: string) {
  const purchase = await prisma.coursePurchase.findUnique({
    where: { id },
    include: { member: { include: { user: true } }, class: true },
  });
  if (!purchase) throw new AppError("Course purchase not found", 404);

  if (actor.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: actor.id } });
    if (!memberProfile || purchase.memberId !== memberProfile.id) {
      throw new AppError("Forbidden: this is not your purchase", 403);
    }
  } else if (actor.role !== "MANAGER") {
    throw new AppError("Forbidden: only the owning member or a MANAGER can cancel a purchase", 403);
  }

  if (purchase.status === "CANCELLED") {
    throw new AppError("Lượt mua khóa học này đã bị hủy trước đó", 400);
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.coursePurchase.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: now },
      include: purchaseInclude,
    });

    const released = await tx.enrollment.updateMany({
      where: {
        memberId: purchase.memberId,
        classId: purchase.classId,
        status: "BOOKED",
        schedule: { startTime: { gt: now } },
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    return { updated, releasedCount: released.count };
  });

  createNotification(
    purchase.member.userId,
    "COURSE_CANCELLED",
    `Đã hủy lượt mua khóa học: ${purchase.class.name}`,
    `Lượt mua khóa học "${purchase.class.name}" đã được hủy${reason ? ` (lý do: ${reason})` : ""}. ` +
      `${result.releasedCount} buổi học sắp tới đã được giải phóng. Việc hoàn tiền (nếu có) sẽ do trung tâm xử lý.`
  ).catch(() => {});

  return {
    ...result.updated,
    daysRemaining: daysRemaining(result.updated.endDate),
    releasedEnrollments: result.releasedCount,
  };
}

/**
 * MANAGER đổi trạng thái lượt mua: ACTIVE (kích hoạt lại) / EXPIRED / CANCELLED.
 * Hủy qua đây dùng chung luồng với `cancelPurchase` để luôn nhả buổi học tương lai.
 */
export async function updatePurchaseStatus(id: string, data: UpdateCoursePurchaseStatusInput) {
  const purchase = await prisma.coursePurchase.findUnique({ where: { id }, include: { member: true } });
  if (!purchase) throw new AppError("Course purchase not found", 404);

  if (data.status === "CANCELLED") {
    if (purchase.status === "CANCELLED") return getPurchaseById(id, { id: "", role: "MANAGER" });
    return cancelPurchase(id, { id: "", role: "MANAGER" }, data.reason);
  }

  if (purchase.status === data.status) {
    return getPurchaseById(id, { id: "", role: "MANAGER" });
  }

  const updated = await prisma.coursePurchase.update({
    where: { id },
    data: { status: data.status, cancelledAt: null },
    include: purchaseInclude,
  });

  createNotification(
    purchase.member.userId,
    "GENERAL",
    `Lượt mua khóa học đã được cập nhật`,
    `Lượt mua khóa học "${updated.class.name}" của bạn đã được chuyển sang trạng thái ${data.status}.`
  ).catch(() => {});

  return { ...updated, daysRemaining: daysRemaining(updated.endDate) };
}


