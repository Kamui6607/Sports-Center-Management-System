import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

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

  // Verify member is enrolled
  const enrollment = await prisma.enrollment.findUnique({
    where: { memberId_scheduleId: { memberId: data.memberId, scheduleId: data.scheduleId } },
  });
  if (!enrollment || (enrollment.status !== "BOOKED" && enrollment.status !== "COMPLETED")) {
    throw new AppError("Member is not actively enrolled in this schedule", 400);
  }

  return prisma.attendance.create({ data });
};

export const getAttendancesBySchedule = async (scheduleId: string) => {
  return prisma.attendance.findMany({ where: { scheduleId }, include: { member: { include: { user: true } } } });
};

export const updateAttendance = async (id: string, data: Prisma.AttendanceUpdateInput, user: any) => {
  const attendance = await prisma.attendance.findUnique({ where: { id } });
  if (!attendance) throw new AppError("Attendance not found", 404);

  await verifyCoachAccess(attendance.scheduleId, user);
  return prisma.attendance.update({ where: { id }, data });
};

export const generateQrToken = async (scheduleId: string, user: any) => {
  // 1. Check if the coach is authorized for this schedule
  await verifyCoachAccess(scheduleId, user);

  // 2. Generate a very short-lived JWT (e.g. 1 minute)
  // This prevents screenshotting the QR and sharing it to people at home
  const payload = {
    scheduleId,
    coachId: user.id,
    type: "ATTENDANCE_QR"
  };
  
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '1m' });
  return { qrToken: token, expiresIn: 60 };
};

export const scanQr = async (qrToken: string, user: any) => {
  if (user.role !== "MEMBER") {
    throw new AppError("Only members can scan attendance QR codes", 403);
  }

  // 1. Verify token
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

  const scheduleId = payload.scheduleId;

  // 2. Find Member Profile
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
  if (!memberProfile) throw new AppError("Không tìm thấy hồ sơ hội viên.", 404);

  // 3. Check Enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: { memberId_scheduleId: { memberId: memberProfile.id, scheduleId } }
  });

  if (!enrollment || (enrollment.status !== "BOOKED" && enrollment.status !== "COMPLETED")) {
    throw new AppError("Bạn chưa đặt chỗ cho lớp học này nên không thể điểm danh.", 403);
  }

  // Chốt chặn 2: Kiểm tra lại gói tập còn hạn tại thời điểm quét QR
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

  // 4. Mark Attendance
  const attendance = await prisma.attendance.upsert({
    where: { scheduleId_memberId: { memberId: memberProfile.id, scheduleId } },
    create: {
      scheduleId,
      memberId: memberProfile.id,
      status: "PRESENT",
      note: "Tự động điểm danh qua QR"
    },
    update: {
      status: "PRESENT",
      note: "Tự động điểm danh qua QR"
    }
  });

  return attendance;
};