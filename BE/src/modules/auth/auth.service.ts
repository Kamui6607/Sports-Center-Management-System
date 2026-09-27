import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { hashPassword, comparePassword } from "../../utils/bcrypt.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiryDate,
} from "../../utils/jwt.js";
import { hashToken } from "../../utils/hashToken.js";
import { removeStoredAvatar } from "../../utils/avatarStorage.js";
import { createNotification } from "../notifications/notifications.service.js";
import { ensureActiveFreeSubscription } from "../subscriptions/free-subscription.service.js";
import { disconnectUserSockets } from "../chat/chat.socket.js";
import type { RegisterInput, UpdateProfileInput } from "./auth.schema.js";

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("Email is already in use", 409);

  const hashed = await hashPassword(data.password);

  // Tạo user + MemberProfile + subscription FREE ACTIVE trong CÙNG transaction:
  // mọi MEMBER mới luôn có gói ACTIVE (tier FREE, maxConcurrentClasses = 0), không rơi vào
  // trạng thái "không có subscription". Idempotent: đã có ACTIVE subscription thì không tạo thêm.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
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

    if (created.memberProfile) {
      await ensureActiveFreeSubscription(tx, created.memberProfile.id);
    }

    return created;
  });

  // Gửi thông báo chào mừng (fire-and-forget, không block response)
  createNotification(
    user.id,
    "MEMBER_REGISTERED",
    "Chào mừng đến với Trung tâm Thể thao!",
    `Xin chào ${user.fullName}! Tài khoản của bạn đã được tạo thành công. Hãy khám phá các gói tập và lớp học phù hợp với bạn.`
  ).catch(() => {}); // Không để lỗi notification phá vỡ response đăng ký

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

  // BR-27: Store hash of refresh token, not the raw token
  await prisma.refreshToken.create({
    data: {
      token: hashToken(refreshToken),
      userId: user.id,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

export async function logout(token: string) {
  const tokenHash = hashToken(token);
  const existing = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
  if (!existing) throw new AppError("Refresh token not found", 404);

  await prisma.refreshToken.update({
    where: { token: tokenHash },
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

  const tokenHash = hashToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
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
      avatarUrl: true,
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

  const profileData: Record<string, unknown> = {};
  if (fitnessGoal !== undefined) profileData.fitnessGoal = fitnessGoal;
  if (trainingLevel !== undefined) profileData.trainingLevel = trainingLevel;
  if (trainingPreference !== undefined) profileData.trainingPreference = trainingPreference;

  // User + profile phải cập nhật ATOMIC: lỗi giữa chừng không để dữ liệu nửa vời (F02).
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...userFields,
        dateOfBirth: userFields.dateOfBirth ? new Date(userFields.dateOfBirth) : undefined,
      },
    });

    if (user.role === "MEMBER" && Object.keys(profileData).length > 0) {
      await tx.memberProfile.update({ where: { userId }, data: profileData });
    }
  });

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
  // Đổi mật khẩu (đặc biệt khi nghi lộ tài khoản) phải thu hồi MỌI refresh token cũ —
  // nếu không thiết bị khác vẫn refresh được access token mới.
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);

  // Đồng thời ngắt socket đang mở (handshake chỉ xác thực một lần).
  disconnectUserSockets(userId);
}

/**
 * Cập nhật avatar cho user. `avatarUrl` do controller lấy từ utils/avatarStorage
 * (local `uploads/avatars/...` hoặc Cloudinary), sau đó trả về profile đầy đủ như `GET /auth/me`.
 */
export async function updateAvatar(userId: string, avatarUrl: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (!user) throw new AppError("User not found", 404);

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });

  // Dọn avatar cũ sau khi DB update thành công. Với Cloudinary, `public_id` cố định theo user
  // nên upload mới đã ghi đè asset cũ — không cần (và không được) xoá (xem utils/avatarStorage.ts).
  removeStoredAvatar(user.avatarUrl);

  return getMe(userId);
}
