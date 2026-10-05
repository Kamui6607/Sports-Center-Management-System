import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { CoachQueryInput, UpdateCoachInput } from "./coaches.schema.js";
import { ROLE_NAME_SELECT, flattenRole } from "../../utils/roles.js";
import { COACH_PROFILE_WITH_CERT, withCvFields, withUserCvFields } from "../../utils/certification.js";

export async function listCoaches(query: CoachQueryInput) {
  const { search, specialization } = query;
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    role: { name: "COACH" },
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
        avatarUrl: true,
        role: ROLE_NAME_SELECT,
        isActive: true,
        coachProfile: COACH_PROFILE_WITH_CERT,
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const pagination = buildPaginationMeta(total, page, limit);
  return { coaches: users.map((u) => withUserCvFields(flattenRole(u))), pagination };
}

export async function getCoachById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, role: { name: "COACH" } },
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
      coachProfile: {
        include: {
          certification: true,
          classes: {
            include: {
              class: {
                include: {
                  sports: true,
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

  return withUserCvFields(flattenRole(user));
}

export async function updateCoach(id: string, data: UpdateCoachInput, actor?: { id: string; role: string }) {
  const coachProfile = await prisma.coachProfile.findFirst({
    where: { user: { id, role: { name: "COACH" } } },
  });

  if (!coachProfile) {
    throw new AppError("Coach not found", 404);
  }

  // COACH chỉ được sửa profile của chính mình
  if (actor?.role === "COACH" && id !== actor.id) {
    throw new AppError("Forbidden: You can only update your own profile", 403);
  }
  const { fullName, phone, gender, dateOfBirth, ...profileData } = data;
  const userFields: any = {};
  if (fullName !== undefined) userFields.fullName = fullName;
  if (phone !== undefined) userFields.phone = phone;
  if (gender !== undefined) userFields.gender = gender;
  if (dateOfBirth !== undefined) userFields.dateOfBirth = dateOfBirth;

  // User + CoachProfile cập nhật ATOMIC (F02): không để hồ sơ nửa vời khi lệnh thứ 2 lỗi.
  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(userFields).length > 0) {
      await tx.user.update({
        where: { id },
        data: {
          ...userFields,
          dateOfBirth: userFields.dateOfBirth ? new Date(userFields.dateOfBirth) : undefined,
        },
      });
    }

    return tx.coachProfile.update({
      where: { id: coachProfile.id },
      data: {
        ...(profileData.specialization !== undefined && { specialization: profileData.specialization }),
        ...(profileData.experienceYears !== undefined && { experienceYears: profileData.experienceYears }),
        ...(profileData.bio !== undefined && { bio: profileData.bio }),
      },
      include: {
        certification: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            gender: true,
            role: ROLE_NAME_SELECT,
            isActive: true,
          },
        },
      },
    });
  });

  return withCvFields({ ...updated, user: flattenRole(updated.user) });
}

// ── Coach nộp CV (hồ sơ chứng nhận — bảng Certification) ─────────────────────

/**
 * Coach upload CV (PDF) — lưu file ở uploads/cvs/, đường dẫn ghi vào `Certification.fileUrl`.
 * Mỗi coach có đúng 1 Certification: nộp lại ⇒ GHI ĐÈ file, status về PENDING, xóa kết quả duyệt cũ.
 * Coach mới đăng ký (isActive=false) vẫn gọi được nhờ middleware `authenticateIncludingInactive`.
 */
export async function submitCV(coachUserId: string, cvFilePath: string) {
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coachUserId },
  });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  const now = new Date();
  await prisma.certification.upsert({
    where: { coachId: coachProfile.id },
    create: { coachId: coachProfile.id, fileUrl: cvFilePath, status: "PENDING", submittedAt: now },
    update: {
      fileUrl: cvFilePath,
      status: "PENDING",
      submittedAt: now,
      reviewedById: null,
      reviewedAt: null,
      rejectReason: null,
    },
  });

  // Thông báo cho tất cả Manager biết có CV mới cần duyệt
  const { createNotification } = await import("../notifications/notifications.service.js");
  const managers = await prisma.user.findMany({
    where: { role: { name: "MANAGER" }, isActive: true },
    select: { id: true },
  });
  const coach = await prisma.user.findUnique({ where: { id: coachUserId }, select: { fullName: true } });
  for (const manager of managers) {
    createNotification(
      manager.id,
      "GENERAL",
      "CV Coach mới cần duyệt",
      `Coach ${coach?.fullName ?? coachUserId} vừa nộp CV. Vui lòng xem xét và duyệt tài khoản.`
    ).catch(() => {});
  }

  return { message: "CV submitted successfully. Waiting for Manager review." };
}

// ── Manager duyệt hoặc từ chối CV ────────────────────────────────────────────

export async function reviewCoachCV(
  coachProfileId: string,
  action: "APPROVE" | "REJECT",
  reason: string | undefined,
  reviewerId: string
) {
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { id: coachProfileId },
    include: { user: { select: { id: true, fullName: true } }, certification: true },
  });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);
  const cert = coachProfile.certification;
  if (!cert) throw new AppError("Coach chưa nộp CV — chưa có hồ sơ để duyệt", 400);
  if (cert.status !== "PENDING") {
    throw new AppError(`Coach CV has already been ${cert.status}`, 400);
  }

  const { createNotification } = await import("../notifications/notifications.service.js");
  const now = new Date();

  if (action === "APPROVE") {
    await prisma.$transaction(async (tx) => {
      // CAS theo status: 2 Manager bấm cùng lúc ⇒ người sau nhận 409, không duyệt 2 lần.
      const done = await tx.certification.updateMany({
        where: { id: cert.id, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: now, rejectReason: null },
      });
      if (done.count === 0) throw new AppError("Hồ sơ đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409);
      await tx.user.update({ where: { id: coachProfile.userId }, data: { isActive: true } });
    });

    createNotification(
      coachProfile.userId,
      "GENERAL",
      "Tài khoản Coach đã được duyệt!",
      `Xin chúc mừng ${coachProfile.user?.fullName ?? "bạn"}! Hồ sơ của bạn đã được Manager phê duyệt. Bạn có thể đăng nhập và bắt đầu tạo khóa học.`
    ).catch(() => {});

    return { message: "Coach account approved and activated.", approvalStatus: "APPROVED" };
  } else {
    const done = await prisma.certification.updateMany({
      where: { id: cert.id, status: "PENDING" },
      data: { status: "REJECTED", reviewedById: reviewerId, reviewedAt: now, rejectReason: reason ?? null },
    });
    if (done.count === 0) throw new AppError("Hồ sơ đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409);

    const reasonText = reason ? ` Lý do: ${reason}` : "";
    createNotification(
      coachProfile.userId,
      "GENERAL",
      "Hồ sơ Coach bị từ chối",
      `Rất tiếc, hồ sơ Coach của ${coachProfile.user?.fullName ?? "bạn"} đã bị từ chối.${reasonText} Vui lòng liên hệ trung tâm để biết thêm chi tiết.`
    ).catch(() => {});

    return { message: "Coach application rejected.", approvalStatus: "REJECTED" };
  }
}

// ── Manager xem danh sách CV theo trạng thái (mặc định PENDING) ──────────────

export async function listPendingCoachCVs(query: { page?: string; limit?: string; status?: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const { buildPaginationMeta } = await import("../../utils/pagination.js");

  // Chỉ coach ĐÃ nộp CV (có Certification) mới nằm trong danh sách duyệt.
  const statusFilter = (query.status as any) ?? "PENDING";
  const where = { certification: { status: statusFilter } };

  const [total, profiles] = await Promise.all([
    prisma.coachProfile.count({ where }),
    prisma.coachProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { certification: { submittedAt: "asc" } },
      include: {
        certification: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            gender: true,
            dateOfBirth: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  return { coaches: profiles.map(withCvFields), pagination: buildPaginationMeta(total, page, limit) };
}
