import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { UpdateMemberInput, MemberQueryInput } from "./members.schema.js";

const memberInclude = {
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  },
};

/** Lượt mua khóa học đang hiệu lực (ACTIVE, còn hạn) của member — thay cho subscription ACTIVE cũ. */
const activePurchaseInclude = {
  where: {
    status: "ACTIVE" as const,
    startDate: { lte: new Date() },
    OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
  },
  orderBy: { createdAt: "desc" as const },
  include: {
    class: { select: { id: true, name: true, price: true, durationDays: true } },
    coach: { include: { user: { select: { id: true, fullName: true } } } },
  },
};

export async function listMembers(query: MemberQueryInput) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.trainingLevel) where.trainingLevel = query.trainingLevel;
  if (query.search) {
    where.user = {
      role: "MEMBER",
      OR: [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    };
  } else {
    where.user = { role: "MEMBER" };
  }

  const [total, members] = await Promise.all([
    prisma.memberProfile.count({ where }),
    prisma.memberProfile.findMany({
      where,
      skip,
      take: limit,
      include: {
        ...memberInclude,
        coursePurchases: activePurchaseInclude,
      },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);

  return { members, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getMemberById(id: string) {
  const memberProfile = await prisma.memberProfile.findFirst({
    where: {
      OR: [{ id }, { userId: id }],
      user: { role: "MEMBER" },
    },
    include: {
      ...memberInclude,
      coursePurchases: activePurchaseInclude,
    },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);
  return memberProfile;
}

export async function updateMember(id: string, data: UpdateMemberInput) {
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id }, { userId: id }], user: { role: "MEMBER" } },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  const { fitnessGoal, trainingLevel, trainingPreference, ...userFields } = data;

  if (Object.keys(userFields).length > 0) {
    await prisma.user.update({
      where: { id: memberProfile.userId },
      data: {
        ...userFields,
        dateOfBirth: userFields.dateOfBirth ? new Date(userFields.dateOfBirth) : undefined,
      },
    });
  }

  const profileData: any = {};
  if (fitnessGoal !== undefined) profileData.fitnessGoal = fitnessGoal;
  if (trainingLevel !== undefined) profileData.trainingLevel = trainingLevel;
  if (trainingPreference !== undefined) profileData.trainingPreference = trainingPreference;
  if (Object.keys(profileData).length > 0) {
    await prisma.memberProfile.update({ where: { id: memberProfile.id }, data: profileData });
  }

  return getMemberById(id);
}

/**
 * Tình trạng khóa học của member (thay cho `getMembershipStatus` cũ):
 * danh sách khóa học đang sở hữu (ACTIVE + còn hạn) kèm số ngày còn lại,
 * tổng số lượt mua và tổng tiền đã chi.
 */
export async function getCourseStatus(memberId: string) {
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: memberId }, { userId: memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  const now = new Date();
  const [activePurchases, totals] = await Promise.all([
    prisma.coursePurchase.findMany({
      where: {
        memberId: memberProfile.id,
        status: "ACTIVE",
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        class: { select: { id: true, name: true, price: true, durationDays: true } },
        coach: { include: { user: { select: { id: true, fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.coursePurchase.aggregate({
      where: { memberId: memberProfile.id, status: { not: "CANCELLED" } },
      _sum: { price: true },
      _count: true,
    }),
  ]);

  return {
    memberId: memberProfile.id,
    activeCourseCount: activePurchases.length,
    activeCourses: activePurchases.map((p) => ({
      purchaseId: p.id,
      classId: p.classId,
      className: p.class.name,
      coachId: p.coachId,
      coachName: p.coach?.user.fullName ?? null,
      price: Number(p.price),
      startDate: p.startDate,
      endDate: p.endDate,
      /** null = khóa không giới hạn thời hạn. */
      daysRemaining: p.endDate
        ? Math.max(0, Math.ceil((p.endDate.getTime() - now.getTime()) / 86_400_000))
        : null,
    })),
    totalPurchases: totals._count,
    totalSpent: Number(totals._sum.price ?? 0),
  };
}
