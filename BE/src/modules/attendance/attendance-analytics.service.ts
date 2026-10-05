import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import {
  ATTENDANCE,
  classifyAttendance,
  isSystemNoShow,
  type AttendanceBucketStatus,
} from "../../config/attendance.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type AttendanceBucket = {
  memberId: string;
  memberName: string;
  memberUserId: string;
  classId: string;
  className: string;
  sampleSize: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  noShowCount: number;
  excusedCount: number;
  attendanceRate: number;
  status: AttendanceBucketStatus;
};

export async function computeAttendanceBuckets(
  db: DbClient,
  options: { memberId?: string; classId?: string; now?: Date } = {}
): Promise<AttendanceBucket[]> {
  const now = options.now ?? new Date();

  const enrollments = await db.enrollment.findMany({
    where: {
      status: { in: ["BOOKED", "COMPLETED"] },
      ...(options.memberId ? { memberId: options.memberId } : {}),
      schedule: {
        status: { not: "CANCELLED" },
        endTime: { lte: now },
        // Lớp của enrollment lấy qua buổi học (Enrollment không lưu classId).
        ...(options.classId ? { classId: options.classId } : {}),
      },
    },
    select: {
      memberId: true,
      schedule: { select: { id: true, startTime: true, classId: true } },
    },
    orderBy: { schedule: { startTime: "desc" } },
  });
  if (enrollments.length === 0) return [];

  const grouped = new Map<
    string,
    { memberId: string; classId: string; schedules: { id: string; startTime: Date }[] }
  >();
  for (const e of enrollments) {
    const key = `${e.memberId}|${e.schedule.classId}`;
    const entry = grouped.get(key) ?? { memberId: e.memberId, classId: e.schedule.classId, schedules: [] };
    if (entry.schedules.length < ATTENDANCE.SAMPLE_WINDOW) entry.schedules.push({ id: e.schedule.id, startTime: e.schedule.startTime });
    grouped.set(key, entry);
  }

  const memberIds = [...new Set([...grouped.values()].map((g) => g.memberId))];
  const classIds = [...new Set([...grouped.values()].map((g) => g.classId))];
  const scheduleIds = [...new Set([...grouped.values()].flatMap((g) => g.schedules.map((s) => s.id)))];

  const [members, classes, attendances] = await Promise.all([
    db.memberProfile.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, user: { select: { id: true, fullName: true } } },
    }),
    db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    db.attendance.findMany({
      where: { memberId: { in: memberIds }, scheduleId: { in: scheduleIds } },
      select: { memberId: true, scheduleId: true, status: true, note: true },
    }),
  ]);

  const memberMap = new Map(members.map((m: any) => [m.id, m]));
  const classMap = new Map(classes.map((c: any) => [c.id, c]));
  const attendanceMap = new Map(attendances.map((a: any) => [`${a.memberId}|${a.scheduleId}`, a]));

  const buckets: AttendanceBucket[] = [];
  for (const entry of grouped.values()) {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let noShowCount = 0;
    let excusedCount = 0;

    for (const schedule of entry.schedules) {
      const attendance = attendanceMap.get(`${entry.memberId}|${schedule.id}`);
      if (!attendance) {
        noShowCount++; 
        continue;
      }
      if (attendance.status === "PRESENT") presentCount++;
      else if (attendance.status === "LATE") lateCount++;
      else if (attendance.status === "EXCUSED") excusedCount++;
      else if (isSystemNoShow(attendance.note)) noShowCount++;
      else absentCount++;
    }

    const sampleSize = presentCount + lateCount + absentCount + noShowCount;
    const attendanceRate =
      sampleSize === 0 ? 100 : Math.round(((presentCount + lateCount) / sampleSize) * 1000) / 10;

    buckets.push({
      memberId: entry.memberId,
      memberName: memberMap.get(entry.memberId)?.user.fullName ?? "Hội viên",
      memberUserId: memberMap.get(entry.memberId)?.user.id ?? "",
      classId: entry.classId,
      className: classMap.get(entry.classId)?.name ?? "Lớp học",
      sampleSize,
      presentCount,
      lateCount,
      absentCount,
      noShowCount,
      excusedCount,
      attendanceRate,
      status: classifyAttendance(attendanceRate, sampleSize),
    });
  }

  return buckets;
}

export function buildPenaltyReason(bucket: AttendanceBucket): string {
  return (
    `Chuyên cần ${bucket.attendanceRate}% (${bucket.sampleSize} buổi được tính: ` +
    `${bucket.presentCount} có mặt, ${bucket.lateCount} đi muộn, ${bucket.absentCount} vắng, ` +
    `${bucket.noShowCount} không điểm danh) - dưới ngưỡng ${ATTENDANCE.RELEASE_THRESHOLD}%.`
  );
}
