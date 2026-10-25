import { prisma } from "../../config/prisma.js";
import { findUsableCoursePayment } from "../payments/course-purchase.service.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { lockMemberClass, lockMemberQuota, lockSchedule } from "../../utils/dbLocks.js";
import { findActivePenalty } from "../attendance/attendance-penalties.service.js";
import { ROLE_NAME_SELECT } from "../../utils/roles.js";
import { findSessionsBlockedByRefund, throwSessionRefundedError, createMemberSessionRefundTx, notifyManagersNewRefunds, SESSION_REFUND_MIN_HOURS } from "../refunds/refunds.service.js";
import { vnClock, vnDateKey, vnWeekdayIso, vnWeekdayLabel } from "../../utils/vnTime.js";

type BookableSchedule = {
  id: string;
  startTime: Date;
  endTime: Date;
  class: { id: string; classType: string; capacity: number };
};

/**
 * Bộ luật đặt chỗ dùng chung cho bookClass và transferEnrollment.
 *
 * Mô hình mới (không có Membership/Subscription):
 * - Member phải có Payment SUCCESS cho classId của schedule này.
 * - Không có subscription quota check — ai mua thì được học.
 * - Vẫn kiểm tra: hình phạt chuyên cần, sức chứa, trùng chỗ, trùng giờ.
 *
 * `excludeEnrollmentId`: dùng khi transfer — chỗ cũ sắp được nhả nên không tính là trùng giờ.
 * Trả về enrollment cũ (đang CANCELLED) nếu có, để caller kích hoạt lại theo BR-07.
 */
async function assertCanBook(
  tx: Prisma.TransactionClient,
  memberProfileId: string,
  schedule: BookableSchedule,
  options: { excludeEnrollmentId?: string; quotaExemptClassId?: string; paidClassId?: string } = {}
) {
  // Chốt chặn 1: Member phải đã MUA khóa học này (Payment SUCCESS). Đổi buổi sang khóa tương đương ⇒
  // kiểm tra theo khóa ĐÃ TRẢ TIỀN (`paidClassId`).
  // Giao dịch đã bị hoàn ở cấp khóa (hoàn ngoại lệ / không ghi danh đủ) không còn quyền đặt chỗ ⇒ phải mua lại.
  const hasPaid = await findUsableCoursePayment(tx, memberProfileId, options.paidClassId ?? schedule.class.id);

  if (!hasPaid) {
    throw new AppError(
      "Bạn chưa mua khóa học này. Vui lòng thanh toán để đặt lịch.",
      403,
      { code: "CLASS_NOT_PURCHASED", classId: schedule.class.id }
    );
  }

  // §12: hình phạt chuyên cần đang hiệu lực chỉ chặn đúng Class đó (không chặn Class khác).
  const penalty = await findActivePenalty(tx, memberProfileId, schedule.class.id);
  if (penalty) {
    const until = penalty.blockedUntil?.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) ?? "";
    throw new AppError(
      `Bạn đang bị tạm khoá đặt chỗ lớp này đến ${until} do chuyên cần ${penalty.attendanceRate}% (${penalty.sampleSize} buổi được tính). Vui lòng liên hệ quản lý nếu cần khiếu nại.`,
      403
    );
  }

  // Capacity check (đếm BOOKED + COMPLETED, khớp _count ở schedule detail).
  const bookedCount = await tx.enrollment.count({
    where: { scheduleId: schedule.id, status: { in: ["BOOKED", "COMPLETED"] } },
  });
  if (bookedCount >= schedule.class.capacity)
    throw new AppError("This class is full", 409);

  // Buổi đã hủy kèm hoàn tiền thì không đặt lại được.
  const blocked = await findSessionsBlockedByRefund(tx, memberProfileId, [schedule.id]);
  if (blocked.length > 0) throwSessionRefundedError(blocked);

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
    include: { user: { select: { id: true, isActive: true, role: ROLE_NAME_SELECT } } },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role.name !== "MEMBER") {
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

  const booked = await prisma.$transaction(async (tx) => {
    // Serialize booking theo member + schedule để chống overbooking & vượt quota khi concurrent:
    // 2 request của cùng member phải xếp hàng, request sau thấy dữ liệu mới nhất.
    // Lock sống trong transaction, tự release khi commit/rollback.
    // Lock order: memberQuota -> (member × class) -> schedule — giống transferEnrollment
    // và attendance penalty apply/restore.
    await lockMemberQuota(tx, memberProfileId);
    await lockMemberClass(tx, memberProfileId, schedule.class.id);
    await lockSchedule(tx, scheduleId);

    // A12: đọc LẠI lịch SAU lock — không dùng object đọc trước transaction (lịch có thể vừa bị
    // hủy hoặc dời giờ bởi request khác; đặt chỗ trên dữ liệu cũ là lỗi nghiệp vụ nghiêm trọng).
    const freshSchedule = await tx.classSchedule.findUnique({
      where: { id: scheduleId },
      include: { class: true },
    });
    if (!freshSchedule) throw new AppError("Schedule not found", 404);
    if (freshSchedule.status !== "SCHEDULED") {
      throw new AppError("Lịch học không còn khả dụng để đặt chỗ.", 409, {
        code: "SCHEDULE_NOT_AVAILABLE",
      });
    }
    if (freshSchedule.startTime <= new Date()) {
      throw new AppError("Cannot book a past class", 400);
    }

    // 2-5. Gói tập / sức chứa / trùng chỗ / trùng giờ — dùng chung với transferEnrollment.
    const existing = await assertCanBook(tx, memberProfileId, freshSchedule);

    // 6. Create or Reactivate enrollment
    let enrolled;
    if (existing) {
      enrolled = await tx.enrollment.update({
        where: { id: existing.id },
        data: { status: "BOOKED", bookedAt: new Date(), cancelledAt: null },
        include: {
          schedule: { include: { class: true, room: true } },
          member: { select: { id: true, userId: true } },
        },
      });
    } else {
      enrolled = await tx.enrollment.create({
        data: {
          memberId: memberProfileId,
          scheduleId,
          status: "BOOKED",
        },
        include: {
          schedule: { include: { class: true, room: true } },
          member: { select: { id: true, userId: true } },
        },
      });
    }

    // F01: ghi outbox TRONG transaction — gửi SAU commit (booking rollback không tạo thông báo).
    const startStr = freshSchedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    await enqueueNotification(tx, {
      userId: enrolled.member.userId,
      type: "ENROLLMENT_CONFIRMED",
      title: `Đặt lớp thành công: ${freshSchedule.class.name}`,
      body: `Bạn đã đặt lớp "${freshSchedule.class.name}" thành công vào lúc ${startStr}. Chúc bạn tập luyện vui vẻ!`,
      metadata: { scheduleId, classId: freshSchedule.classId, enrollmentId: enrolled.id },
    });

    // Return without user for consistent shape
    const { member: _m, ...enrolledData } = enrolled as any;
    return enrolledData;
  });

  // F01: gửi notification trong outbox SAU khi transaction đã commit.
  await flushNotificationOutbox().catch(() => {});
  return booked;
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

  // Hủy chỗ + (nếu là MEMBER, hủy trước ≥24h) tạo yêu cầu hoàn 80% tiền buổi — cùng 1 transaction.
  const { cancelled, refund } = await prisma.$transaction(async (tx) => {
    await lockMemberClass(tx, enrollment.memberId, enrollment.schedule.classId);
    const res = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (res.count !== 1) throw new AppError("Only BOOKED enrollments can be cancelled", 409);
    const updated = await tx.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { member: { select: { id: true, userId: true } }, schedule: { include: { class: true } } },
    });
    // Buổi bị HLV dời lịch SAU khi hội viên giữ chỗ ⇒ hủy được hoàn 100% (không áp hạn 24h).
    const rescheduledByCoach =
      !!enrollment.schedule.rescheduledAt && enrollment.bookedAt.getTime() < enrollment.schedule.rescheduledAt.getTime();
    const created =
      role === "MEMBER"
        ? await createMemberSessionRefundTx(tx, {
            memberId: enrollment.memberId,
            userId,
            // Buổi đổi sang khóa tương đương ⇒ hoàn theo khóa đã trả tiền.
            classId: enrollment.sourceClassId ?? enrollment.schedule.classId,
            scheduleId: enrollment.scheduleId,
            startTime: enrollment.schedule.startTime,
            rescheduledByCoach,
          })
        : null;
    return { cancelled: updated, refund: created };
  });

  // Notify member — fire-and-forget
  const startStr = cancelled.schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  createNotification(
    cancelled.member.userId,
    "ENROLLMENT_CANCELLED",
    `Đã hủy đặt lớp: ${cancelled.schedule.class.name}`,
    refund
      ? `Lịch học "${cancelled.schedule.class.name}" vào lúc ${startStr} đã được hủy. Yêu cầu hoàn ${Number(refund.amount).toLocaleString("vi-VN")}đ (${refund.reason === "SESSION_RESCHEDULED" ? "100% tiền buổi do HLV dời lịch" : "80% tiền buổi"}) đang chờ Quản lý xử lý.`
      : `Lịch học "${cancelled.schedule.class.name}" vào lúc ${startStr} đã được hủy thành công.`,
    { metadata: { enrollmentId, scheduleId: cancelled.scheduleId, refundId: refund?.id ?? null } }
  ).catch(() => {});
  if (refund) {
    void notifyManagersNewRefunds(
      `Hội viên hủy 1 buổi "${cancelled.schedule.class.name}" — cần hoàn ${Number(refund.amount).toLocaleString("vi-VN")}đ.`,
      { refundId: refund.id, classId: cancelled.schedule.classId, scheduleId: cancelled.scheduleId }
    );
  }

  return { ...cancelled, refund };
}

export async function getMyEnrollments(userId: string, query: any) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;
  // BE-14: lọc theo thời gian buổi học (giao khoảng) và theo khóa.
  const schedule: any = {};
  if (query.from) schedule.endTime = { gt: new Date(query.from) };
  if (query.to) schedule.startTime = { lt: new Date(query.to) };
  if (query.classId) schedule.classId = query.classId;
  if (Object.keys(schedule).length > 0) where.schedule = schedule;
  const byTime = Boolean(query.from || query.to);

  const [total, enrollments] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where, skip, take: limit,
      include: {
        schedule: {
          include: {
            // BE-14: kèm HLV của khóa (tên, avatar) — client không phải tra thêm.
            class: {
              include: {
                coach: {
                  select: {
                    id: true,
                    userId: true,
                    specialization: true,
                    user: { select: { id: true, fullName: true, avatarUrl: true } },
                  },
                },
              },
            },
            room: true,
          },
        },
      },
      orderBy: byTime ? { schedule: { startTime: "asc" } } : { bookedAt: "desc" },
    }),
  ]);
  return { enrollments, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getScheduleEnrollments(
  scheduleId: string,
  query: any,
  actor: { id: string; role: string }
) {
  // COACH chỉ được xem danh sách đăng ký của buổi thuộc lớp mình phụ trách.
  if (actor.role === "COACH") {
    const schedule = await prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: { class: { select: { coachId: true } } },
    });
    if (!schedule) throw new AppError("Schedule not found", 404);
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
    const isAssigned =
      Boolean(coachProfile) && schedule.class.coachId === coachProfile!.id;
    if (!isAssigned) throw new AppError("Forbidden: You are not assigned to this class", 403);
  }

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

/** Số lần đổi buổi tối đa cho MỘT khóa đã mua (Doc/GYM_SCOPE_CHANGES.md §8). */
export const MAX_TRANSFERS_PER_COURSE = 2;

type TransferSource = {
  id: string;
  memberId: string;
  scheduleId: string;
  sourceClassId: string | null;
  schedule: { classId: string; startTime: Date; class: { id: string; coachId: string; classType: string; name: string } };
};

/** Khóa hội viên đã trả tiền cho chỗ này (đổi sang khóa tương đương vẫn tính theo khóa gốc). */
const paidClassOf = (e: { sourceClassId: string | null; schedule: { classId: string } }) => e.sourceClassId ?? e.schedule.classId;

/** Số lần hội viên đã đổi buổi trong một khóa đã mua. */
async function countTransfers(db: typeof prisma | Prisma.TransactionClient, memberId: string, paidClassId: string) {
  return db.enrollment.count({
    where: {
      memberId,
      transferredFromId: { not: null },
      OR: [{ sourceClassId: paidClassId }, { sourceClassId: null, schedule: { classId: paidClassId } }],
    },
  });
}

/**
 * Buổi đích hợp lệ: buổi khác của CHÍNH khóa đó (VD buổi dạy bù) hoặc buổi của KHÓA TƯƠNG ĐƯƠNG
 * (cùng HLV — để 85% doanh thu vẫn đúng người dạy — cùng hạng, đang mở bán).
 */
function isEligibleTarget(
  source: TransferSource,
  target: { classId: string; class: { coachId: string; classType: string; status: string; isActive: boolean } }
) {
  if (target.classId === paidClassOf(source) || target.classId === source.schedule.classId) return true;
  return (
    target.class.coachId === source.schedule.class.coachId &&
    target.class.classType === source.schedule.class.classType &&
    target.class.status === "APPROVED" &&
    target.class.isActive
  );
}

/**
 * Đổi buổi (Doc/GYM_SCOPE_CHANGES.md §8): bỏ buổi hiện tại để học bù ở một buổi khác.
 * - Đích: buổi của chính khóa (VD dạy bù) hoặc khóa tương đương (cùng HLV, cùng hạng, đang mở bán).
 * - Hội viên: buổi hiện tại VÀ buổi đích đều còn ≥ 24h; tối đa 2 lần đổi / khóa đã mua (Manager không bị giới hạn).
 * - Áp dụng đủ luật đặt chỗ (sức chứa, trùng giờ, phạt chuyên cần) — bỏ qua chỗ cũ khi xét trùng giờ.
 * - Không hoàn tiền. Chỗ cũ → CANCELLED; chỗ mới ghi `sourceClassId` (khóa đã trả tiền) + `transferredFromId`.
 * - Một transaction + lock (member × khóa) + compare-and-set ⇒ không đổi đồng thời sang nhiều buổi.
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

  const minMs = SESSION_REFUND_MIN_HOURS * 3_600_000;
  // Hội viên chỉ được đổi buổi khi buổi hiện tại còn ≥24h (Manager không bị giới hạn).
  if (role === "MEMBER" && enrollment.schedule.startTime.getTime() - Date.now() < minMs) {
    throw new AppError(
      `Chỉ được đổi buổi trước giờ học ít nhất ${SESSION_REFUND_MIN_HOURS} giờ.`,
      400,
      { code: "ENROLLMENT_TRANSFER_TOO_LATE", minHours: SESSION_REFUND_MIN_HOURS }
    );
  }

  const target = await prisma.classSchedule.findUnique({
    where: { id: targetScheduleId },
    include: { class: true },
  });
  if (!target) throw new AppError("Target schedule not found", 404);

  if (!isEligibleTarget(enrollment, target)) {
    throw new AppError(
      "Chỉ đổi được sang buổi của chính khóa này hoặc khóa tương đương (cùng HLV, cùng hạng, đang mở bán).",
      400,
      { code: "TRANSFER_TARGET_NOT_ELIGIBLE" }
    );
  }
  if (target.status !== "SCHEDULED")
    throw new AppError("Target schedule is not available for booking", 400);
  if (target.startTime <= new Date())
    throw new AppError("Cannot transfer to a past class", 400);
  if (role === "MEMBER" && target.startTime.getTime() - Date.now() < minMs) {
    throw new AppError(`Buổi muốn đổi sang phải còn ít nhất ${SESSION_REFUND_MIN_HOURS} giờ mới bắt đầu.`, 400, {
      code: "TRANSFER_TARGET_TOO_SOON",
      minHours: SESSION_REFUND_MIN_HOURS,
    });
  }

  const paidClassId = paidClassOf(enrollment);
  const crossClass = target.classId !== paidClassId;

  const transferred = await prisma.$transaction(async (tx) => {
    // Lock order: memberQuota -> memberClass -> schedule (giống bookClass).
    await lockMemberQuota(tx, enrollment.memberId);
    // BR-09: serialize mọi transfer của cùng (member × khóa đã trả tiền).
    await lockMemberClass(tx, enrollment.memberId, paidClassId);
    await lockSchedule(tx, targetScheduleId);

    if (role === "MEMBER") {
      const used = await countTransfers(tx, enrollment.memberId, paidClassId);
      if (used >= MAX_TRANSFERS_PER_COURSE) {
        throw new AppError(
          `Bạn đã dùng hết ${MAX_TRANSFERS_PER_COURSE} lần đổi buổi của khóa này.`,
          400,
          { code: "TRANSFER_LIMIT", max: MAX_TRANSFERS_PER_COURSE }
        );
      }
    }

    // Nhả chỗ cũ bằng compare-and-set ngay trong lock: chỉ thành công khi vẫn BOOKED.
    const released = await tx.enrollment.updateMany({
      where: { id: enrollment.id, memberId: enrollment.memberId, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (released.count !== 1)
      throw new AppError(
        "Enrollment is no longer BOOKED (it may have been transferred or cancelled already)",
        409
      );

    const existingTarget = await assertCanBook(tx, enrollment.memberId, target, {
      excludeEnrollmentId: enrollment.id,
      quotaExemptClassId: paidClassId,
      paidClassId,
    });

    const enrollmentInclude = { schedule: { include: { class: true, room: true } } };
    const transferData = {
      status: "BOOKED" as const,
      bookedAt: new Date(),
      cancelledAt: null,
      sourceClassId: crossClass ? paidClassId : null,
      transferredFromId: enrollment.id,
    };
    return existingTarget
      ? tx.enrollment.update({ where: { id: existingTarget.id }, data: transferData, include: enrollmentInclude })
      : tx.enrollment.create({
          data: { memberId: enrollment.memberId, scheduleId: targetScheduleId, ...transferData },
          include: enrollmentInclude,
        });
  });

  // Một notification duy nhất mô tả việc chuyển buổi (tránh gửi kèm CANCELLED gây rối).
  const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  createNotification(
    enrollment.member.userId,
    "ENROLLMENT_CONFIRMED",
    `Đã đổi buổi học: ${target.class.name}`,
    `Bạn đã đổi từ buổi "${enrollment.schedule.class.name}" lúc ${fmt(enrollment.schedule.startTime)} sang ` +
      `"${target.class.name}" lúc ${fmt(target.startTime)} tại ${transferred.schedule.room.name}. Chúc bạn tập luyện vui vẻ!`,
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
}

/**
 * Các buổi hội viên có thể ĐỔI SANG: buổi khác của chính khóa + buổi của khóa tương đương (cùng HLV, cùng hạng),
 * còn SCHEDULED và (với hội viên) còn ≥ 24h. Mỗi buổi kèm khóa, thứ/giờ VN, phòng, chỗ trống, xung đột lịch.
 * `date=YYYY-MM-DD` / `weekday=1..7` (tùy chọn) để lọc.
 */
export async function getTransferOptions(
  enrollmentId: string,
  userId: string,
  role: string,
  filter: { date?: string; weekday?: number } = {}
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { member: true, schedule: { include: { class: true, room: true } } },
  });
  if (!enrollment) throw new AppError("Enrollment not found", 404);
  if (role === "MEMBER" && enrollment.member.userId !== userId)
    throw new AppError("Forbidden: You can only view your own enrollments", 403);
  if (role === "COACH") throw new AppError("Forbidden", 403);

  const now = new Date();
  const minMs = SESSION_REFUND_MIN_HOURS * 3_600_000;
  const paidClassId = paidClassOf(enrollment);
  const transfersUsed = await countTransfers(prisma, enrollment.memberId, paidClassId);
  const hoursLeft = (enrollment.schedule.startTime.getTime() - now.getTime()) / 3_600_000;
  let canTransfer = true;
  let blockReason: string | null = null;
  if (enrollment.status !== "BOOKED") { canTransfer = false; blockReason = "ENROLLMENT_NOT_BOOKED"; }
  else if (hoursLeft <= 0) { canTransfer = false; blockReason = "SESSION_ALREADY_STARTED"; }
  else if (role === "MEMBER" && hoursLeft < SESSION_REFUND_MIN_HOURS) { canTransfer = false; blockReason = "ENROLLMENT_TRANSFER_TOO_LATE"; }
  else if (role === "MEMBER" && transfersUsed >= MAX_TRANSFERS_PER_COURSE) { canTransfer = false; blockReason = "TRANSFER_LIMIT"; }

  const cls = enrollment.schedule.class;
  const earliest = role === "MEMBER" ? new Date(now.getTime() + minMs) : now;
  const [targets, mine] = await Promise.all([
    prisma.classSchedule.findMany({
      where: {
        status: "SCHEDULED",
        startTime: { gt: earliest },
        id: { not: enrollment.scheduleId },
        OR: [
          { classId: { in: [...new Set([enrollment.schedule.classId, paidClassId])] } },
          { class: { coachId: cls.coachId, classType: cls.classType, status: "APPROVED", isActive: true } },
        ],
      },
      include: {
        room: { select: { id: true, name: true, location: true, floor: true } },
        class: { select: { id: true, name: true, capacity: true } },
        _count: { select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } } },
      },
      orderBy: { startTime: "asc" },
      take: 200,
    }),
    prisma.enrollment.findMany({
      where: { memberId: enrollment.memberId, status: { in: ["BOOKED", "COMPLETED"] }, id: { not: enrollment.id }, schedule: { status: "SCHEDULED", startTime: { gt: now } } },
      select: { schedule: { select: { id: true, startTime: true, endTime: true, class: { select: { name: true } } } } },
    }),
  ]);

  const curKey = vnDateKey(enrollment.schedule.startTime);
  const options = targets
    .map((t) => {
      const capacity = t.class.capacity;
      const booked = t._count.enrollments;
      const alreadyMine = mine.some((m) => m.schedule.id === t.id);
      const conflict = mine.find((m) => m.schedule.startTime < t.endTime && m.schedule.endTime > t.startTime);
      const isFull = booked >= capacity;
      return {
        scheduleId: t.id,
        classId: t.class.id,
        className: t.class.name,
        /** true = buổi của chính khóa đã mua; false = khóa tương đương cùng HLV. */
        isSameClass: t.classId === paidClassId || t.classId === enrollment.schedule.classId,
        date: vnDateKey(t.startTime),
        weekday: vnWeekdayIso(t.startTime),
        weekdayLabel: vnWeekdayLabel(vnWeekdayIso(t.startTime)),
        startClock: vnClock(t.startTime),
        endClock: vnClock(t.endTime),
        startTime: t.startTime,
        endTime: t.endTime,
        room: t.room,
        capacity,
        bookedCount: booked,
        remainingSlots: Math.max(0, capacity - booked),
        isFull,
        sameDay: vnDateKey(t.startTime) === curKey,
        isMakeup: !!t.makeupForId,
        alreadyBooked: alreadyMine,
        conflictWith: conflict ? { scheduleId: conflict.schedule.id, className: conflict.schedule.class.name } : null,
        canSelect: canTransfer && !isFull && !alreadyMine && !conflict,
      };
    })
    .filter((o) => !o.alreadyBooked)
    .filter((o) => (filter.date ? o.date === filter.date : true) && (filter.weekday ? o.weekday === filter.weekday : true));

  return {
    enrollmentId,
    canTransfer,
    blockReason,
    minHoursBefore: SESSION_REFUND_MIN_HOURS,
    transfersUsed,
    transfersLeft: Math.max(0, MAX_TRANSFERS_PER_COURSE - transfersUsed),
    maxTransfers: MAX_TRANSFERS_PER_COURSE,
    current: {
      scheduleId: enrollment.scheduleId,
      classId: enrollment.schedule.classId,
      className: cls.name,
      date: curKey,
      weekdayLabel: vnWeekdayLabel(vnWeekdayIso(enrollment.schedule.startTime)),
      startClock: vnClock(enrollment.schedule.startTime),
      endClock: vnClock(enrollment.schedule.endTime),
      room: enrollment.schedule.room ? { id: enrollment.schedule.room.id, name: enrollment.schedule.room.name } : null,
    },
    options,
  };
}
