import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import {
  ATTENDANCE,
  classifyAttendance,
  isSystemNoShow,
  type AttendanceBucketStatus,
} from "../../config/attendance.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** A10: khoảng thời gian member thực sự có quyền lợi (dùng cho analytics + kiểm tra dời lịch A11). */
export type MembershipCoverageInterval = { from: Date; to: Date };

/**
 * A10 — Dựng khoảng quyền lợi từ danh sách subscription (mọi trạng thái):
 * - to = min(endDate, cancelledAt) — hủy sớm thì quyền lợi dừng ở mốc hủy.
 * - Gói đang SUSPENDED: to = min(to, suspendedAt) — giai đoạn bảo lưu KHÔNG tính.
 * Trạng thái hiện tại không bao giờ xóa lịch sử đã học trước đó.
 */
export function buildCoverageIntervals(
  subs: Array<{
    startDate: Date;
    endDate: Date;
    status: string;
    suspendedAt?: Date | null;
    cancelledAt?: Date | null;
  }>
): MembershipCoverageInterval[] {
  return subs.map((sub) => {
    let to = sub.endDate;
    if (sub.cancelledAt && sub.cancelledAt < to) to = sub.cancelledAt;
    if (sub.status === "SUSPENDED" && sub.suspendedAt && sub.suspendedAt < to) to = sub.suspendedAt;
    return { from: sub.startDate, to };
  });
}

/** Thời điểm `at` có nằm trong ít nhất một khoảng quyền lợi (bao gồm cả biên). */
export function isCoveredAt(intervals: MembershipCoverageInterval[], at: Date): boolean {
  return intervals.some((iv) => iv.from <= at && at <= iv.to);
}

/** A10 — Khoảng quyền lợi của nhiều member (1 query) — dùng lại ở A11 khi dời lịch. */
export async function getMembershipCoverageIntervals(
  db: DbClient,
  ids: string[]
): Promise<Map<string, MembershipCoverageInterval[]>> {
  if (ids.length === 0) return new Map();
  const subs = await db.class.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      
      
      
      
    },
  });
  const map = new Map<string, MembershipCoverageInterval[]>();
  for (const sub of subs) {
    map.set(sub.id, [...(map.get(sub.id) ?? []), ...buildCoverageIntervals([sub])]);
  }
  return map;
}

export type AttendanceBucket = {
  id: string;
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

/**
 * Chỉ số chuyên cần theo (id × classId) — KHÔNG theo schedule.
 * Nhờ vậy member đổi buổi trong cùng Class (transfer) không reset lịch sử.
 *
 * Mẫu = tối đa ATTENDANCE.SAMPLE_WINDOW schedule ĐÃ KẾT THÚC gần nhất mà member thực sự giữ chỗ
 * (Enrollment BOOKED/COMPLETED), loại trừ:
 * - schedule CANCELLED (trung tâm hủy)
 * - schedule chưa kết thúc
 * - schedule nằm NGOÀI khoảng quyền lợi thực tế của member (A10).
 *
 * A10 — quyền lợi tính theo LỊCH SỬ, không theo trạng thái hiện tại của gói:
 * - Mọi subscription đều đóng góp khoảng [startDate, min(endDate, cancelledAt)] — gói đã hủy/hết hạn
 *   vẫn giữ nguyên lịch sử trước đó; đổi status hôm nay KHÔNG làm thay đổi tỷ lệ của các buổi đã học.
 * - Gói đang SUSPENDED: khoảng dừng tại `suspendedAt` (giai đoạn bảo lưu không tính chuyên cần;
 *   các buổi TRƯỚC lúc bảo lưu vẫn được tính).
 *
 * rate = (PRESENT + LATE) / (PRESENT + LATE + ABSENT + NO_SHOW); EXCUSED không vào tử/mẫu.
 * ABSENT do hệ thống tự tạo (note = SYSTEM_NO_SHOW) được đếm riêng là noShow.
 */
export async function computeAttendanceBuckets(
  db: DbClient,
  options: { id?: string; classId?: string; now?: Date } = {}
): Promise<AttendanceBucket[]> {
  const now = options.now ?? new Date();

  const enrollments = await db.enrollment.findMany({
    where: {
      status: { in: ["BOOKED", "COMPLETED"] },
      ...(options.id ? { id: options.id } : {}),
      ...(options.classId ? { classId: options.classId } : {}),
      schedule: { status: { not: "CANCELLED" }, endTime: { lte: now } },
    },
    select: {
      id: true,
      classId: true,
      schedule: { select: { id: true, startTime: true } },
    },
    orderBy: { schedule: { startTime: "desc" } },
  });
  if (enrollments.length === 0) return [];

  // Gom theo (member × class), giữ tối đa SAMPLE_WINDOW buổi gần nhất.
  const grouped = new Map<
    string,
    { id: string; classId: string; schedules: { id: string; startTime: Date }[] }
  >();
  for (const e of enrollments) {
    const key = `${e.id}|${e.classId}`;
    const entry = grouped.get(key) ?? { id: e.id, classId: e.classId, schedules: [] };
    if (entry.schedules.length < ATTENDANCE.SAMPLE_WINDOW) entry.schedules.push(e.schedule);
    grouped.set(key, entry);
  }

  const ids = [...new Set([...grouped.values()].map((g) => g.id))];
  const classIds = [...new Set([...grouped.values()].map((g) => g.classId))];
  const scheduleIds = [...new Set([...grouped.values()].flatMap((g) => g.schedules.map((s) => s.id)))];

  const [members, classes, subscriptions, attendances] = await Promise.all([
    db.memberProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, user: { select: { id: true, fullName: true } } },
    }),
    db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    db.class.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        
        
        
        
      },
    }),
    db.attendance.findMany({
      where: { id: { in: ids }, scheduleId: { in: scheduleIds } },
      select: { id: true, scheduleId: true, status: true, note: true },
    }),
  ]);

  const memberMap = new Map(members.map((m: any) => [m.id, m]));
  const classMap = new Map(classes.map((c: any) => [c.id, c]));
  const coverageByMember = new Map<string, MembershipCoverageInterval[]>();
  for (const sub of subscriptions) {
    coverageByMember.set(sub.id, [
      ...(coverageByMember.get(sub.id) ?? []),
      ...buildCoverageIntervals([sub]),
    ]);
  }
  const attendanceMap = new Map(attendances.map((a: any) => [`${a.id}|${a.scheduleId}`, a]));

  /** Buổi chỉ được tính khi thời điểm học nằm trong khoảng quyền lợi LỊCH SỬ (A10). */
  const isCoveredByMembership = (id: string, at: Date) =>
    isCoveredAt(coverageByMember.get(id) ?? [], at);

  const buckets: AttendanceBucket[] = [];
  for (const entry of grouped.values()) {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let noShowCount = 0;
    let excusedCount = 0;

    for (const schedule of entry.schedules) {
      if (!isCoveredByMembership(entry.id, schedule.startTime)) continue;
      const attendance = attendanceMap.get(`${entry.id}|${schedule.id}`);
      if (!attendance) {
        noShowCount++; // buổi đã kết thúc nhưng chưa có bản ghi điểm danh
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
      id: entry.id,
      memberName: memberMap.get(entry.id)?.user.fullName ?? "Hội viên",
      memberUserId: memberMap.get(entry.id)?.user.id ?? "",
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

/** Câu giải thích đủ rõ cho Manager hiểu vì sao hệ thống đề xuất hình phạt. */
export function buildPenaltyReason(bucket: AttendanceBucket): string {
  return (
    `Chuyên cần ${bucket.attendanceRate}% (${bucket.sampleSize} buổi được tính: ` +
    `${bucket.presentCount} có mặt, ${bucket.lateCount} đi muộn, ${bucket.absentCount} vắng, ` +
    `${bucket.noShowCount} không điểm danh) — dưới ngưỡng ${ATTENDANCE.RELEASE_THRESHOLD}%.`
  );
}
