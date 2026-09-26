import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";
import { lockMemberClass, lockMemberQuota, lockSchedule } from "../../utils/dbLocks.js";
import { findActivePenalty } from "../attendance/attendance-penalties.service.js";
import {
  assertConcurrentClassQuota,
  findActiveSubscription,
} from "./enrollment-quota.service.js";

type BookableSchedule = {
  id: string;
  startTime: Date;
  endTime: Date;
  class: { id: string; classType: string; capacity: number };
};

/**
 * Bộ luật đặt chỗ dùng chung cho bookClass và transferEnrollment:
 * gói tập (ACTIVE, còn hạn tới lúc lớp bắt đầu, tier PREMIUM), quota lớp học song song,
 * sức chứa, trùng chỗ, trùng giờ.
 * `excludeEnrollmentId`: dùng khi transfer — chỗ cũ sắp được nhả nên không tính là trùng giờ.
 * `quotaExemptClassId`: dùng khi transfer — vì BR-08 giữ nguyên Class nên không tiêu quota mới (§9).
 * Trả về enrollment cũ (đang CANCELLED) nếu có, để caller kích hoạt lại theo BR-07.
 */
async function assertCanBook(
  tx: Prisma.TransactionClient,
  memberProfileId: string,
  schedule: BookableSchedule,
  options: { excludeEnrollmentId?: string; quotaExemptClassId?: string } = {}
) {
  // Chốt chặn 1: subscription phải ACTIVE và còn hạn đến ngày lớp học diễn ra.
  const activeSub = await findActiveSubscription(tx, memberProfileId);

  if (!activeSub) {
    throw new AppError(
      "Bạn không có gói tập đang hoạt động. Vui lòng mua gói để đặt lịch.",
      403
    );
  }

  if (activeSub.endDate < schedule.startTime) {
    const expiredDate = activeSub.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const classDate = schedule.startTime.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    throw new AppError(
      `Gói tập của bạn sẽ hết hạn ngày ${expiredDate}, trước khi lớp học diễn ra ngày ${classDate}. Vui lòng gia hạn gói để đặt lịch.`,
      403
    );
  }

  if (schedule.class.classType === "PREMIUM" && activeSub.tier !== "PREMIUM")
    throw new AppError("Premium membership required to book this class.", 403);

  // §12: hình phạt chuyên cần đang hiệu lực chỉ chặn đúng Class đó (không chặn Class khác).
  const penalty = await findActivePenalty(tx, memberProfileId, schedule.class.id);
  if (penalty) {
    const until = penalty.blockedUntil?.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) ?? "";
    throw new AppError(
      `Bạn đang bị tạm khoá đặt chỗ lớp này đến ${until} do chuyên cần ${penalty.attendanceRate}% (${penalty.sampleSize} buổi được tính). Vui lòng liên hệ quản lý nếu cần khiếu nại.`,
      403
    );
  }

  // Quota lớp học song song: chỉ chặn khi Member THÊM một Class mới vượt maxConcurrentClasses.
  // Class đã giữ (có buổi BOOKED tương lai) không tiêu thêm quota; ngược lại nếu đã đủ quota -> 403.
  await assertConcurrentClassQuota(tx, memberProfileId, schedule.class.id, {
    quotaExempt: options.quotaExemptClassId === schedule.class.id,
  });

  // Capacity check (đếm BOOKED + COMPLETED, khớp _count ở schedule detail).
  const bookedCount = await tx.enrollment.count({
    where: { scheduleId: schedule.id, status: { in: ["BOOKED", "COMPLETED"] } },
  });
  if (bookedCount >= schedule.class.capacity)
    throw new AppError("This class is full", 409);

  // Duplicate check (BR-07: cho phép kích hoạt lại enrollment đã CANCELLED).
  const existing = await tx.enrollment.findUnique({
    where: { memberId_scheduleId: { memberId: memberProfileId, scheduleId: schedule.id } },
  });
  if (existing && (existing.status === "BOOKED" || existing.status === "COMPLETED"))
    throw new AppError("You are already enrolled in this class", 409);

  // Time conflict check với các buổi khác của cùng hội viên.
  const conflict = await tx.enrollment.findFirst({
    where: {
      memberId: memberProfileId,
      status: { in: ["BOOKED", "COMPLETED"] },
      id: options.excludeEnrollmentId ? { not: options.excludeEnrollmentId } : undefined,
      schedule: {
        status: "SCHEDULED",
        startTime: { lt: schedule.endTime },
        endTime: { gt: schedule.startTime },
      },
    },
    include: { schedule: { include: { class: true } } },
  });
  if (conflict)
    throw new AppError(
      `You have a conflicting class "${conflict.schedule.class.name}" at this time`,
      409
    );

  return existing;
}

export async function bookClass(
  scheduleId: string,
  memberProfileId: string,
  bookedByRole: string
) {
  // 0. Verify member profile and role
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { id: memberProfileId },
    include: { user: true },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot book class: user is not an active MEMBER", 400);
  }

  // 1. Find schedule

  const schedule = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    include: { class: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  if (schedule.status !== "SCHEDULED")
    throw new AppError("This schedule is not available for booking", 400);
  if (schedule.startTime <= new Date())
    throw new AppError("Cannot book a past class", 400);

  return prisma.$transaction(async (tx) => {
    // Serialize booking theo member + schedule để chống overbooking & vượt quota khi concurrent:
    // 2 request của cùng member phải xếp hàng, request sau thấy dữ liệu mới nhất.
    // Lock sống trong transaction, tự release khi commit/rollback.
    // Lock order: memberQuota -> (member × class) -> schedule — giống transferEnrollment
    // và attendance penalty apply/restore.
    await lockMemberQuota(tx, memberProfileId);
    await lockMemberClass(tx, memberProfileId, schedule.class.id);
    await lockSchedule(tx, scheduleId);

    // 2-5. Gói tập / sức chứa / trùng chỗ / trùng giờ — dùng chung với transferEnrollment.
    const existing = await assertCanBook(tx, memberProfileId, schedule);

    // 6. Create or Reactivate enrollment
    let enrolled;
    if (existing) {
      enrolled = await tx.enrollment.update({
        where: { id: existing.id },
        data: { status: "BOOKED", bookedAt: new Date(), cancelledAt: null },
        include: {
          schedule: { include: { class: { include: { sports: true } }, room: true } },
          member: { include: { user: true } },
        },
      });
    } else {
      enrolled = await tx.enrollment.create({
        data: {
          memberId: memberProfileId,
          classId: schedule.classId,
          scheduleId,
          status: "BOOKED",
        },
        include: {
          schedule: { include: { class: { include: { sports: true } }, room: true } },
          member: { include: { user: true } },
        },
      });
    }

    // Notify member — fire-and-forget
    const startStr = schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    createNotification(
      enrolled.member.userId,
      "ENROLLMENT_CONFIRMED",
      `Đặt lớp thành công: ${schedule.class.name}`,
      `Bạn đã đặt lớp "${schedule.class.name}" thành công vào lúc ${startStr}. Chúc bạn tập luyện vui vẻ!`,
      { metadata: { scheduleId, classId: schedule.classId, enrollmentId: enrolled.id } }
    ).catch(() => {});

    // Return without user for consistent shape
    const { member: _m, ...enrolledData } = enrolled as any;
    return enrolledData;
  });
}

export async function cancelEnrollment(
  enrollmentId: string,
  userId: string,
  role: string
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { member: true, schedule: true },
  });
  if (!enrollment) throw new AppError("Enrollment not found", 404);

  // MEMBER can only cancel their own enrollment
  if (role === "MEMBER" && enrollment.member.userId !== userId) {
    throw new AppError("Forbidden: You can only cancel your own enrollments", 403);
  } else if (role === "COACH") {
    throw new AppError("Forbidden: Coaches cannot cancel member enrollments", 403);
  }

  if (enrollment.status !== "BOOKED")
    throw new AppError("Only BOOKED enrollments can be cancelled", 400);

  if (enrollment.schedule.startTime <= new Date())
    throw new AppError("Cannot cancel enrollment for a past or ongoing class", 400);

  const cancelled = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    include: { member: { include: { user: true } }, schedule: { include: { class: true } } },
  });

  // Notify member — fire-and-forget
  const startStr = cancelled.schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  createNotification(
    cancelled.member.userId,
    "ENROLLMENT_CANCELLED",
    `Đã hủy đặt lớp: ${cancelled.schedule.class.name}`,
    `Lịch học "${cancelled.schedule.class.name}" vào lúc ${startStr} đã được hủy thành công.`,
    { metadata: { enrollmentId, scheduleId: cancelled.scheduleId } }
  ).catch(() => {});

  return cancelled;
}

export async function getMyEnrollments(userId: string, query: any) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;

  const [total, enrollments] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where, skip, take: limit,
      include: {
        schedule: {
          include: { class: { include: { sports: true } }, room: true },
        },
      },
      orderBy: { bookedAt: "desc" },
    }),
  ]);
  return { enrollments, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getScheduleEnrollments(scheduleId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { scheduleId };
  if (query.status) where.status = query.status;

  const [total, enrollments] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where, skip, take: limit,
      include: {
        member: {
          include: { user: { select: { fullName: true, email: true, phone: true } } },
        },
      },
      orderBy: { bookedAt: "asc" },
    }),
  ]);
  return { enrollments, pagination: buildPaginationMeta(total, page, limit) };
}

/**
 * Chuyển chỗ đặt của hội viên sang một buổi khác TRONG CÙNG CLASS (KHÔNG sửa ClassSchedule/Class/Room).
 * - BR-08: `targetScheduleId` bắt buộc thuộc cùng Class với Enrollment hiện tại (khác Class -> 400).
 * - Chỗ cũ: BOOKED + buổi chưa diễn ra; chỗ mới: SCHEDULED + chưa bắt đầu.
 * - Áp dụng đầy đủ luật đặt chỗ (gói tập, tier, sức chứa, trùng chỗ, trùng giờ) — bỏ qua chỗ cũ khi check trùng giờ.
 * - BR-09: serialize transfer theo (memberId, classId) + compare-and-set khi nhả chỗ cũ nên một Enrollment
 *   không thể bị chuyển đồng thời sang nhiều buổi.
 * - Toàn bộ nằm trong 1 transaction: fail thì rollback, hội viên giữ nguyên chỗ cũ.
 * - Chỗ cũ chuyển CANCELLED (giữ lịch sử); nếu buổi mới từng bị hủy trước đây thì kích hoạt lại (BR-07).
 */
export async function transferEnrollment(
  enrollmentId: string,
  targetScheduleId: string,
  userId: string,
  role: string
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { member: true, schedule: { include: { class: true } } },
  });
  if (!enrollment) throw new AppError("Enrollment not found", 404);

  // MEMBER chỉ chuyển chỗ của chính mình (khớp luật hủy chỗ hiện có).
  if (role === "MEMBER" && enrollment.member.userId !== userId) {
    throw new AppError("Forbidden: You can only transfer your own enrollments", 403);
  }
  if (role === "COACH") {
    throw new AppError("Forbidden: Coaches cannot transfer member enrollments", 403);
  }

  if (enrollment.status !== "BOOKED")
    throw new AppError("Only BOOKED enrollments can be transferred", 400);

  if (enrollment.scheduleId === targetScheduleId)
    throw new AppError("Target schedule is the same as the current schedule", 409);

  if (enrollment.schedule.startTime <= new Date())
    throw new AppError("Cannot transfer enrollment for a past or ongoing class", 400);

  const target = await prisma.classSchedule.findUnique({
    where: { id: targetScheduleId },
    include: { class: true },
  });
  if (!target) throw new AppError("Target schedule not found", 404);

  // BR-08: chỉ đổi GIỜ trong cùng Class — không dùng endpoint này để chuyển sang lớp khác.
  if (target.classId !== enrollment.classId)
    throw new AppError(
      "Target schedule must belong to the same class as the current enrollment",
      400
    );

  if (target.status !== "SCHEDULED")
    throw new AppError("Target schedule is not available for booking", 400);
  if (target.startTime <= new Date())
    throw new AppError("Cannot transfer to a past class", 400);

  return prisma.$transaction(async (tx) => {
    // Quota là tài nguyên theo memberId nên phải lock TRƯỚC (lock order: memberQuota ->
    // memberClass -> schedule).
    await lockMemberQuota(tx, enrollment.memberId);
    // BR-09: serialize mọi transfer của cùng (memberId, classId). Thiếu lock này, 2 request
    // đồng thời (lock schedule đích khác nhau) có thể cùng thấy enrollment BOOKED rồi cùng commit
    // -> member giữ 2 chỗ trong cùng Class.
    await lockMemberClass(tx, enrollment.memberId, enrollment.classId);
    // Lock buổi đích: nhiều hội viên cùng chuyển tới không được vượt sức chứa.
    await lockSchedule(tx, targetScheduleId);

    // Nhả chỗ cũ bằng compare-and-set ngay trong lock: chỉ thành công khi vẫn BOOKED.
    // Request thua trong cuộc đua sẽ count = 0 -> 409 và rollback (không nhận thêm chỗ).
    const released = await tx.enrollment.updateMany({
      where: {
        id: enrollment.id,
        memberId: enrollment.memberId,
        classId: enrollment.classId,
        status: "BOOKED",
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (released.count !== 1)
      throw new AppError(
        "Enrollment is no longer BOOKED (it may have been transferred or cancelled already)",
        409
      );

    const existingTarget = await assertCanBook(tx, enrollment.memberId, target, {
      excludeEnrollmentId: enrollment.id,
      // §9: transfer chỉ đổi buổi TRONG CÙNG Class (BR-08) => số Class không đổi, không tiêu quota mới.
      quotaExemptClassId: enrollment.classId,
    });

    const enrollmentInclude = {
      schedule: { include: { class: { include: { sports: true } }, room: true } },
    };
    const transferred = existingTarget
      ? await tx.enrollment.update({
          where: { id: existingTarget.id },
          data: { status: "BOOKED", bookedAt: new Date(), cancelledAt: null },
          include: enrollmentInclude,
        })
      : await tx.enrollment.create({
          data: {
            memberId: enrollment.memberId,
            classId: target.classId,
            scheduleId: targetScheduleId,
            status: "BOOKED",
          },
          include: enrollmentInclude,
        });

    // Một notification duy nhất mô tả việc chuyển buổi (tránh gửi kèm CANCELLED gây rối).
    const oldStart = enrollment.schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const newStart = target.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    createNotification(
      enrollment.member.userId,
      "ENROLLMENT_CONFIRMED",
      `Đã chuyển buổi học: ${target.class.name}`,
      `Bạn đã chuyển từ buổi "${enrollment.schedule.class.name}" lúc ${oldStart} sang "${target.class.name}" lúc ${newStart}. Chúc bạn tập luyện vui vẻ!`,
      {
        metadata: {
          enrollmentId: transferred.id,
          scheduleId: targetScheduleId,
          classId: target.classId,
          previousScheduleId: enrollment.scheduleId,
        },
      }
    ).catch(() => {});

    return transferred;
  });
}
