import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Thứ tự lock bắt buộc cho mọi flow đặt chỗ / đổi chỗ / hình phạt:
 *
 *   1. `lockMemberQuota()`  — quota là tài nguyên theo MỘT memberId (không phải memberId × classId)
 *   2. `lockMemberClass()`  — chỗ đặt trong một (member × class)
 *   3. `lockSchedule()`     — sức chứa của một buổi
 *
 * `lockSchedules()` (nhiều buổi) cũng phải gọi SAU cùng thứ tự trên.
 * Tuyệt đối không lock ngược thứ tự ở bất kỳ service nào (deadlock).
 * Lock sống trong transaction, tự release khi commit/rollback.
 */

/**
 * Serialize quota lớp học song song của một hội viên.
 * Hai request đồng thời đặt 2 Class khác nhau cho cùng member phải xếp hàng,
 * nếu không cả hai cùng đọc `used < limit` rồi cùng commit -> vượt quota.
 */
export async function lockMemberQuota(db: DbClient, memberId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('enrollment:member-quota:' || ${memberId}::text))`;
}

/**
 * Advisory lock dùng chung cho mọi thao tác ảnh hưởng tới chỗ đặt của một (member × class):
 * bookClass / transferEnrollment / attendance penalty apply & restore.
 * Luôn gọi SAU `lockMemberQuota()` và TRƯỚC `lockSchedule()`.
 */
export async function lockMemberClass(db: DbClient, memberId: string, classId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('enrollment:member-class:' || ${memberId}::text || ':' || ${classId}::text))`;
}

/** Serialize theo schedule (chống overbooking). Luôn gọi SAU lockMemberQuota/lockMemberClass. */
export async function lockSchedule(db: DbClient, scheduleId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('enrollment:schedule:' || ${scheduleId}::text))`;
}

/** Lock nhiều schedule theo thứ tự cố định để tránh deadlock giữa các transaction. */
export async function lockSchedules(db: DbClient, scheduleIds: string[]) {
  for (const id of [...new Set(scheduleIds)].sort()) {
    await lockSchedule(db, id);
  }
}
