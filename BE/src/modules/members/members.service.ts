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
      avatarUrl: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
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

  const profileData: any = {};
  if (fitnessGoal !== undefined) profileData.fitnessGoal = fitnessGoal;
  if (trainingLevel !== undefined) profileData.trainingLevel = trainingLevel;
  if (trainingPreference !== undefined) profileData.trainingPreference = trainingPreference;

  // User + MemberProfile cập nhật ATOMIC (F02).
  await prisma.$transaction(async (tx) => {
    if (Object.keys(userFields).length > 0) {
      await tx.user.update({
        where: { id: memberProfile.userId },
        data: {
          ...userFields,
          dateOfBirth: userFields.dateOfBirth ? new Date(userFields.dateOfBirth) : undefined,
        },
      });
    }

    if (Object.keys(profileData).length > 0) {
      await tx.memberProfile.update({ where: { id: memberProfile.id }, data: profileData });
    }
  });

  return getMemberById(id);
}

export async function getMembershipStatus(memberId: string) {
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: memberId }, { userId: memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  const activeSub = null;
  const effectiveTier = null;
  const daysRemaining = null;

  return { effectiveTier, activeSubscription: activeSub, daysRemaining };
}
