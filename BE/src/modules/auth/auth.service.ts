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
import { removeStoredAvatar } from "../../utils/storage.js";
import { createNotification } from "../notifications/notifications.service.js";
import { disconnectUserSockets } from "../chat/chat.socket.js";
import { env } from "../../config/env.js";
import jwt from "jsonwebtoken";
import { buildResetPasswordEmail } from "../../utils/mail.js";
import { enqueueEmail, flushNotificationOutbox } from "../notifications/outbox.service.js";
import type { RegisterInput, UpdateProfileInput, ForgotPasswordInput, ResetPasswordInput } from "./auth.schema.js";
import { ROLE_NAME_SELECT, connectRole, flattenRole } from "../../utils/roles.js";
import { COACH_PROFILE_WITH_CERT, isRestrictedCoach, withUserCvFields } from "../../utils/certification.js";
import { randomBytes, randomInt } from "crypto";

// ── Quên / đặt lại mật khẩu (OTP 6 số cho Mobile + liên kết cho Web) ────────────────

/** Thông điệp DUY NHẤT cho forgot-password — không tiết lộ email có tồn tại hay không. */
export const FORGOT_PASSWORD_MESSAGE =
  "Nếu email đã được đăng ký, mã xác nhận và liên kết đặt lại mật khẩu đã được gửi tới email của bạn.";
export const OTP_INVALID_MESSAGE =
  "Mã xác nhận không đúng hoặc đã hết hạn. Nếu đã nhập sai nhiều lần, vui lòng yêu cầu mã mới.";
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 15 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Hash giả để so sánh khi không có user — giữ thời gian phản hồi tương đương (chống dò email). */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

/**
 * Luôn trả cùng một kết quả (HTTP 200, `success:true`) dù email có tồn tại hay không.
 * Email tồn tại: sinh OTP 6 số (lưu HASH, hết hạn 15 phút) + liên kết JWT cho Web trong CÙNG email.
 * Gửi lại trong vòng 60 giây ⇒ bỏ qua (không sinh mã mới) nhưng vẫn trả thông điệp chung.
 */
export async function forgotPassword(data: ForgotPasswordInput) {
  const result = {
    message: FORGOT_PASSWORD_MESSAGE,
    otpLength: OTP_LENGTH,
    expiresInSeconds: OTP_TTL_SECONDS,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, password: true, passwordResetOtp: true },
  });
  const now = new Date();
  const existing = user?.passwordResetOtp;
  const coolingDown =
    !!existing &&
    !existing.consumedAt &&
    now.getTime() - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000;

  if (!user || coolingDown) {
    await comparePassword(generateOtp(), await getDummyHash());
    return result;
  }

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  await prisma.passwordResetOtp.upsert({
    where: { userId: user.id },
    create: { userId: user.id, otpHash, expiresAt, lastSentAt: now },
    update: { otpHash, expiresAt, lastSentAt: now, attempts: 0, consumedAt: null },
  });

  // Liên kết cho Web (giữ nguyên cơ chế cũ): secret gắn với mật khẩu hiện tại ⇒ đổi mật khẩu là link chết.
  const secret = env.JWT_ACCESS_SECRET + user.password;
  const token = jwt.sign({ email: user.email, id: user.id }, secret, { expiresIn: "15m" });
  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  // Đưa email vào OUTBOX: lỗi mạng/nhà cung cấp mail không làm hỏng request, worker sẽ retry.
  const { subject, html } = buildResetPasswordEmail(resetLink, otp);
  await enqueueEmail(prisma, { userId: user.id, to: user.email, subject, html, type: "EMAIL_RESET_PASSWORD" });
  void flushNotificationOutbox().catch((err) => console.error("[OUTBOX] flush error:", err));

  return result;
}

async function finishPasswordReset(userId: string, newPassword: string) {
  const hashed = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
    // Mật khẩu đổi ⇒ thu hồi MỌI phiên + vô hiệu OTP còn lại.
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.passwordResetOtp.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } }),
  ]);
  disconnectUserSockets(userId);
  return { message: "Password reset successfully" };
}

/**
 * Đặt lại mật khẩu bằng MỘT trong hai cách:
 * - `{ token, newPassword }` — liên kết trong email (Web, giữ nguyên).
 * - `{ email, otp, newPassword }` — mã 6 số (Mobile). Mỗi lần thử (kể cả đúng) tăng `attempts`
 *   TRƯỚC khi so sánh (compare-and-set) ⇒ không vượt quá 5 lần sai kể cả khi gửi song song.
 *   Mọi lỗi (email không tồn tại / sai / hết hạn / quá số lần) trả CÙNG một thông điệp.
 */
export async function resetPassword(data: ResetPasswordInput) {
  if (data.token) return resetPasswordWithToken(data.token, data.newPassword);

  const invalid = () => new AppError(OTP_INVALID_MESSAGE, 400, { code: "OTP_INVALID" });
  const otp = data.otp ?? "";
  const user = await prisma.user.findUnique({
    where: { email: data.email ?? "" },
    select: { id: true, passwordResetOtp: true },
  });
  const record = user?.passwordResetOtp;
  const now = new Date();
  if (!user || !record || record.consumedAt || record.expiresAt <= now || record.attempts >= OTP_MAX_ATTEMPTS) {
    await comparePassword(otp, await getDummyHash());
    throw invalid();
  }

  const claimed = await prisma.passwordResetOtp.updateMany({
    where: { id: record.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS }, expiresAt: { gt: now } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) throw invalid();

  if (!(await comparePassword(otp, record.otpHash))) throw invalid();

  return finishPasswordReset(user.id, data.newPassword);
}

async function resetPasswordWithToken(token: string, newPassword: string) {
  // We need the user to get their password hash to verify the token
  const decoded = jwt.decode(token) as { id: string } | null;
  if (!decoded || !decoded.id) throw new AppError("Invalid or expired token", 400);

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) throw new AppError("Invalid or expired token", 400);

  const secret = env.JWT_ACCESS_SECRET + user.password;
  try {
    jwt.verify(token, secret);
  } catch {
    throw new AppError("Invalid or expired token", 400);
  }

  return finishPasswordReset(user.id, newPassword);
}

// ── Phiên đăng nhập ──────────────────────────────────────────────────────────

/** Cấp access + refresh token (lưu HASH refresh token — BR-27). */
async function issueSession(user: { id: string; role: string }) {
  const payload = { id: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await prisma.refreshToken.create({
    data: { token: hashToken(refreshToken), userId: user.id, expiresAt: getRefreshTokenExpiryDate() },
  });
  return { accessToken, refreshToken };
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
        role: connectRole(role),
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
        role: ROLE_NAME_SELECT,
        isActive: true,
        memberProfile: true,
        coachProfile: COACH_PROFILE_WITH_CERT,
      },
    });

    return withUserCvFields(flattenRole(created));
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

  // Với COACH: cấp phiên giới hạn ngay dù isActive=false (BE-9: kèm refresh token) để nộp CV.
  // Token chỉ dùng được ở endpoint hồ sơ/CV (`authenticateRestricted`).
  if (role === "COACH") {
    const tokens = await issueSession({ id: user.id, role: user.role });
    return { ...user, ...tokens, restricted: true, requireCvUpload: true };
  }

  return user;
}


/**
 * Thứ tự kiểm tra (chống dò tài khoản): MẬT KHẨU trước — email không tồn tại hoặc sai mật khẩu đều
 * trả 401 cùng thông điệp. Chỉ khi mật khẩu đúng mới xét `isActive`:
 * - Coach chưa được duyệt CV ⇒ đăng nhập "phiên giới hạn" (`restricted: true`, BE-9).
 * - Tài khoản bị khóa khác ⇒ 403 như cũ.
 */
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true, coachProfile: { select: { certification: { select: { status: true } } } } },
  });
  const valid = await comparePassword(password, user?.password ?? (await getDummyHash()));
  if (!user || !valid) throw new AppError("Invalid email or password", 401);

  const restricted = isRestrictedCoach(user);
  if (!user.isActive && !restricted) throw new AppError("Your account has been deactivated", 403);

  const tokens = await issueSession({ id: user.id, role: user.role.name });
  return { ...tokens, restricted };
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

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    include: { role: true, coachProfile: { select: { certification: { select: { status: true } } } } },
  });
  // BE-9: Coach chưa duyệt vẫn được làm mới token (phiên giới hạn).
  if (!user || (!user.isActive && !isRestrictedCoach(user))) {
    throw new AppError("User not found or inactive", 401);
  }

  const accessToken = signAccessToken({ id: user.id, role: user.role.name });
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
      role: ROLE_NAME_SELECT,
      isActive: true,
      createdAt: true,
      memberProfile: true,
      coachProfile: COACH_PROFILE_WITH_CERT,
      managerProfile: true,
    },
  });
  if (!user) throw new AppError("User not found", 404);
  // BE-9: `restricted` = Coach chưa duyệt CV (chỉ dùng được hồ sơ/CV).
  return { ...withUserCvFields(flattenRole(user)), restricted: isRestrictedCoach(user) };
}

export async function updateMe(userId: string, data: UpdateProfileInput) {
  const { fitnessGoal, trainingLevel, trainingPreference, ...userFields } = data;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
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

    if (user.role.name === "MEMBER" && Object.keys(profileData).length > 0) {
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
 * Cập nhật avatar cho user. `avatarUrl` do controller lấy từ utils/storage
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
  // nên upload mới đã ghi đè asset cũ — không cần (và không được) xoá (xem utils/storage.ts).
  removeStoredAvatar(user.avatarUrl);

  return getMe(userId);
}

