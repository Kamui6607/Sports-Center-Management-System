import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { hashPassword } from "../../utils/bcrypt.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { lockManagerRoster } from "../../utils/dbLocks.js";
import { buildAdminResetPasswordEmail } from "../../utils/mail.js";
import { env } from "../../config/env.js";

import { disconnectUserSockets } from "../chat/chat.socket.js";
import {
  generateOtp,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from "../auth/auth.service.js";
import { enqueueEmail, flushNotificationOutbox } from "../notifications/outbox.service.js";
import type { CreateUserInput, UpdateUserInput, UserQueryInput } from "./users.schema.js";
import { ROLE_NAME_SELECT, connectRole, flattenRole } from "../../utils/roles.js";
import { COACH_PROFILE_WITH_CERT, isRestrictedCoach, withUserCvFields } from "../../utils/certification.js";

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
  coachProfile: COACH_PROFILE_WITH_CERT,
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

  return { users: users.map((u) => withUserCvFields(flattenRole(u))), pagination: buildPaginationMeta(total, currentPage, pageSize) };
}

export async function createUser(data: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("Email is already in use", 409);

  const hashed = await hashPassword(data.password);

  // HLV do Manager tạo trực tiếp (đang hoạt động) ⇒ hồ sơ coi như đã duyệt (fileUrl null như dữ liệu seed),
  // tránh trạng thái mâu thuẫn "đang hoạt động nhưng CV PENDING".
  const profileCreate =
    data.role === "COACH"
      ? { coachProfile: { create: { certification: { create: { status: "APPROVED" as const } } } } }
      : {
          memberProfile: {
            create: {
              fitnessGoal: data.fitnessGoal,
              trainingLevel: data.trainingLevel,
              trainingPreference: data.trainingPreference,
            },
          },
        };

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

    return withUserCvFields(flattenRole(created));
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new AppError("User not found", 404);
  return withUserCvFields(flattenRole(user));
}

/**
 * Chặn khóa/hạ quyền MANAGER đang hoạt động cuối cùng. Gọi TRONG transaction: lock `lockManagerRoster`
 * rồi đọc lại trạng thái — hai request khóa hai Manager khác nhau cùng lúc không thể cùng "thấy còn 2".
 */
async function assertNotLastActiveManager(tx: Prisma.TransactionClient, userId: string, message: string) {
  await lockManagerRoster(tx);
  const fresh = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, role: ROLE_NAME_SELECT } });
  if (!fresh || !fresh.isActive || fresh.role.name !== "MANAGER") return;
  const activeManagers = await tx.user.count({ where: { role: { name: "MANAGER" }, isActive: true } });
  if (activeManagers <= 1) throw new AppError(message, 400, { code: "LAST_ACTIVE_MANAGER" });
}

/**
 * BR-16 (1 user 1 role): đổi vai trò không được làm "mồ côi" nghĩa vụ đang mở của vai trò cũ —
 * hội viên còn chỗ/hoàn tiền/gói đang dùng, HLV còn lịch/khóa đang mở/tiền trong ví/lệnh rút hoặc hoàn chờ.
 * Dữ liệu lịch sử (profile, enrollment, ví) KHÔNG bị xóa khi đổi vai trò.
 */
async function assertRoleChangeAllowed(userId: string, currentRole: string) {
  const now = new Date();
  if (currentRole === "MEMBER") {
    const bookedEnrollments = await prisma.enrollment.count({ where: { member: { userId }, status: "BOOKED" } });
    if (bookedEnrollments > 0) {
      throw new AppError("Cannot change role: MEMBER has upcoming booked classes. Cancel them first.", 400, {
        code: "ROLE_CHANGE_BLOCKED",
        bookedEnrollments,
      });
    }
    const [pendingRefunds, activeMemberships] = await Promise.all([
      prisma.refund.count({ where: { member: { userId }, status: "PENDING" } }),
      prisma.membership.count({ where: { member: { userId }, status: "ACTIVE", endDate: { gt: now } } }),
    ]);
    if (pendingRefunds > 0 || activeMemberships > 0) {
      throw new AppError(
        "Không thể đổi vai trò: hội viên còn yêu cầu hoàn tiền chờ xử lý hoặc gói thành viên đang hiệu lực.",
        400,
        { code: "ROLE_CHANGE_BLOCKED", pendingRefunds, activeMemberships }
      );
    }
  }

  if (currentRole === "COACH") {
    const upcomingSchedules = await prisma.classSchedule.count({
      where: { class: { coach: { userId } }, status: "SCHEDULED", startTime: { gt: now } },
    });
    if (upcomingSchedules > 0) {
      throw new AppError("Cannot change role: COACH is assigned to upcoming classes.", 400, {
        code: "ROLE_CHANGE_BLOCKED",
        upcomingSchedules,
      });
    }
    const coach = await prisma.coachProfile.findUnique({ where: { userId }, select: { id: true, wallet: true } });
    if (coach) {
      const [openClasses, pendingWithdrawals, pendingRefundDebits] = await Promise.all([
        prisma.class.count({ where: { coachId: coach.id, isActive: true, status: { in: ["PENDING", "APPROVED"] } } }),
        coach.wallet
          ? prisma.walletTransaction.count({ where: { walletId: coach.wallet.id, type: "WITHDRAWAL", status: "PENDING" } })
          : 0,
        coach.wallet ? prisma.refund.count({ where: { coachWalletId: coach.wallet.id, status: "PENDING" } }) : 0,
      ]);
      const walletBalance = Number(coach.wallet?.balance ?? 0);
      if (openClasses > 0 || pendingWithdrawals > 0 || pendingRefundDebits > 0 || walletBalance > 0) {
        throw new AppError(
          "Không thể đổi vai trò: HLV còn khóa học đang mở, tiền trong ví, lệnh rút hoặc khoản hoàn tiền chờ xử lý.",
          400,
          { code: "ROLE_CHANGE_BLOCKED", openClasses, pendingWithdrawals, pendingRefundDebits, walletBalance }
        );
      }
    }
  }
}

export async function updateUser(id: string, data: UpdateUserInput, requesterId: string) {
  const found = await prisma.user.findUnique({
    where: { id },
    include: { role: true, coachProfile: { select: { id: true, certification: { select: { status: true } } } } },
  });
  if (!found) throw new AppError("User not found", 404);
  const user = flattenRole(found);
  // Vai trò mới (nếu có) gán qua quan hệ Role, không ghi thẳng vào User.
  const { role: newRole, ...fields } = data;
  const roleChanging = !!newRole && newRole !== user.role;

  if (id === requesterId) {
    if (data.isActive === false) throw new AppError("Cannot deactivate your own account", 400);
    if (roleChanging) throw new AppError("Cannot change your own role", 400);
  }

  // Mở khóa KHÔNG được thay cho duyệt CV: Coach chưa có hồ sơ APPROVED phải đi qua PATCH /coaches/:profileId/cv/review.
  const roleAfter = newRole ?? user.role;
  if (data.isActive === true && !found.isActive && roleAfter === "COACH") {
    const certStatus = found.coachProfile?.certification?.status ?? null;
    if (certStatus !== "APPROVED") {
      throw new AppError(
        "Không thể mở khóa: hồ sơ CV của HLV chưa được duyệt. Hãy duyệt CV trong mục Hồ sơ HLV.",
        409,
        { code: "COACH_CV_NOT_APPROVED", approvalStatus: certStatus ?? "NOT_SUBMITTED" }
      );
    }
  }

  if (roleChanging) await assertRoleChangeAllowed(id, user.role);

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

  const updated = await prisma.$transaction(async (tx) => {
    if (user.role === "MANAGER" && (data.isActive === false || roleChanging)) {
      await assertNotLastActiveManager(tx, id, "Cannot deactivate or demote the last active MANAGER");
    }
    const row = await tx.user.update({
      where: { id },
      data: {
        ...fields,
        dateOfBirth: fields.dateOfBirth ? new Date(fields.dateOfBirth) : undefined,
        ...(roleChanging ? { role: connectRole(newRole), ...profileUpdate } : {}),
      },
      select: userSelect,
    });
    // Manager chủ động chuyển một tài khoản đang hoạt động thành HLV ⇒ hồ sơ coi như đã duyệt (giống tạo HLV qua
    // POST /users), để trạng thái hiển thị khớp `isActive`. Tài khoản đã có hồ sơ CV thì giữ nguyên trạng thái CV.
    if (roleChanging && newRole === "COACH" && row.coachProfile && !row.coachProfile.certification) {
      await tx.certification.create({ data: { coachId: row.coachProfile.id, status: "APPROVED" } });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    }
    return row;
  });

  // Socket chỉ xác thực ở handshake → ngắt ngay khi khóa tài khoản hoặc đổi role (D04).
  if (data.isActive === false || roleChanging) {
    disconnectUserSockets(id);
  }

  return withUserCvFields(flattenRole(updated));
}

/** `DELETE /users/:id` — KHÓA MỀM (`isActive=false`), giữ nguyên lịch sử; không hủy lớp/hoàn tiền/đơn. */
export async function deactivateUser(id: string, requesterId: string) {
  if (id === requesterId) throw new AppError("Cannot deactivate your own account", 400);

  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) throw new AppError("User not found", 404);

  const deactivated = await prisma.$transaction(async (tx) => {
    if (user.role.name === "MANAGER") {
      await assertNotLastActiveManager(tx, id, "Cannot deactivate the last active MANAGER");
    }
    return tx.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, email: true, fullName: true, role: ROLE_NAME_SELECT, isActive: true },
    });
  });

  // Tài khoản bị khóa phải ngừng ngay mọi phiên socket đang mở (D04).
  disconnectUserSockets(id);

  return flattenRole(deactivated);
}

/**
 * Dữ liệu nghiệp vụ gắn với tài khoản. Có bất kỳ mục nào ⇒ KHÔNG xóa vĩnh viễn được (mất lịch sử
 * thanh toán/lớp/đơn hàng/chuyên cần…), chỉ được khóa. Đếm tường minh thay vì dựa cascade của DB vì nhiều
 * bảng con (chuyên cần, gói, lộ trình…) là `onDelete: Cascade` sẽ bị xóa âm thầm.
 */
async function businessHistoryOf(userId: string) {
  const member = { member: { userId } };
  const [
    enrollments, memberPayments, memberships, attendances, memberRefunds, memberPlans, memberFeedbacks, penalties,
    classes, coachPlans, coachFeedbacks, walletTransactions,
    orders, createdPayments, products, reviews, messagesSent, messagesReceived, refundsProcessed,
  ] = await Promise.all([
    prisma.enrollment.count({ where: member }),
    prisma.payment.count({ where: member }),
    prisma.membership.count({ where: member }),
    prisma.attendance.count({ where: member }),
    prisma.refund.count({ where: member }),
    prisma.trainingPlan.count({ where: member }),
    prisma.coachFeedback.count({ where: member }),
    prisma.attendancePenalty.count({ where: member }),
    prisma.class.count({ where: { coach: { userId } } }),
    prisma.trainingPlan.count({ where: { coach: { userId } } }),
    prisma.coachFeedback.count({ where: { coach: { userId } } }),
    prisma.walletTransaction.count({ where: { wallet: { coach: { userId } } } }),
    prisma.order.count({ where: { userId } }),
    prisma.payment.count({ where: { createdById: userId } }),
    prisma.product.count({ where: { createdById: userId } }),
    prisma.productReview.count({ where: { userId } }),
    prisma.chatMessage.count({ where: { senderId: userId } }),
    prisma.chatMessage.count({ where: { receiverId: userId } }),
    prisma.refund.count({ where: { OR: [{ processedById: userId }, { requestedById: userId }] } }),
  ]);
  const history = {
    enrollments, payments: memberPayments + createdPayments, memberships, attendances,
    refunds: memberRefunds + refundsProcessed, trainingPlans: memberPlans + coachPlans,
    feedbacks: memberFeedbacks + coachFeedbacks, penalties, classes, walletTransactions,
    orders, products, reviews, chatMessages: messagesSent + messagesReceived,
  };
  return Object.fromEntries(Object.entries(history).filter(([, n]) => n > 0)) as Record<string, number>;
}

/**
 * `DELETE /users/:id/permanent` — XÓA VĨNH VIỄN tài khoản CHƯA phát sinh dữ liệu nghiệp vụ (VD tạo nhầm).
 * Tài khoản đã có lịch sử ⇒ 409 `USER_HAS_HISTORY` (kèm thống kê) — dùng khóa tài khoản thay thế.
 * Bảo vệ: không tự xóa, không xóa MANAGER hoạt động cuối.
 */
export async function deleteUserPermanently(id: string, requesterId: string) {
  if (id === requesterId) throw new AppError("Không thể xóa tài khoản của chính bạn.", 400);
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) throw new AppError("User not found", 404);

  const history = await businessHistoryOf(id);
  if (Object.keys(history).length > 0) {
    throw new AppError(
      "Tài khoản đã phát sinh dữ liệu nghiệp vụ nên không thể xóa vĩnh viễn — hãy khóa tài khoản để giữ lịch sử.",
      409,
      { code: "USER_HAS_HISTORY", history }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (user.role.name === "MANAGER") {
        await assertNotLastActiveManager(tx, id, "Không thể xóa MANAGER hoạt động cuối cùng.");
      }
      await tx.user.delete({ where: { id } });
    });
  } catch (err) {
    // Dữ liệu phát sinh giữa lúc kiểm tra và xóa (FK Restrict) ⇒ vẫn trả 409 có ý nghĩa.
    if ((err as { code?: string }).code === "P2003") {
      throw new AppError("Tài khoản vừa phát sinh dữ liệu liên quan — không thể xóa vĩnh viễn, hãy khóa tài khoản.", 409, {
        code: "USER_HAS_HISTORY",
      });
    }
    throw err;
  }
  disconnectUserSockets(id);
  return { id, email: user.email, fullName: user.fullName, deleted: true };
}

/** Thống kê dữ liệu nghiệp vụ của tài khoản (để UI cho biết xóa vĩnh viễn được hay chỉ khóa). */
export async function getUserHistory(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new AppError("User not found", 404);
  const history = await businessHistoryOf(id);
  return { canDeletePermanently: Object.keys(history).length === 0, history };
}

// ── Manager khởi tạo đặt lại mật khẩu (U-08) ─────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

/**
 * `POST /users/:id/password-reset` — gửi email chứa mã OTP (15 phút, dùng một lần, 5 lần sai) để CHÍNH người dùng
 * tự đặt mật khẩu mới trên ứng dụng (`PATCH /auth/reset-password { email, otp, newPassword }`).
 * - Không đổi mật khẩu, không trả mật khẩu/mã/token trong response; phiên cũ chỉ bị thu hồi khi người dùng đặt xong.
 * - Cooldown 60s theo người nhận bằng CAS trên `lastSentAt` (2 request đồng thời ⇒ chỉ 1 email).
 * - Email đi qua outbox (retry khi nhà cung cấp lỗi) ⇒ response chỉ báo "đã vào hàng đợi".
 */
export async function requestPasswordResetByManager(targetId: string, managerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      role: ROLE_NAME_SELECT,
      coachProfile: { select: { certification: { select: { status: true } } } },
    },
  });
  if (!user) throw new AppError("User not found", 404);
  if (!user.isActive && !isRestrictedCoach(user)) {
    throw new AppError("Tài khoản đang bị khóa — hãy mở khóa trước khi gửi yêu cầu đặt lại mật khẩu.", 409, {
      code: "USER_LOCKED",
    });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - OTP_RESEND_COOLDOWN_SECONDS * 1000);
  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  const cooldown = async () => {
    const current = await prisma.passwordResetOtp.findUnique({ where: { userId: user.id }, select: { lastSentAt: true } });
    const retryAfterSeconds = current
      ? Math.max(1, Math.ceil((current.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000))
      : OTP_RESEND_COOLDOWN_SECONDS;
    return new AppError(`Vừa gửi yêu cầu cho tài khoản này. Vui lòng thử lại sau ${retryAfterSeconds} giây.`, 429, {
      code: "RESET_COOLDOWN",
      retryAfterSeconds,
    });
  };

  const resetUrl = `${env.FRONTEND_URL}/reset-password?email=${encodeURIComponent(user.email)}`;
  const { subject, html } = buildAdminResetPasswordEmail(user.fullName, otp, resetUrl);
  let outboxId: string;
  try {
    outboxId = await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetOtp.updateMany({
        where: { userId: user.id, lastSentAt: { lt: cutoff } },
        data: { otpHash, expiresAt, lastSentAt: now, attempts: 0, consumedAt: null },
      });
      if (claimed.count === 0) {
        // Chưa có bản ghi ⇒ tạo mới (userId UNIQUE: request song song thua sẽ nhận P2002 ⇒ cooldown).
        const exists = await tx.passwordResetOtp.findUnique({ where: { userId: user.id }, select: { id: true } });
        if (exists) throw await cooldown();
        await tx.passwordResetOtp.create({ data: { userId: user.id, otpHash, expiresAt, lastSentAt: now } });
      }
      const row = await enqueueEmail(tx, {
        userId: user.id,
        to: user.email,
        subject,
        html,
        type: "EMAIL_ADMIN_RESET_PASSWORD",
        metadata: { requestedById: managerId, requestedAt: now.toISOString() },
      });
      return row.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw await cooldown();
    throw err;
  }
  void flushNotificationOutbox().catch((err) => console.error("[OUTBOX] flush error:", err));

  return {
    queued: true,
    channel: "EMAIL" as const,
    recipient: maskEmail(user.email),
    outboxId,
    expiresAt,
    expiresInSeconds: OTP_TTL_SECONDS,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    message: "Đã đưa email đặt lại mật khẩu vào hàng đợi gửi. Mật khẩu chỉ thay đổi khi người dùng tự đặt mật khẩu mới.",
  };
}

/** `GET /users/:id/password-reset` — trạng thái yêu cầu gần nhất (không lộ mã): mã còn hạn/đã dùng, email đã gửi chưa. */
export async function getPasswordResetStatus(targetId: string) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!user) throw new AppError("User not found", 404);
  const [otp, email] = await Promise.all([
    prisma.passwordResetOtp.findUnique({
      where: { userId: targetId },
      select: { lastSentAt: true, expiresAt: true, consumedAt: true, attempts: true },
    }),
    prisma.notificationOutbox.findFirst({
      where: { userId: targetId, channel: "EMAIL", type: { in: ["EMAIL_ADMIN_RESET_PASSWORD", "EMAIL_RESET_PASSWORD"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, attempts: true, sentAt: true, createdAt: true },
    }),
  ]);
  const now = new Date();
  return {
    request: otp
      ? {
          requestedAt: otp.lastSentAt,
          expiresAt: otp.expiresAt,
          usedAt: otp.consumedAt,
          state: otp.consumedAt ? "USED" : otp.expiresAt <= now ? "EXPIRED" : otp.attempts >= OTP_MAX_ATTEMPTS ? "LOCKED" : "ACTIVE",
        }
      : null,
    email: email
      ? {
          id: email.id,
          initiatedBy: email.type === "EMAIL_ADMIN_RESET_PASSWORD" ? "MANAGER" : "USER",
          status: email.status,
          attempts: email.attempts,
          queuedAt: email.createdAt,
          sentAt: email.sentAt,
        }
      : null,
  };
}
