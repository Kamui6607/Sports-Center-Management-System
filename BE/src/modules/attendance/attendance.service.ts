import { randomInt } from "crypto";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { ATTENDANCE } from "../../config/attendance.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";
import { computeAttendanceBuckets } from "./attendance-analytics.service.js";
import { expireStalePenalties } from "./attendance-penalties.service.js";

/** §5: MEMBER không có quyền ghi attendance; COACH không được tự set EXCUSED — chỉ MANAGER. */
function assertCanSetExcused(status: unknown, user: any) {
  if (status === "EXCUSED" && user?.role !== "MANAGER") {
    throw new AppError("Forbidden: chỉ MANAGER được xác nhận vắng có phép (EXCUSED)", 403);
  }
}

async function verifyCoachAccess(scheduleId: string, user: any) {
  if (user.role === "MANAGER" || user.role === "STAFF") return true;

  const schedule = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    include: { class: { include: { coaches: true } } },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);

  if (user.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
    if (!coachProfile) throw new AppError("Coach profile not found", 404);
    
    const isAssigned = schedule.class.coaches.some(c => c.coachId === coachProfile.id);
    if (!isAssigned) throw new AppError("Forbidden: You are not assigned to this class", 403);
  }
}

export const createAttendance = async (data: Prisma.AttendanceUncheckedCreateInput, user: any) => {
  await verifyCoachAccess(data.scheduleId, user);
  assertCanSetExcused(data.status, user);

  // Verify member is enrolled
  const enrollment = await prisma.enrollment.findUnique({
    where: { memberId_scheduleId: { memberId: data.memberId, scheduleId: data.scheduleId } },
  });
  if (!enrollment || (enrollment.status !== "BOOKED" && enrollment.status !== "COMPLETED")) {
    throw new AppError("Member is not actively enrolled in this schedule", 400);
  }

  return prisma.attendance.create({ data });
};

/**
 * §16: roster attendance.
 * - MANAGER / STAFF: xem toàn bộ roster (STAFF read-only — khớp UI tiếp nhận hiện có, mutations vẫn COACH/MANAGER).
 * - COACH: chỉ lớp mình phụ trách (403 nếu không).
 * - MEMBER: chỉ trả về bản ghi điểm danh của CHÍNH MÌNH (tương thích FE member hiện tại + không lộ roster).
 */
export const getAttendancesBySchedule = async (
  scheduleId: string,
  actor: { id: string; role: string }
) => {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    include: { class: { include: { coaches: true } } },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);

  if (actor.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
    const isAssigned =
      Boolean(coachProfile) && schedule.class.coaches.some((c) => c.coachId === coachProfile!.id);
    if (!isAssigned) throw new AppError("Forbidden: You are not assigned to this class", 403);
  } else if (actor.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: actor.id } });
    if (!memberProfile) throw new AppError("Member profile not found", 404);
    return prisma.attendance.findMany({
      where: { scheduleId, memberId: memberProfile.id },
      include: { member: { include: { user: true } } },
    });
  } else if (actor.role !== "MANAGER" && actor.role !== "STAFF") {
    throw new AppError("Forbidden: bạn không có quyền xem điểm danh của buổi này", 403);
  }

  return prisma.attendance.findMany({ where: { scheduleId }, include: { member: { include: { user: true } } } });
};

export const updateAttendance = async (id: string, data: Prisma.AttendanceUpdateInput, user: any) => {
  const attendance = await prisma.attendance.findUnique({ where: { id } });
  if (!attendance) throw new AppError("Attendance not found", 404);

  await verifyCoachAccess(attendance.scheduleId, user);
  assertCanSetExcused((data as { status?: unknown }).status, user);
  return prisma.attendance.update({ where: { id }, data });
};

// ─── QR + MÃ DỰ PHÒNG NHẬP TAY (camera hỏng) ────────────────────────────────

/** Message dùng chung cho mọi trường hợp mã sai/hết hạn/thu hồi — không lộ mã có tồn tại hay không. */
const MANUAL_CODE_INVALID_MESSAGE = "Mã điểm danh không hợp lệ hoặc đã hết hạn.";
const MANUAL_CODE_REVOKED_MESSAGE =
  "Mã điểm danh không hợp lệ hoặc đã hết hạn. Mã đã bị vô hiệu, vui lòng nhờ HLV tạo mã mới.";

export type AttendanceCredential = { scheduleId: string; manualCodeId?: string };

/** Sinh mã dự phòng từ alphabet không gây nhầm khi gõ tay (không 0/O/1/I). */
function generateManualCodeValue(): string {
  const alphabet = ATTENDANCE.MANUAL_CODE_ALPHABET;
  let code = "";
  for (let i = 0; i < ATTENDANCE.MANUAL_CODE_LENGTH; i++) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

/**
 * Cấp mã dự phòng mới cho buổi học: mọi mã cũ còn hiệu lực của CÙNG schedule bị thu hồi
 * để tại mỗi thời điểm chỉ có đúng 1 mã hợp lệ / buổi (chống chia sẻ nhiều mã song song).
 */
async function createManualCode(scheduleId: string, createdBy: string) {
  const now = new Date();
  await prisma.attendanceManualCode.updateMany({
    where: { scheduleId, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });

  const expiresAt = new Date(now.getTime() + ATTENDANCE.MANUAL_CODE_TTL_SECONDS * 1000);
  for (let retry = 0; retry < 5; retry++) {
    try {
      return await prisma.attendanceManualCode.create({
        data: { code: generateManualCodeValue(), scheduleId, createdBy, expiresAt },
      });
    } catch (err) {
      // Trùng mã (xác suất rất thấp) → sinh lại; mọi lỗi khác phải nổi lên trên.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new AppError("Không tạo được mã điểm danh dự phòng, vui lòng thử lại.", 500);
}

/** Ghi nhận 1 lần mã bị dùng KHÔNG thành công; chạm ngưỡng → thu hồi mã (trả true). */
async function registerManualCodeMisuse(codeId: string): Promise<boolean> {
  const updated = await prisma.attendanceManualCode.update({
    where: { id: codeId },
    data: { attempts: { increment: 1 } },
    select: { attempts: true, revokedAt: true },
  });
  if (updated.attempts < ATTENDANCE.MANUAL_CODE_MAX_ATTEMPTS || updated.revokedAt) return false;
  await prisma.attendanceManualCode.update({
    where: { id: codeId },
    data: { revokedAt: new Date() },
  });
  return true;
}

/** QR JWT → scheduleId. Giữ nguyên message/HTTP status của luồng QR cũ. */
function resolveScheduleIdFromQrToken(qrToken: string): string {
  let payload: any;
  try {
    payload = jwt.verify(qrToken, env.JWT_ACCESS_SECRET);
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new AppError("Mã QR đã hết hạn. Yêu cầu HLV mở mã mới.", 400);
    }
    throw new AppError("Mã QR không hợp lệ.", 400);
  }

  if (payload.type !== "ATTENDANCE_QR" || !payload.scheduleId) {
    throw new AppError("Mã QR không hợp lệ cho điểm danh.", 400);
  }
  return payload.scheduleId as string;
}

/** Rate-limit theo member: nhập sai đủ nhiều trong cửa sổ cấu hình → 429. */
async function assertManualCodeAttemptsAllowed(memberId: string): Promise<void> {
  const since = new Date(Date.now() - ATTENDANCE.MEMBER_MANUAL_CODE_WINDOW_MINUTES * 60 * 1000);
  const failures = await prisma.attendanceManualCodeAttempt.count({
    where: { memberId, success: false, createdAt: { gte: since } },
  });
  if (failures >= ATTENDANCE.MEMBER_MANUAL_CODE_MAX_FAILURES) {
    throw new AppError(
      "Bạn đã nhập sai mã điểm danh quá nhiều lần. Vui lòng thử lại sau hoặc nhờ HLV điểm danh trực tiếp.",
      429
    );
  }
}

/**
 * Mã dự phòng → buổi học, kèm rate-limit 2 lớp:
 * - theo member: sai đủ `MEMBER_MANUAL_CODE_MAX_FAILURES` lần trong cửa sổ → 429.
 * - theo code: mã bị dùng hỏng đủ `MANUAL_CODE_MAX_ATTEMPTS` lần → thu hồi mã.
 * Sai/hết hạn/thu hồi/không tồn tại dùng CÙNG một message để không lộ thông tin.
 */
async function resolveManualCode(rawCode: string, memberId: string): Promise<AttendanceCredential> {
  await assertManualCodeAttemptsAllowed(memberId);

  const now = new Date();
  const record = await prisma.attendanceManualCode.findUnique({
    where: { code: rawCode.trim().toUpperCase() },
  });

  if (record && !record.revokedAt && record.expiresAt > now) {
    await prisma.attendanceManualCodeAttempt.create({
      data: { memberId, codeId: record.id, success: true },
    });
    return { scheduleId: record.scheduleId, manualCodeId: record.id };
  }

  await prisma.attendanceManualCodeAttempt.create({
    data: { memberId, codeId: record?.id ?? null, success: false },
  });
  if (record && (await registerManualCodeMisuse(record.id))) {
    throw new AppError(MANUAL_CODE_REVOKED_MESSAGE, 429);
  }
  throw new AppError(MANUAL_CODE_INVALID_MESSAGE, 400);
}

export const generateQrToken = async (scheduleId: string, user: any) => {
  // 1. Check if the coach is authorized for this schedule
  await verifyCoachAccess(scheduleId, user);

  // 2. QR là JWT sống 10 phút (ATTENDANCE.QR_TTL_SECONDS): hạn chế screenshot chia sẻ,
  //    FE tự làm mới mã mỗi 55 giây. TTL nằm ở config, không hard-code.
  const payload = {
    scheduleId,
    coachId: user.id,
    type: "ATTENDANCE_QR"
  };
  
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ATTENDANCE.QR_TTL_SECONDS });

  // 3. Cấp kèm mã dự phòng nhập tay cho member không quét được QR (camera hỏng).
  //    Mã cũ còn hiệu lực của cùng buổi học bị thu hồi khi mã mới được cấp.
  const manualCode = await createManualCode(scheduleId, user.id);

  return {
    qrToken: token,
    expiresIn: ATTENDANCE.QR_TTL_SECONDS,
    manualCode: manualCode.code,
    manualCodeExpiresIn: ATTENDANCE.MANUAL_CODE_TTL_SECONDS,
  };
};

/**
 * Điểm danh self-service cho MEMBER bằng ĐÚNG MỘT trong hai credential:
 * - `qrToken`: JWT trong mã QR (luồng cũ, giữ nguyên semantics).
 * - `code`: mã dự phòng 6 ký tự cho member không quét được QR (camera hỏng).
 *
 * Member KHÔNG gửi `scheduleId` — buổi học chỉ được suy ra từ credential (schema .strict()).
 * Mọi chốt chặn cũ giữ nguyên: enrollment BOOKED/COMPLETED + gói tập ACTIVE tại thời điểm điểm danh.
 */
export const scanQr = async (input: { qrToken?: string; code?: string }, user: any) => {
  if (user.role !== "MEMBER") {
    throw new AppError("Only members can scan attendance QR codes", 403);
  }

  // 1. Find Member Profile
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
  if (!memberProfile) throw new AppError("Không tìm thấy hồ sơ hội viên.", 404);

  // 2. Resolve buổi học từ bằng chứng member gửi lên: QR token hoặc mã dự phòng.
  const resolved: AttendanceCredential = input.code
    ? await resolveManualCode(input.code, memberProfile.id)
    : { scheduleId: resolveScheduleIdFromQrToken(input.qrToken as string) };
  const { scheduleId } = resolved;

  // 3. Check Enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: { memberId_scheduleId: { memberId: memberProfile.id, scheduleId } }
  });

  if (!enrollment || (enrollment.status !== "BOOKED" && enrollment.status !== "COMPLETED")) {
    // Mã dự phòng bị người KHÔNG đặt chỗ dùng → coi là lạm dụng mã; đủ ngưỡng thì thu hồi mã.
    if (resolved.manualCodeId && (await registerManualCodeMisuse(resolved.manualCodeId))) {
      throw new AppError(MANUAL_CODE_REVOKED_MESSAGE, 429);
    }
    throw new AppError("Bạn chưa đặt chỗ cho lớp học này nên không thể điểm danh.", 403);
  }

  // Chốt chặn 2: Kiểm tra lại gói tập còn hạn tại thời điểm điểm danh
  const now = new Date();
  const activeSub = await prisma.membershipSubscription.findFirst({
    where: {
      memberId: memberProfile.id,
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });

  if (!activeSub) {
    throw new AppError(
      "Gói tập của bạn đã hết hạn. Vui lòng gia hạn để có thể vào lớp học.",
      403
    );
  }

  // 4. Mark Attendance — note phân biệt nguồn điểm danh (QR vs mã dự phòng).
  const note = resolved.manualCodeId ? ATTENDANCE.MANUAL_CODE_NOTE : ATTENDANCE.QR_NOTE;
  const attendance = await prisma.attendance.upsert({
    where: { scheduleId_memberId: { memberId: memberProfile.id, scheduleId } },
    create: {
      scheduleId,
      memberId: memberProfile.id,
      status: "PRESENT",
      note
    },
    update: {
      status: "PRESENT",
      note
    }
  });

  return attendance;
};

// ─── MEMBER SELF-SERVICE (§16) + WARNING (§7) ─────────────────────────────

/** Lịch sử điểm danh của chính member (phân trang, lọc theo class/status). */
export const getMyAttendance = async (userId: string, query: any) => {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;
  if (query.classId) where.schedule = { classId: query.classId };

  const [total, records] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { schedule: { startTime: "desc" } },
      include: {
        schedule: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  return { records, pagination: buildPaginationMeta(total, page, limit) };
};

/** Tổng hợp chuyên cần theo (member × class) + penalty của chính member (§23). */
export const getMyAttendanceSummary = async (userId: string) => {
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
    include: { user: { select: { fullName: true } } },
  });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  await expireStalePenalties();
  const [buckets, penalties] = await Promise.all([
    computeAttendanceBuckets(prisma, { memberId: memberProfile.id }),
    prisma.attendancePenalty.findMany({
      where: { memberId: memberProfile.id },
      orderBy: { createdAt: "desc" },
      include: { class: { select: { id: true, name: true } } },
    }),
  ]);

  const now = new Date();
  return {
    memberId: memberProfile.id,
    memberName: memberProfile.user.fullName,
    thresholds: {
      minSample: ATTENDANCE.MIN_SAMPLE,
      warnBelow: ATTENDANCE.WARN_THRESHOLD,
      releaseBelow: ATTENDANCE.RELEASE_THRESHOLD,
      appealWindowHours: ATTENDANCE.APPEAL_WINDOW_HOURS,
    },
    buckets,
    penalties: penalties.map((p) => {
      const decidedAt = p.decidedAt ?? p.createdAt;
      const appealDeadline = new Date(decidedAt.getTime() + ATTENDANCE.APPEAL_WINDOW_HOURS * 3600000);
      return {
        id: p.id,
        classId: p.classId,
        className: p.class.name,
        status: p.status,
        reason: p.reason,
        attendanceRate: p.attendanceRate,
        sampleSize: p.sampleSize,
        releasedCount: p.releasedCount,
        decidedAt: p.decidedAt,
        blockedUntil: p.blockedUntil,
        appealedAt: p.appealedAt,
        appealReason: p.appealReason,
        revokedAt: p.revokedAt,
        appealDeadline,
        canAppeal: p.status === "APPLIED" && !p.appealedAt && now <= appealDeadline,
      };
    }),
  };
};

/**
 * §7 + hardening: gửi warning cho bucket WARN (70% <= rate < 80%).
 *
 * Dedupe theo STATE TRANSITION (không dùng số rate đã format làm identity):
 * - Chưa từng thông báo gì cho (member × class) => OK -> WARN: gửi.
 * - Warning gần nhất vẫn là WARN => KHÔNG gửi lại dù rate nhích (77.8% -> 76.4% -> 75%).
 * - Penalty đã áp dụng sau warning gần nhất (RELEASE) => khi quay về WARN thì gửi lại.
 * - Trạng thái RELEASE không gửi warning (do penalty flow xử lý); state WARN được lưu trong metadata.
 */
export async function scanAttendanceWarnings(classId?: string, now = new Date()) {
  const buckets = await computeAttendanceBuckets(prisma, { classId, now });
  const warnBuckets = buckets.filter((b) => b.status === "WARN");
  let sent = 0;
  let skippedDuplicate = 0;

  for (const bucket of warnBuckets) {
    if (!bucket.memberUserId) continue;
    // Trạng thái chuyên cần gần nhất ĐÃ thông báo cho (member × class):
    // ATTENDANCE_WARNING -> "WARN"; ATTENDANCE_PENALTY -> "RELEASE" (đã bị thu hồi chỗ).
    const lastNotified = await prisma.notification.findFirst({
      where: {
        userId: bucket.memberUserId,
        type: { in: ["ATTENDANCE_WARNING", "ATTENDANCE_PENALTY"] },
        metadata: { path: ["classId"], equals: bucket.classId },
      },
      orderBy: { createdAt: "desc" },
      select: { type: true, metadata: true },
    });
    const lastState =
      lastNotified?.type === "ATTENDANCE_PENALTY"
        ? "RELEASE"
        : ((lastNotified?.metadata as { state?: string } | null)?.state ?? null);

    if (lastState === "WARN") {
      skippedDuplicate++;
      continue;
    }
    await createNotification(
      bucket.memberUserId,
      "ATTENDANCE_WARNING",
      `Cảnh báo chuyên cần: ${bucket.className}`,
      `Chuyên cần của bạn ở lớp "${bucket.className}" hiện là ${bucket.attendanceRate}% trên ${bucket.sampleSize} buổi được tính ` +
        `(${bucket.presentCount} có mặt, ${bucket.lateCount} đi muộn, ${bucket.absentCount} vắng, ${bucket.noShowCount} không điểm danh). ` +
        `Dưới ${ATTENDANCE.WARN_THRESHOLD}% bạn có thể bị thu hồi chỗ đặt. Vui lòng sắp xếp tham gia đầy đủ hoặc gửi khiếu nại nếu có lý do chính đáng.`,
      {
        metadata: {
          classId: bucket.classId,
          state: "WARN",
          attendanceRate: bucket.attendanceRate,
          sampleSize: bucket.sampleSize,
        },
      }
    );
    sent++;
  }

  return { checked: buckets.length, warnBuckets: warnBuckets.length, sent, skippedDuplicate };
}