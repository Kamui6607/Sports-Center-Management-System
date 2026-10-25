import { prisma } from "../../config/prisma.js";
import { COURSE_SALE } from "../../config/course-sale.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { pendingCourseHolds } from "./class-summary.service.js";
import { isPastSaleWindow, saleProgressOf } from "./course-sale.js";

/**
 * Job bảo trì khóa học (Doc/BUSINESS_HARDENING_PLAN.md §1.2) — idempotent (CAS theo `status` / `alertStage`),
 * an toàn khi chạy lặp hoặc nhiều instance:
 * - A. Khóa PENDING mà buổi đầu đã bắt đầu ⇒ tự từ chối (quá hạn duyệt), hủy buổi để nhả phòng.
 * - B/C. Khóa APPROVED chưa có học viên ⇒ báo HLV khi còn 24h tới khai giảng và khi đã khai giảng (mỗi bậc 1 lần).
 * - D. Qua hạn mở bán mà vẫn 0 học viên ⇒ tự đóng: hủy các buổi còn lại (mã NO_ENROLLMENT), khóa → COMPLETED.
 * - E. Mọi buổi chưa hủy đã kết thúc ⇒ khóa → COMPLETED + báo HLV tổng kết.
 * Thông báo dùng loại `GENERAL` + `metadata.kind` (không phải sửa enum trên DB dùng chung).
 */

const HOUR_MS = 3_600_000;
const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/** Bậc cảnh báo "chưa có học viên" (`Class.alertStage`). */
export const NO_STUDENT_ALERT = { PRE_START: 1, STARTED: 2 } as const;

export interface ClassMaintenanceResult {
  reviewExpired: number;
  alertedPreStart: number;
  alertedStarted: number;
  closedNoEnrollment: number;
  completed: number;
}

async function managerIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { role: { name: "MANAGER" }, isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function runClassMaintenance(now = new Date()): Promise<ClassMaintenanceResult> {
  const result: ClassMaintenanceResult = {
    reviewExpired: 0,
    alertedPreStart: 0,
    alertedStarted: 0,
    closedNoEnrollment: 0,
    completed: 0,
  };
  const classes = await prisma.class.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] } },
    select: {
      id: true,
      name: true,
      status: true,
      alertStage: true,
      coach: { select: { userId: true } },
      schedules: { select: { id: true, startTime: true, endTime: true, status: true, makeupForId: true } },
    },
  });
  if (classes.length === 0) return result;

  const ids = classes.map((c) => c.id);
  const [studentRows, holds] = await Promise.all([
    prisma.enrollment.findMany({
      where: { status: { in: ["BOOKED", "COMPLETED"] }, schedule: { classId: { in: ids } } },
      select: { memberId: true, schedule: { select: { classId: true } } },
      distinct: ["memberId", "scheduleId"],
    }),
    pendingCourseHolds(prisma, ids, now),
  ]);
  const students = new Map<string, Set<string>>();
  for (const r of studentRows) {
    const set = students.get(r.schedule.classId) ?? new Set<string>();
    set.add(r.memberId);
    students.set(r.schedule.classId, set);
  }
  let managers: string[] | null = null;

  for (const cls of classes) {
    const live = cls.schedules.filter((s) => s.status !== "CANCELLED").sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const first = live[0];
    const studentCount = students.get(cls.id)?.size ?? 0;
    const held = holds.get(cls.id) ?? 0;

    // ── A. Quá hạn duyệt ─────────────────────────────────────────────────────
    if (cls.status === "PENDING") {
      if (!first || first.startTime > now) continue;
      const done = await prisma.$transaction(async (tx) => {
        const cas = await tx.class.updateMany({
          where: { id: cls.id, status: "PENDING" },
          data: {
            status: "REJECTED",
            rejectReason: "Quá hạn duyệt — buổi khai giảng đã qua. Hãy chỉnh lịch mới và gửi duyệt lại.",
            closedReason: "REVIEW_EXPIRED",
            closedAt: now,
          },
        });
        if (cas.count === 0) return false;
        await tx.classSchedule.updateMany({
          where: { classId: cls.id, status: "SCHEDULED" },
          data: { status: "CANCELLED", cancelCode: "REVIEW_EXPIRED", cancelReason: "Khóa quá hạn duyệt" },
        });
        await enqueueNotification(tx, {
          userId: cls.coach.userId,
          type: "CLASS_REJECTED",
          title: `Khóa học quá hạn duyệt: ${cls.name}`,
          body:
            `Khóa "${cls.name}" chưa được duyệt trước buổi khai giảng (${fmt(first.startTime)}) nên đã tự đóng và nhả phòng. ` +
            `Bạn có thể chỉnh lịch mới rồi gửi duyệt lại.`,
          metadata: { kind: "CLASS_REVIEW_EXPIRED", classId: cls.id },
        });
        managers ??= await managerIds();
        for (const m of managers) {
          await enqueueNotification(tx, {
            userId: m,
            type: "GENERAL",
            title: `Khóa học quá hạn duyệt: ${cls.name}`,
            body: `Khóa "${cls.name}" không được duyệt trước buổi khai giảng nên hệ thống đã tự từ chối.`,
            metadata: { kind: "CLASS_REVIEW_EXPIRED", classId: cls.id },
          });
        }
        return true;
      });
      if (done) result.reviewExpired++;
      continue;
    }

    // ── E. Khóa đã kết thúc (mọi buổi chưa hủy đã qua) ─────────────────────────
    const hasFutureLive = live.some((s) => s.endTime > now);
    if (!hasFutureLive && live.length > 0) {
      const done = await prisma.$transaction(async (tx) => {
        const cas = await tx.class.updateMany({
          where: { id: cls.id, status: "APPROVED" },
          data: { status: "COMPLETED", closedReason: "ENDED", closedAt: now },
        });
        if (cas.count === 0) return false;
        await enqueueNotification(tx, {
          userId: cls.coach.userId,
          type: "GENERAL",
          title: `Khóa học đã kết thúc: ${cls.name}`,
          body:
            `Khóa "${cls.name}" đã diễn ra hết ${live.length} buổi với ${studentCount} học viên. ` +
            `Hãy hoàn tất điểm danh các buổi còn thiếu (nếu có).`,
          metadata: { kind: "CLASS_ENDED", classId: cls.id },
        });
        return true;
      });
      if (done) result.completed++;
      continue;
    }
    if (studentCount > 0 || held > 0 || !first) continue;

    // ── D. Qua hạn mở bán mà 0 học viên ⇒ tự đóng ───────────────────────────────
    if (isPastSaleWindow(saleProgressOf(cls.schedules, now))) {
      const done = await prisma.$transaction(async (tx) => {
        // Đọc lại SAU khi khóa trạng thái: có người vừa mua thì không đóng.
        const cas = await tx.class.updateMany({
          where: { id: cls.id, status: "APPROVED" },
          data: { status: "COMPLETED", closedReason: "NO_ENROLLMENT", closedAt: now },
        });
        if (cas.count === 0) return false;
        const booked = await tx.enrollment.count({
          where: { status: { in: ["BOOKED", "COMPLETED"] }, schedule: { classId: cls.id } },
        });
        if (booked > 0) throw new Error("ROLLBACK_HAS_STUDENTS");
        await tx.classSchedule.updateMany({
          where: { classId: cls.id, status: "SCHEDULED" },
          data: {
            status: "CANCELLED",
            cancelCode: "NO_ENROLLMENT",
            cancelReason: "Khóa không có học viên — hệ thống tự đóng khi hết hạn mở bán",
          },
        });
        await enqueueNotification(tx, {
          userId: cls.coach.userId,
          type: "GENERAL",
          title: `Khóa học đã tự đóng: ${cls.name}`,
          body:
            `Khóa "${cls.name}" đã qua hạn nhận học viên mà chưa có ai đăng ký nên hệ thống tự đóng và nhả phòng. ` +
            `Các buổi bị hủy này KHÔNG tính vào tỷ lệ hủy buổi của bạn. Bạn có thể tạo khóa mới với lịch phù hợp hơn.`,
          metadata: { kind: "CLASS_CLOSED_NO_ENROLLMENT", classId: cls.id },
        });
        managers ??= await managerIds();
        for (const m of managers) {
          await enqueueNotification(tx, {
            userId: m,
            type: "GENERAL",
            title: `Khóa học tự đóng vì không có học viên: ${cls.name}`,
            body: `Khóa "${cls.name}" qua hạn mở bán mà không có học viên — các buổi còn lại đã được hủy, phòng đã nhả.`,
            metadata: { kind: "CLASS_CLOSED_NO_ENROLLMENT", classId: cls.id },
          });
        }
        return true;
      }).catch((err: Error) => {
        if (err.message === "ROLLBACK_HAS_STUDENTS") return false;
        throw err;
      });
      if (done) result.closedNoEnrollment++;
      continue;
    }

    // ── B/C. Cảnh báo HLV: khóa chưa có học viên ───────────────────────────────
    const started = first.startTime <= now;
    const stage = started
      ? NO_STUDENT_ALERT.STARTED
      : first.startTime.getTime() - now.getTime() <= COURSE_SALE.NO_STUDENT_ALERT_HOURS * HOUR_MS
        ? NO_STUDENT_ALERT.PRE_START
        : 0;
    if (stage === 0 || cls.alertStage >= stage) continue;
    const sent = await prisma.$transaction(async (tx) => {
      const cas = await tx.class.updateMany({ where: { id: cls.id, alertStage: { lt: stage } }, data: { alertStage: stage } });
      if (cas.count === 0) return false;
      await enqueueNotification(tx, {
        userId: cls.coach.userId,
        type: "GENERAL",
        title: started ? `Khóa đã khai giảng nhưng chưa có học viên: ${cls.name}` : `Khóa sắp khai giảng chưa có học viên: ${cls.name}`,
        body: started
          ? `Khóa "${cls.name}" đã khai giảng (${fmt(first.startTime)}) mà chưa có học viên nào. Khóa vẫn mở bán tới khi qua ` +
            `${COURSE_SALE.MAX_PROGRESS_PERCENT}% số buổi; sau đó hệ thống sẽ tự đóng nếu vẫn không có ai đăng ký.`
          : `Khóa "${cls.name}" khai giảng lúc ${fmt(first.startTime)} nhưng chưa có học viên. Bạn có thể dời lịch hoặc giới thiệu thêm cho học viên.`,
        metadata: { kind: started ? "CLASS_NO_STUDENT_STARTED" : "CLASS_NO_STUDENT_PRE_START", classId: cls.id },
      });
      return true;
    });
    if (sent) {
      if (started) result.alertedStarted++;
      else result.alertedPreStart++;
    }
  }

  await flushNotificationOutbox().catch(() => {});
  return result;
}
