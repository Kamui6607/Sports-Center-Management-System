import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { CoachQueryInput, UpdateCoachInput } from "./coaches.schema.js";
import { ROLE_NAME_SELECT, flattenRole } from "../../utils/roles.js";
import { vnClock, vnDateKey, vnWeekdayIso, vnWeekdayLabel } from "../../utils/vnTime.js";
import { COACH_PROFILE_WITH_CERT, withCvFields, withUserCvFields } from "../../utils/certification.js";
import { goalLabel } from "../../config/fitness-goals.js";

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
          // Lớp do HLV phụ trách (Class.coachId)
          classes: {
            include: {
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
  });

  if (!user) {
    throw new AppError("Coach not found", 404);
  }

  return withUserCvFields(flattenRole(user));
}

/**
 * Các buổi SẮP DIỄN RA của HLV (id = userId của HLV) — màn "bấm vào buổi sắp tới để xem danh sách buổi".
 * Chỉ các lớp đang mở (không DRAFT/CANCELLED). Lọc `classId` để xem riêng 1 khóa.
 */
export async function getCoachUpcomingSessions(coachUserId: string, query: { classId?: string; page?: string; limit?: string }) {
  const profile = await prisma.coachProfile.findFirst({ where: { userId: coachUserId }, select: { id: true } });
  if (!profile) throw new AppError("Coach not found", 404);
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const where: any = {
    status: "SCHEDULED",
    startTime: { gt: new Date() },
    class: { coachId: profile.id, status: "APPROVED", isActive: true, ...(query.classId ? { id: query.classId } : {}) },
  };
  const [total, rows] = await Promise.all([
    prisma.classSchedule.count({ where }),
    prisma.classSchedule.findMany({
      where,
      orderBy: { startTime: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        room: { select: { id: true, name: true } },
        class: { select: { id: true, name: true, capacity: true, classType: true, goal: true } },
        _count: { select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } } },
      },
    }),
  ]);
  const sessions = rows.map((r) => ({
    scheduleId: r.id,
    class: r.class,
    room: r.room,
    date: vnDateKey(r.startTime),
    weekday: vnWeekdayIso(r.startTime),
    weekdayLabel: vnWeekdayLabel(vnWeekdayIso(r.startTime)),
    startClock: vnClock(r.startTime),
    endClock: vnClock(r.endTime),
    startTime: r.startTime,
    endTime: r.endTime,
    bookedCount: r._count.enrollments,
    remainingSlots: Math.max(0, r.class.capacity - r._count.enrollments),
    isMakeup: !!r.makeupForId,
  }));
  return { sessions, pagination: buildPaginationMeta(total, page, limit) };
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
 * Coach mới đăng ký (isActive=false) vẫn gọi được nhờ middleware `authenticateRestricted` (phiên giới hạn, BE-9).
 */
export async function submitCV(coachUserId: string, cvFilePath: string) {
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coachUserId },
  });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  const now = new Date();
  const certification = await prisma.certification.upsert({
    where: { coachId: coachProfile.id },
    create: { coachId: coachProfile.id, fileUrl: cvFilePath, status: "PENDING", submittedAt: now },
    update: {
      fileUrl: cvFilePath,
      status: "PENDING",
      submittedAt: now,
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

  // Kèm hồ sơ vừa lưu để client hiển thị trạng thái mà không phải tải lại (chỉ THÊM field).
  return { message: "CV submitted successfully. Waiting for Manager review.", certification };
}

// ── Manager duyệt hoặc từ chối CV ────────────────────────────────────────────

export async function reviewCoachCV(
  coachProfileId: string,
  action: "APPROVE" | "REJECT",
  reason?: string
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

  if (action === "APPROVE") {
    await prisma.$transaction(async (tx) => {
      // CAS theo status: 2 Manager bấm cùng lúc ⇒ người sau nhận 409, không duyệt 2 lần.
      const done = await tx.certification.updateMany({
        where: { id: cert.id, status: "PENDING" },
        data: { status: "APPROVED", rejectReason: null },
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
      data: { status: "REJECTED", rejectReason: reason ?? null },
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


/**
 * Hồ sơ CÔNG KHAI của HLV (bảng thông tin khi hội viên bấm vào HLV ở chi tiết khóa học).
 * `id` = CoachProfile.id hoặc userId. KHÔNG trả email/SĐT/CV; đánh giá ẩn danh không lộ tên người viết.
 */
export async function getCoachPublicProfile(id: string) {
  const profile = await prisma.coachProfile.findFirst({
    where: { OR: [{ id }, { userId: id }], user: { isActive: true, role: { name: "COACH" } } },
    select: {
      id: true,
      userId: true,
      specialization: true,
      experienceYears: true,
      bio: true,
      createdAt: true,
      user: { select: { fullName: true, avatarUrl: true, gender: true } },
    },
  });
  if (!profile) throw new AppError("Coach not found", 404);

  const now = new Date();
  const [classes, studentRows, completedSessions, ratingAgg, ratingGroups, reviews] = await Promise.all([
    prisma.class.findMany({
      where: { coachId: profile.id, status: { in: ["APPROVED", "COMPLETED"] } },
      select: {
        id: true,
        name: true,
        price: true,
        status: true,
        isActive: true,
        classType: true,
        goalTags: true,
        targetLevel: true,
        startDate: true,
        endDate: true,
        capacity: true,
        _count: { select: { schedules: { where: { status: "SCHEDULED", startTime: { gt: now } } } } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.payment.findMany({
      where: { status: "SUCCESS", class: { coachId: profile.id } },
      select: { memberId: true },
      distinct: ["memberId"],
    }),
    prisma.classSchedule.count({ where: { status: "COMPLETED", class: { coachId: profile.id } } }),
    prisma.coachFeedback.aggregate({ where: { coachId: profile.id }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.coachFeedback.groupBy({ by: ["rating"], where: { coachId: profile.id }, _count: { rating: true } }),
    prisma.coachFeedback.findMany({
      where: { coachId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        rating: true,
        comment: true,
        isAnonymous: true,
        createdAt: true,
        class: { select: { id: true, name: true } },
        member: { select: { user: { select: { fullName: true, avatarUrl: true } } } },
      },
    }),
  ]);

  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const g of ratingGroups) distribution[String(g.rating)] = g._count.rating;
  const openCourses = classes.filter((c) => c.status === "APPROVED" && c.isActive && c._count.schedules > 0);

  return {
    coachProfileId: profile.id,
    userId: profile.userId,
    fullName: profile.user.fullName,
    avatarUrl: profile.user.avatarUrl,
    gender: profile.user.gender,
    specialization: profile.specialization,
    experienceYears: profile.experienceYears,
    bio: profile.bio,
    joinedAt: profile.createdAt,
    stats: {
      openCourses: openCourses.length,
      totalCourses: classes.length,
      totalStudents: studentRows.length,
      completedSessions,
    },
    rating: {
      average: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
      count: ratingAgg._count.rating,
      distribution,
    },
    courses: openCourses.map((c) => ({
      id: c.id,
      name: c.name,
      price: Number(c.price),
      classType: c.classType,
      goals: c.goalTags.map((code) => ({ code, label: goalLabel(code) })),
      targetLevel: c.targetLevel,
      startDate: c.startDate,
      endDate: c.endDate,
      upcomingSessions: c._count.schedules,
    })),
    recentReviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      class: r.class,
      author: r.isAnonymous ? null : { fullName: r.member.user.fullName, avatarUrl: r.member.user.avatarUrl },
    })),
  };
}
