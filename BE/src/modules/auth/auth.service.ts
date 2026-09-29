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
import { disconnectUserSockets } from "../chat/chat.socket.js";
import { env } from "../../config/env.js";
import jwt from "jsonwebtoken";
import { sendResetPasswordEmail } from "../../utils/mail.js";
import type { RegisterInput, UpdateProfileInput, ForgotPasswordInput, ResetPasswordInput } from "./auth.schema.js";

export async function forgotPassword(data: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw new AppError("If email exists, a reset link was generated", 200);

  // Secret is unique to the current password. If they change it, token becomes invalid.
  const secret = env.JWT_ACCESS_SECRET + user.password;
  const token = jwt.sign({ email: user.email, id: user.id }, secret, { expiresIn: "15m" });

  const resetLink = `http://localhost:3000/reset-password?token=${token}`;
  
  // Gửi mail (sẽ tự skip nếu chưa có cấu hình SMTP)
  await sendResetPasswordEmail(user.email, resetLink).catch(err => {
    console.error("[MAIL ERROR] Failed to send reset email:", err);
  });
  
  return { message: "Reset link generated (check email or response for testing)", resetLink, token };
}

export async function resetPassword(data: ResetPasswordInput) {
  // We need the user to get their password hash to verify the token
  const decoded = jwt.decode(data.token) as { id: string } | null;
  if (!decoded || !decoded.id) throw new AppError("Invalid or expired token", 400);

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) throw new AppError("Invalid or expired token", 400);

  const secret = env.JWT_ACCESS_SECRET + user.password;
  try {
    jwt.verify(data.token, secret);
  } catch {
    throw new AppError("Invalid or expired token", 400);
  }

  const hashed = await hashPassword(data.newPassword);
  
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);
  
  disconnectUserSockets(user.id);
  return { message: "Password reset successfully" };
}

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("Email is already in use", 409);

  const hashed = await hashPassword(data.password);
  const role = data.role ?? "MEMBER";

  // Tạo user + profile tương ứng trong CÙNG transaction.
  // MEMBER → MemberProfile; COACH → CoachProfile (chờ Manager duyệt class sau).
  const user = await prisma.$transaction(async (tx) => {
    const profileCreate =
      role === "COACH"
        ? { coachProfile: { create: {} } }
        : { memberProfile: { create: {} } };

    const created = await tx.user.create({
      data: {
        email: data.email,
        password: hashed,
        fullName: data.fullName,
        phone: data.phone,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        role,
        isActive: role === "COACH" ? false : true,
        ...profileCreate,
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
        coachProfile: true,
      },
    });

    return created;
  });

  // Gửi thông báo chào mừng (fire-and-forget, không block response)
  const welcomeBody =
    role === "COACH"
      ? `Xin chào ${user.fullName}! Tài khoản Coach của bạn đã được tạo. Hãy nộp CV (PDF) để Manager xét duyệt và kích hoạt tài khoản.`
      : `Xin chào ${user.fullName}! Tài khoản của bạn đã được tạo thành công. Hãy khám phá các khóa học phù hợp với bạn.`;

  createNotification(
    user.id,
    "MEMBER_REGISTERED",
    "Chào mừng đến với Trung tâm Thể thao!",
    welcomeBody
  ).catch(() => {});

  // Với COACH: cấp accessToken ngay dù isActive=false,
  // để FE dùng token này gọi POST /coaches/me/cv upload CV ngay sau đăng ký.
  // Token chỉ được dùng ở endpoint có `authenticateIncludingInactive`.
  if (role === "COACH") {
    const accessToken = signAccessToken({ id: user.id, role: user.role });
    return { ...user, accessToken, requireCvUpload: true };
  }

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
