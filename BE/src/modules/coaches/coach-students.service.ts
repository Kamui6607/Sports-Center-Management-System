import path from "path";
import fs from "fs";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { CV_UPLOAD_DIR } from "../../middlewares/upload.js";

/**
 * BE-19: Hồ sơ một học viên trong các khóa của HLV đang đăng nhập + chuyên cần theo từng khóa
 * + lộ trình HLV đã lập cho học viên. Học viên không học khóa nào của HLV ⇒ 403.
 */
export async function getMyStudent(coachUserId: string, memberId: string, now = new Date()) {
  const coach = await prisma.coachProfile.findUnique({ where: { userId: coachUserId }, select: { id: true } });
  if (!coach) throw new AppError("Coach profile not found", 404);

  const member = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: memberId }, { userId: memberId }] },
    include: {
      user: {
        select: { id: true, email: true, fullName: true, phone: true, gender: true, dateOfBirth: true, avatarUrl: true },
      },
    },
  });
  if (!member) throw new AppError("Member not found", 404);

  const enrollments = await prisma.enrollment.findMany({
    where: { memberId: member.id, status: { in: ["BOOKED", "COMPLETED"] }, schedule: { class: { coachId: coach.id } } },
    select: {
      scheduleId: true,
      schedule: {
        select: {
          classId: true,
          startTime: true,
          endTime: true,
          status: true,
          makeupForId: true,
          room: { select: { name: true } },
          class: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { schedule: { startTime: "asc" } },
  });
  if (enrollments.length === 0) throw new AppError("Học viên không thuộc khóa học của bạn.", 403);

  const attendance = await prisma.attendance.findMany({
    where: { memberId: member.id, scheduleId: { in: enrollments.map((e) => e.scheduleId) } },
    select: { scheduleId: true, status: true, note: true },
  });
  const recordBySchedule = new Map(attendance.map((a) => [a.scheduleId, a]));

  /** Chuyên cần RIÊNG từng khóa: số buổi có mặt / trễ / vắng / có phép / chưa điểm danh / sắp tới + từng buổi. */
  type ClassStat = {
    classId: string;
    className: string;
    attended: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    notMarked: number;
    upcoming: number;
    pastSessions: number;
    sessions: {
      scheduleId: string;
      startTime: Date;
      endTime: Date;
      roomName: string;
      isMakeup: boolean;
      /** PRESENT | LATE | ABSENT | EXCUSED | NOT_MARKED (đã qua chưa điểm danh) | UPCOMING | CANCELLED */
      status: string;
      note: string | null;
    }[];
  };
  const byClass = new Map<string, ClassStat>();
  for (const e of enrollments) {
    const cls = e.schedule.class;
    const stat =
      byClass.get(cls.id) ??
      { classId: cls.id, className: cls.name, attended: 0, present: 0, late: 0, absent: 0, excused: 0, notMarked: 0, upcoming: 0, pastSessions: 0, sessions: [] };
    const rec = recordBySchedule.get(e.scheduleId);
    let status: string;
    if (e.schedule.status === "CANCELLED") status = "CANCELLED";
    else if (e.schedule.endTime > now) {
      status = "UPCOMING";
      stat.upcoming++;
    } else {
      status = rec?.status ?? "NOT_MARKED";
      // L5: buổi "vắng có phép" không tính vào tỷ lệ chuyên cần.
      if (status === "EXCUSED") stat.excused++;
      else {
        stat.pastSessions++;
        if (status === "PRESENT") stat.present++;
        else if (status === "LATE") stat.late++;
        else if (status === "ABSENT") stat.absent++;
        else stat.notMarked++;
        if (status === "PRESENT" || status === "LATE") stat.attended++;
      }
    }
    stat.sessions.push({
      scheduleId: e.scheduleId,
      startTime: e.schedule.startTime,
      endTime: e.schedule.endTime,
      roomName: e.schedule.room.name,
      isMakeup: e.schedule.makeupForId !== null,
      status,
      note: rec?.note ?? null,
    });
    byClass.set(cls.id, stat);
  }

  const plans = await prisma.trainingPlan.findMany({
    where: { memberId: member.id, coachId: coach.id },
    include: {
      coach: { include: { user: { select: { id: true, fullName: true } } } },
      class: { select: { id: true, name: true } },
      results: { orderBy: { date: "asc" } },
    },
    orderBy: { startDate: "desc" },
  });

  const classes = [...byClass.values()];
  return {
    member: {
      id: member.id,
      userId: member.userId,
      fitnessGoal: member.fitnessGoal,
      fitnessGoals: member.fitnessGoals,
      trainingLevel: member.trainingLevel,
      trainingPreference: member.trainingPreference,
      user: member.user,
    },
    attendedCount: classes.reduce((s, c) => s + c.attended, 0),
    pastSessionCount: classes.reduce((s, c) => s + c.pastSessions, 0),
    classes,
    plans,
  };
}

/**
 * BE-8: đường dẫn tuyệt đối tới file CV (chỉ trong `uploads/cvs`) — MANAGER hoặc chính HLV.
 */
export async function getCvFile(profileId: string, actor: { id: string; role: string }) {
  const profile = await prisma.coachProfile.findUnique({
    where: { id: profileId },
    select: { userId: true, certification: { select: { fileUrl: true } } },
  });
  if (!profile) throw new AppError("Coach profile not found", 404);
  if (actor.role !== "MANAGER" && profile.userId !== actor.id) throw new AppError("Forbidden", 403);

  const fileUrl = profile.certification?.fileUrl;
  if (!fileUrl) throw new AppError("Coach chưa nộp CV.", 404);
  const root = path.resolve(CV_UPLOAD_DIR);
  const filePath = path.resolve(fileUrl);
  // Chặn path traversal: chỉ phục vụ file nằm trong thư mục CV.
  if (!filePath.startsWith(root + path.sep)) throw new AppError("CV file not found", 404);
  if (!fs.existsSync(filePath)) throw new AppError("CV file not found on storage", 404);
  return { filePath, fileName: path.basename(filePath) };
}
