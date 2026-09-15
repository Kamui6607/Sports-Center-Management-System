import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { hashPassword } from "../../utils/bcrypt.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { CreateUserInput, UpdateUserInput, UserQueryInput } from "./users.schema.js";

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  gender: true,
  dateOfBirth: true,
  role: true,
  isActive: true,
  createdAt: true,
  memberProfile: true,
  coachProfile: true,
  managerProfile: true,
};

export async function listUsers(query: UserQueryInput) {
  const currentPage = Math.max(1, parseInt(query.page ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skipVal = (currentPage - 1) * pageSize;

  const where: any = {};
  if (query.role) where.role = query.role;
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: skipVal,
      take: pageSize,
      select: userSelect,
      orderBy: { fullName: "asc" },
    }),
  ]);

  return { users, pagination: buildPaginationMeta(total, currentPage, pageSize) };
}

export async function createUser(data: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("Email is already in use", 409);

  const hashed = await hashPassword(data.password);

  const profileCreate =
    data.role === "COACH"
      ? { coachProfile: { create: {} } }
      : data.role === "MANAGER"
      ? { managerProfile: { create: {} } }
      : data.role === "MEMBER"
      ? {
          memberProfile: {
            create: {
              fitnessGoal: data.fitnessGoal,
              trainingLevel: data.trainingLevel,
              trainingPreference: data.trainingPreference,
            },
          },
        }
      : {};

  return prisma.user.create({
    data: {
      email: data.email,
      password: hashed,
      fullName: data.fullName,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      role: data.role,
      ...profileCreate,
    },
    select: userSelect,
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new AppError("User not found", 404);
  return user;
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError("User not found", 404);

  const profileUpdate =
    data.role === "COACH"
      ? { coachProfile: { upsert: { create: {}, update: {} } } }
      : data.role === "MANAGER"
      ? { managerProfile: { upsert: { create: {}, update: {} } } }
      : data.role === "MEMBER"
      ? {
          memberProfile: {
            upsert: { create: {}, update: {} },
          },
        }
      : {};

  return prisma.user.update({
    where: { id },
    data: {
      ...data,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      ...(data.role && data.role !== user.role ? profileUpdate : {}),
    },
    select: userSelect,
  });
}

export async function deactivateUser(id: string, requesterId: string) {
  if (id === requesterId) throw new AppError("Cannot deactivate your own account", 400);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError("User not found", 404);

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });
}
