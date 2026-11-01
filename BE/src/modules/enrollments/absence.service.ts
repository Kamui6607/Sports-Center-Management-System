import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ATTENDANCE, isMemberAbsence, withAbsenceInfo } from "../../config/attendance.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockMemberClass } from "../../utils/dbLocks.js";
import { createNotification } from "../notifications/notifications.service.js";
import { createMakeupRequestTx, notifyCoachMakeupRequested, releaseMakeupForMissedTx } from "../makeup-requests/makeup-requests.service.js";

type Db = typeof prisma | Prisma.TransactionClient;

/** Bản ghi EXCUSED do học viên tự báo vắng (lọc Prisma). */
export const MEMBER_ABSENCE_WHERE = {
  status: "EXCUSED",
  note: { startsWith: ATTENDANCE.MEMBER_ABSENCE_NOTE_PREFIX },
} satisfies Prisma.AttendanceWhereInput;

/** Chỗ đổi sang khóa tương đương vẫn tính theo khóa đã trả tiền. */
const paidClassOf = (e: { sourceClassId: string | null; schedule: { classId: string } }) => e.sourceClassId ?? e.schedule.classId;

/** Số lần báo vắng CÒN HIỆU LỰC của hội viên trong một khóa đã mua. */
export async function countMemberAbsences(db: Db, memberId: string, paidClassId: string) {
  return db.attendance.count({
    where: {
      memberId,
      ...MEMBER_ABSENCE_WHERE,
      schedule: {
        enrollments: {
          some: {
            memberId,
            OR: [{ sourceClassId: paidClassId }, { sourceClassId: null, schedule: { classId: paidClassId } }],
          },
        },
      },
    },
  });
}

/**
 * Xóa báo vắng của hội viên ở một buổi (khi hủy chỗ / đổi buổi — chỗ không còn ở buổi đó).
 * Yêu cầu học bù đang chờ ⇒ hủy theo; đã xếp học bù ⇒ 409 (phải hủy buổi học bù trước).
 */
export async function clearMemberAbsenceTx(tx: Prisma.TransactionClient, memberId: string, scheduleId: string) {
  await releaseMakeupForMissedTx(tx, memberId, scheduleId);
  await tx.attendance.deleteMany({ where: { memberId, scheduleId, ...MEMBER_ABSENCE_WHERE } });
}

async function loadOwnEnrollment(enrollmentId: string, userId: string) {
  const e = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      member: { select: { userId: true, user: { select: { fullName: true } } } },
      schedule: { include: { class: { select: { id: true, name: true, coach: { select: { userId: true } } } } } },
    },
  });
  if (!e) throw new AppError("Enrollment not found", 404);
  if (e.member.userId !== userId) throw new AppError("Forbidden: You can only manage your own enrollments", 403);
  return e;
}

function absenceSummary(used: number) {
  const max = ATTENDANCE.MEMBER_ABSENCE_MAX_PER_COURSE;
  return { used, max, left: Math.max(0, max - used) };
}

/** Lượt báo vắng của khóa chứa chỗ này (dùng cho `transfer-options` / màn chi tiết buổi). */
export async function absenceQuotaOf(e: { memberId: string; sourceClassId: string | null; schedule: { classId: string } }) {
  return absenceSummary(await countMemberAbsences(prisma, e.memberId, paidClassOf(e)));
}

const fmtSession = (d: Date) =>
  d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/**
 * Học viên BÁO VẮNG một buổi đang giữ chỗ (Doc/MAKEUP_ABSENCE_PLAN.md §3.1):
 * - Bất cứ lúc nào TRƯỚC giờ bắt đầu; buổi phải SCHEDULED; chưa có bản ghi điểm danh.
 * - Ghi `EXCUSED` (không tính chuyên cần / phạt), chỗ vẫn `BOOKED`, không hoàn tiền.
 * - Tối đa `MEMBER_ABSENCE_MAX_PER_COURSE` lần còn hiệu lực / khóa đã mua (khóa theo member × khóa).
 * - HLV phụ trách khóa nhận thông báo.
 * - `requestMakeup` ⇒ tạo luôn yêu cầu học bù (Doc/MAKEUP_ABSENCE_PLAN.md §3.3).
 */
export async function reportAbsence(enrollmentId: string, userId: string, input: { reason: string; requestMakeup?: boolean }) {
  const e = await loadOwnEnrollment(enrollmentId, userId);
  if (e.status !== "BOOKED") throw new AppError("Chỉ báo vắng được buổi đang giữ chỗ.", 400, { code: "ENROLLMENT_NOT_BOOKED" });
  if (e.schedule.status !== "SCHEDULED") throw new AppError("Buổi học không còn mở.", 400, { code: "SCHEDULE_NOT_OPEN" });
  if (e.schedule.startTime <= new Date()) {
    throw new AppError("Chỉ báo vắng được trước giờ học.", 400, { code: "ABSENCE_TOO_LATE" });
  }
  const paidClassId = paidClassOf(e);
  const reason = input.reason.trim();

  const { record, used, makeup } = await prisma.$transaction(async (tx) => {
    await lockMemberClass(tx, e.memberId, paidClassId);
    const existing = await tx.attendance.findUnique({
      where: { scheduleId_memberId: { scheduleId: e.scheduleId, memberId: e.memberId } },
    });
    if (existing) {
      throw isMemberAbsence(existing.note)
        ? new AppError("Bạn đã báo vắng buổi này.", 409, { code: "ABSENCE_ALREADY_REPORTED" })
        : new AppError("Buổi này đã được điểm danh.", 409, { code: "ATTENDANCE_ALREADY_RECORDED", status: existing.status });
    }
    const usedBefore = await countMemberAbsences(tx, e.memberId, paidClassId);
    if (usedBefore >= ATTENDANCE.MEMBER_ABSENCE_MAX_PER_COURSE) {
      throw new AppError(
        `Bạn đã báo vắng ${ATTENDANCE.MEMBER_ABSENCE_MAX_PER_COURSE} lần cho khóa này.`,
        400,
        { code: "ABSENCE_LIMIT", max: ATTENDANCE.MEMBER_ABSENCE_MAX_PER_COURSE, used: usedBefore }
      );
    }
    const created = await tx.attendance.create({
      data: {
        scheduleId: e.scheduleId,
        memberId: e.memberId,
        status: "EXCUSED",
        note: `${ATTENDANCE.MEMBER_ABSENCE_NOTE_PREFIX}${reason}`,
      },
    });
    const req = input.requestMakeup ? await createMakeupRequestTx(tx, e, reason) : null;
    return { record: created, used: usedBefore + 1, makeup: req };
  });

  if (makeup) {
    notifyCoachMakeupRequested(makeup.coachUserId, e.member.user.fullName, makeup.className, e.schedule.startTime, makeup.request.id);
  } else {
    createNotification(
      e.schedule.class.coach.userId,
      "MEMBER_ABSENCE",
      `Học viên báo vắng: ${e.schedule.class.name}`,
      `${e.member.user.fullName} báo vắng buổi ${fmtSession(e.schedule.startTime)}. Lý do: ${reason}`,
      { metadata: { scheduleId: e.scheduleId, classId: e.schedule.classId, memberId: e.memberId, enrollmentId: e.id } }
    ).catch(() => {});
  }

  return {
    attendance: withAbsenceInfo(record),
    absence: absenceSummary(used),
    makeupRequestId: makeup?.request.id ?? null,
  };
}

/** Học viên HỦY BÁO VẮNG trước giờ học ⇒ xóa bản ghi EXCUSED do chính mình tạo (lượt báo vắng được trả lại). */
export async function cancelAbsence(enrollmentId: string, userId: string) {
  const e = await loadOwnEnrollment(enrollmentId, userId);
  if (e.schedule.startTime <= new Date()) {
    throw new AppError("Buổi học đã bắt đầu — không hủy báo vắng được nữa.", 400, { code: "ABSENCE_TOO_LATE" });
  }
  const removed = await prisma.$transaction(async (tx) => {
    await lockMemberClass(tx, e.memberId, paidClassOf(e));
    await releaseMakeupForMissedTx(tx, e.memberId, e.scheduleId);
    return tx.attendance.deleteMany({ where: { scheduleId: e.scheduleId, memberId: e.memberId, ...MEMBER_ABSENCE_WHERE } });
  });
  if (removed.count === 0) throw new AppError("Bạn chưa báo vắng buổi này.", 404, { code: "ABSENCE_NOT_FOUND" });
  return { absence: await absenceQuotaOf(e) };
}
