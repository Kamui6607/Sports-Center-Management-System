import { prisma } from "../../config/prisma.js";
import { SUBSCRIPTION_LIFECYCLE } from "../../config/membership.js";
import { sepayConfig } from "../../config/sepay.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";

/** B07 — nhịp chạy job vòng đời gói (15 phút). */
export const LIFECYCLE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * B07 — Đồng bộ stored-state: gói `ACTIVE`/`SUSPENDED` đã quá `endDate` ⇒ `EXPIRED`.
 *
 * - CAS theo `endDate < now` để không "hết hạn nhầm" gói vừa được resume (resume đẩy endDate lên).
 * - Gửi thông báo SUBSCRIPTION_EXPIRED qua outbox (gửi sau commit, có retry).
 * - Idempotent: chạy lại không tạo thêm thông báo (không còn status ACTIVE/SUSPENDED để khớp).
 */
export async function expireStaleSubscriptions(now: Date = new Date()): Promise<{ expired: number }> {
  const stale = await prisma.membershipSubscription.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED"] }, endDate: { lt: now } },
    select: {
      id: true,
      endDate: true,
      member: { select: { userId: true } },
      plan: { select: { name: true } },
    },
    orderBy: { endDate: "asc" },
    take: SUBSCRIPTION_LIFECYCLE.EXPIRE_BATCH,
  });

  let expired = 0;
  for (const sub of stale) {
    const updated = await prisma.membershipSubscription.updateMany({
      where: { id: sub.id, status: { in: ["ACTIVE", "SUSPENDED"] }, endDate: { lt: now } },
      data: { status: "EXPIRED", suspendedAt: null, remainingDays: null },
    });
    if (updated.count === 0) continue; // resume/gia hạn xen vào — bỏ qua
    expired += 1;
    await enqueueNotification(prisma, {
      userId: sub.member.userId,
      type: "SUBSCRIPTION_EXPIRED",
      title: "Gói tập đã hết hạn",
      body:
        `Gói "${sub.plan.name}" của bạn đã hết hạn vào ` +
        `${sub.endDate.toLocaleDateString("vi-VN")}. Gia hạn để tiếp tục đặt lớp và điểm danh.`,
      metadata: { subscriptionId: sub.id },
    });
  }

  if (expired > 0) await flushNotificationOutbox().catch(() => {});
  return { expired };
}

/**
 * B07 — Nhắc hội viên sắp hết hạn (trong `REMINDER_DAYS_BEFORE` ngày tới).
 * Dedupe: không gửi lại cho cùng subscription trong `REMINDER_DEDUPE_HOURS` giờ.
 */
export async function sendSubscriptionExpiryReminders(
  now: Date = new Date()
): Promise<{ sent: number }> {
  const until = new Date(now.getTime() + SUBSCRIPTION_LIFECYCLE.REMINDER_DAYS_BEFORE * 86400000);
  const soon = await prisma.membershipSubscription.findMany({
    where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gt: now, lte: until } },
    select: { id: true, endDate: true, member: { select: { userId: true } }, plan: { select: { name: true } } },
    orderBy: { endDate: "asc" },
    take: SUBSCRIPTION_LIFECYCLE.EXPIRE_BATCH,
  });

  const dedupeSince = new Date(now.getTime() - SUBSCRIPTION_LIFECYCLE.REMINDER_DEDUPE_HOURS * 3600000);
  let sent = 0;
  for (const sub of soon) {
    // Dedupe 2 lớp: notification ĐÃ GỬI và outbox ĐANG CHỜ (tránh gửi trùng khi flush theo lô chưa tới row).
    const [alreadySent, pendingOutbox] = await Promise.all([
      prisma.notification.findFirst({
        where: {
          userId: sub.member.userId,
          type: "SUBSCRIPTION_EXPIRING",
          createdAt: { gte: dedupeSince },
          metadata: { path: ["subscriptionId"], equals: sub.id },
        },
        select: { id: true },
      }),
      prisma.notificationOutbox.findFirst({
        where: {
          userId: sub.member.userId,
          type: "SUBSCRIPTION_EXPIRING",
          status: { in: ["PENDING", "SENDING"] },
          metadata: { path: ["subscriptionId"], equals: sub.id },
        },
        select: { id: true },
      }),
    ]);
    if (alreadySent || pendingOutbox) continue;

    const daysLeft = Math.max(0, Math.ceil((sub.endDate.getTime() - now.getTime()) / 86400000));
    await enqueueNotification(prisma, {
      userId: sub.member.userId,
      type: "SUBSCRIPTION_EXPIRING",
      title: "Gói tập sắp hết hạn",
      body:
        `Gói "${sub.plan.name}" còn ${daysLeft} ngày (hết hạn ${sub.endDate.toLocaleDateString("vi-VN")}). ` +
        `Gia hạn ngay để không gián đoạn việc đặt lớp và điểm danh.`,
      metadata: { subscriptionId: sub.id, daysLeft },
    });
    sent += 1;
  }

  if (sent > 0) await flushNotificationOutbox().catch(() => {});
  return { sent };
}

/**
 * B07 — Tự đóng giao dịch SePay `PENDING` quá TTL (đổi trạng thái thay vì chỉ đóng khi có checkout mới).
 * Tiền về muộn sau đó đi vào nhánh LATE (ghi đối soát + REQUIRES_REVIEW), không kích hoạt gói.
 */
export async function closeStaleSepayPendingPayments(
  now: Date = new Date()
): Promise<{ closed: number }> {
  const ttlMs = sepayConfig().ttlMinutes * 60 * 1000;
  if (ttlMs <= 0) return { closed: 0 };

  const stale = await prisma.payment.findMany({
    where: { method: "SEPAY", status: "PENDING", createdAt: { lt: new Date(now.getTime() - ttlMs) } },
    select: { id: true, note: true },
    orderBy: { createdAt: "asc" },
    take: SUBSCRIPTION_LIFECYCLE.CLOSE_PENDING_BATCH,
  });

  let closed = 0;
  for (const payment of stale) {
    const note = `${payment.note ?? ""} | Hết hạn chờ thanh toán — tự đóng bởi job vòng đời.`.trim();
    const updated = await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "FAILED", note },
    });
    if (updated.count > 0) closed += 1;
  }
  return { closed };
}

/** B07 — Một lượt job vòng đời (dùng cho interval trong server.ts và cho e2e). */
export async function runSubscriptionLifecycleJobs(now: Date = new Date()) {
  const expired = await expireStaleSubscriptions(now);
  const reminders = await sendSubscriptionExpiryReminders(now);
  const pendingClosed = await closeStaleSepayPendingPayments(now);
  return { expired: expired.expired, reminders: reminders.sent, pendingClosed: pendingClosed.closed };
}
