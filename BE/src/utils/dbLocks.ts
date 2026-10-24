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

/**
 * Serialize xử lý WEBHOOK THANH TOÁN cho MỘT payment (SePay).
 *
 * Hai webhook khác `sepayId` cùng trỏ về một đơn phải xếp hàng, nếu không cả hai cùng đọc
 * `Payment.status = PENDING` rồi cùng kích hoạt gói → tạo 2 subscription cho một lần thu tiền.
 * Lock này KHÔNG thuộc chuỗi lock enrollment: trong transaction webhook nó là lock duy nhất
 * (claim `SepayWebhookEvent` đã tự serialize theo `sepayId`).
 */
export async function lockPaymentWebhook(db: DbClient, paymentId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment:webhook:' || ${paymentId}::text))`;
}

/**
 * Serialize mọi thay đổi số dư ví của MỘT HLV do Manager duyệt (rút tiền, hoàn tiền trừ ví).
 *
 * Hai lần duyệt cùng một lệnh rút (hoặc duyệt rút song song với duyệt hoàn) phải xếp hàng, nếu không cả
 * hai cùng đọc lệnh PENDING / số dư cũ rồi cùng trừ ⇒ trừ ví hai lần hoặc số dư âm.
 * Thứ tự: nếu đã giữ `lockPaymentWebhook` (duyệt hoàn) thì lấy lock ví SAU; duyệt rút chỉ lấy lock ví.
 * Không lồng với chuỗi lock enrollment.
 */
export async function lockCoachWallet(db: DbClient, walletId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('wallet:coach:' || ${walletId}::text))`;
}

/**
 * Serialize thao tác có thể làm giảm số MANAGER đang hoạt động (khóa / hạ quyền).
 * Hai request khóa hai Manager khác nhau cùng lúc phải xếp hàng, nếu không cả hai cùng thấy "còn 2 Manager"
 * rồi cùng commit ⇒ hệ thống không còn Manager nào. Lock đơn lẻ, không lồng với lock khác.
 */
export async function lockManagerRoster(db: DbClient) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('users:active-managers'))`;
}

/**
 * Serialize việc TẠO đơn hàng của MỘT người.
 *
 * Luật: một người không được có 2 đơn PENDING cùng chứa một sản phẩm. Hai request tạo đơn song song
 * phải xếp hàng, nếu không cả hai cùng thấy "chưa có đơn chờ" rồi cùng tạo ⇒ giữ hàng 2 lần.
 * Lock theo người mua (đơn có nhiều sản phẩm nên không khóa theo từng sản phẩm được); độc lập với
 * chuỗi lock enrollment và với `lockPaymentWebhook` (không lấy lồng nhau).
 */
export async function lockUserOrder(db: DbClient, userId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('order:user:' || ${userId}::text))`;
}
