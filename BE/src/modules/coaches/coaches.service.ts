import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { CoachQueryInput, UpdateCoachInput } from "./coaches.schema.js";

export async function listCoaches(query: CoachQueryInput) {
  const { search, specialization } = query;
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    role: "COACH",
    isActive: true,
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(specialization && {
      coachProfile: {
        specialization: { contains: specialization, mode: "insensitive" },
      },
    }),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        gender: true,
        dateOfBirth: true,
        role: true,
        isActive: true,
        coachProfile: true,
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const pagination = buildPaginationMeta(total, page, limit);
  return { coaches: users, pagination };
}

export async function getCoachById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, role: "COACH" },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      role: true,
      isActive: true,
      coachProfile: {
        include: {
          classes: {
            include: {
              class: {
                include: {
                  sport: true,
                  schedules: {
                    where: { status: "SCHEDULED" },
                    take: 5,
                    orderBy: { startTime: "asc" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError("Coach not found", 404);
  }

  return user;
}

export async function updateCoach(id: string, data: UpdateCoachInput) {
  const coachProfile = await prisma.coachProfile.findFirst({
    where: { user: { id, role: "COACH" } },
  });

  if (!coachProfile) {
    throw new AppError("Coach not found", 404);
  }

  const { fullName, phone, gender, dateOfBirth, ...profileData } = data;
  const userFields: any = {};
  if (fullName !== undefined) userFields.fullName = fullName;
  if (phone !== undefined) userFields.phone = phone;
  if (gender !== undefined) userFields.gender = gender;
  if (dateOfBirth !== undefined) userFields.dateOfBirth = dateOfBirth;

  if (Object.keys(userFields).length > 0) {
    await prisma.user.update({
      where: { id },
      data: {
        ...userFields,
        dateOfBirth: userFields.dateOfBirth ? new Date(userFields.dateOfBirth) : undefined,
      },
    });
  }

  const updated = await prisma.coachProfile.update({
    where: { id: coachProfile.id },
    data: {
      ...(profileData.specialization !== undefined && { specialization: profileData.specialization }),
      ...(profileData.experienceYears !== undefined && { experienceYears: profileData.experienceYears }),
      ...(profileData.bio !== undefined && { bio: profileData.bio }),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          gender: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  return updated;
}
