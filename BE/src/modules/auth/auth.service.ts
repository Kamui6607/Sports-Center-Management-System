import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { hashPassword, comparePassword } from "../../utils/bcrypt.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiryDate,
} from "../../utils/jwt.js";
import type { RegisterInput, UpdateProfileInput } from "./auth.schema.js";

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("Email is already in use", 409);

  const hashed = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashed,
      fullName: data.fullName,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      role: "MEMBER",
      memberProfile: { create: {} },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      role: true,
      isActive: true,
      memberProfile: true,
    },
  });

  return user;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError("Invalid email or password", 401);
  if (!user.isActive) throw new AppError("Your account has been deactivated", 403);

  const valid = await comparePassword(password, user.password);
  if (!valid) throw new AppError("Invalid email or password", 401);

  const payload = { id: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

export async function logout(token: string) {
  const existing = await prisma.refreshToken.findUnique({ where: { token } });
  if (!existing) throw new AppError("Refresh token not found", 404);

  await prisma.refreshToken.update({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function refreshAccessToken(token: string) {
  let payload: { id: string; role: string };
  try {
    payload = verifyRefreshToken(token) as { id: string; role: string };
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored) throw new AppError("Refresh token not found", 401);
  if (stored.revokedAt) throw new AppError("Refresh token has been revoked", 401);
  if (stored.expiresAt < new Date()) throw new AppError("Refresh token has expired", 401);

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || !user.isActive) throw new AppError("User not found or inactive", 401);

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  return { accessToken };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
      memberProfile: true,
      coachProfile: true,
      managerProfile: true,
    },
  });
  if (!user) throw new AppError("User not found", 404);
  return user;
}

export async function updateMe(userId: string, data: UpdateProfileInput) {
  const { fitnessGoal, trainingLevel, trainingPreference, ...userFields } = data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...userFields,
      dateOfBirth: userFields.dateOfBirth ? new Date(userFields.dateOfBirth) : undefined,
    },
  });

  if (user.role === "MEMBER") {
    const profileData: Record<string, unknown> = {};
    if (fitnessGoal !== undefined) profileData.fitnessGoal = fitnessGoal;
    if (trainingLevel !== undefined) profileData.trainingLevel = trainingLevel;
    if (trainingPreference !== undefined) profileData.trainingPreference = trainingPreference;
    if (Object.keys(profileData).length > 0) {
      await prisma.memberProfile.update({ where: { userId }, data: profileData });
    }
  }

  return getMe(userId);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const valid = await comparePassword(currentPassword, user.password);
  if (!valid) throw new AppError("Current password is incorrect", 400);

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
}
