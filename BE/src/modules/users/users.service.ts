import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { hashPassword } from "../../utils/bcrypt.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

import { disconnectUserSockets } from "../chat/chat.socket.js";
import type { CreateUserInput, UpdateUserInput, UserQueryInput } from "./users.schema.js";
import { ROLE_NAME_SELECT, connectRole, flattenRole } from "../../utils/roles.js";

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  gender: true,
  dateOfBirth: true,
  avatarUrl: true,
  role: ROLE_NAME_SELECT,
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
  if (query.role) where.role = { name: query.role };
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

  return { users: users.map(flattenRole), pagination: buildPaginationMeta(total, currentPage, pageSize) };
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

  // Tạo user + profile tương ứng trong cùng transaction.
  // COACH/MANAGER KHÔNG được auto-provision subscription.
  return prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        password: hashed,
        fullName: data.fullName,
        phone: data.phone,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        role: connectRole(data.role),
        ...profileCreate,
      },
      select: userSelect,
    });

    if (created.memberProfile) {
      }

    return flattenRole(created);
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new AppError("User not found", 404);
  return flattenRole(user);
}

export async function updateUser(id: string, data: UpdateUserInput, requesterId: string) {
  const found = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!found) throw new AppError("User not found", 404);
  const user = flattenRole(found);
  // Vai trò mới (nếu có) gán qua quan hệ Role, không ghi thẳng vào User.
  const { role: newRole, ...fields } = data;

  if (id === requesterId) {
    if (data.isActive === false) throw new AppError("Cannot deactivate your own account", 400);
    if (data.role && data.role !== user.role) throw new AppError("Cannot change your own role", 400);
  }

  if (user.role === "MANAGER" && (data.isActive === false || (data.role && data.role !== "MANAGER"))) {
    const activeManagers = await prisma.user.count({
      where: { role: { name: "MANAGER" }, isActive: true }
    });
    if (activeManagers <= 1) {
      throw new AppError("Cannot deactivate or demote the last active MANAGER", 400);
    }
  }

  // BR-16: 1 user 1 role - Prevent role change if active engagements exist
  if (data.role && data.role !== user.role) {
    if (user.role === "MEMBER") {
      const bookedEnrollments = await prisma.enrollment.count({
        where: { member: { userId: id }, status: "BOOKED" },
      });
      if (bookedEnrollments > 0) throw new AppError("Cannot change role: MEMBER has upcoming booked classes. Cancel them first.", 400);
    }
    
    if (user.role === "COACH") {
      const upcomingSchedules = await prisma.classSchedule.count({
        where: { 
          class: { coaches: { some: { coach: { userId: id } } } }, 
          status: "SCHEDULED", 
          startTime: { gt: new Date() } 
        }
      });
      if (upcomingSchedules > 0) throw new AppError("Cannot change role: COACH is assigned to upcoming classes.", 400);
    }
  }

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

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...fields,
      dateOfBirth: fields.dateOfBirth ? new Date(fields.dateOfBirth) : undefined,
      ...(newRole && newRole !== user.role ? { role: connectRole(newRole), ...profileUpdate } : {}),
    },
    select: userSelect,
  });

  // Socket chỉ xác thực ở handshake → ngắt ngay khi khóa tài khoản hoặc đổi role (D04).
  if (data.isActive === false || (data.role && data.role !== user.role)) {
    disconnectUserSockets(id);
  }

  return flattenRole(updated);
}

export async function deactivateUser(id: string, requesterId: string) {
  if (id === requesterId) throw new AppError("Cannot deactivate your own account", 400);

  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) throw new AppError("User not found", 404);

  if (user.role.name === "MANAGER") {
    const activeManagers = await prisma.user.count({
      where: { role: { name: "MANAGER" }, isActive: true }
    });
    if (activeManagers <= 1) {
      throw new AppError("Cannot deactivate the last active MANAGER", 400);
    }
  }

  const deactivated = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, email: true, fullName: true, role: ROLE_NAME_SELECT, isActive: true },
  });

  // Tài khoản bị khóa phải ngừng ngay mọi phiên socket đang mở (D04).
  disconnectUserSockets(id);

  return flattenRole(deactivated);
}
