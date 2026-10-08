import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { createNotification, type NotificationTypeEnum } from "./notifications.service.js";
import { sendEmail } from "../../utils/mail.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Nhịp worker outbox ở server (ms). Có thể flush thủ công ngay sau commit cho deterministic test. */
export const OUTBOX_FLUSH_INTERVAL_MS = 5000;

/** Số bản ghi tối đa mỗi lượt flush. */
const OUTBOX_BATCH_SIZE = 20;

/** Số lần thử tối đa trước khi đánh dấu FAILED (xem bằng DB để xử lý tay). */
const OUTBOX_MAX_ATTEMPTS = 10;

export interface OutboxNotificationInput {
  userId: string;
  type: NotificationTypeEnum;
  title: string;
  body: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * F01 — Ghi notification vào OUTBOX trong CÙNG transaction nghiệp vụ.
 *
 * Vì sao: gọi `createNotification` bằng prisma ngoài transaction có thể tạo thông báo "đã thành công"
 * dù transaction rollback, hoặc mất thông báo khi process chết giữa chừng. Outbox ghi atomic cùng
 * dữ liệu nghiệp vụ rồi mới gửi SAU commit (có retry).
 */
export async function enqueueNotification(db: DbClient, input: OutboxNotificationInput) {
  return db.notificationOutbox.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      reason: input.reason ?? null,
      availableAt: new Date(),
      ...(input.metadata ? { metadata: input.metadata as object } : {}),
    },
  });
}

export interface OutboxEmailInput {
  userId: string;
  to: string;
  subject: string;
  html: string;
  /** Nhãn loại email (vd. "EMAIL_RESET_PASSWORD") để tra cứu/debug. */
  type: string;
}

/** Ghi EMAIL vào outbox (gọi được trong transaction). Worker gửi qua Brevo và retry khi lỗi. */
export async function enqueueEmail(db: DbClient, input: OutboxEmailInput) {
  return db.notificationOutbox.create({
    data: {
      userId: input.userId,
      channel: "EMAIL",
      email: input.to,
      type: input.type,
      title: input.subject,
      body: input.html,
      availableAt: new Date(),
    },
  });
}

/** Dòng kẹt ở SENDING quá lâu (process chết giữa chừng) được trả về PENDING để gửi lại. */
const OUTBOX_STUCK_SENDING_MS = 5 * 60 * 1000;

/**
 * F01 — Gửi các notification đang PENDING (gọi NGAY sau commit của luồng nghiệp vụ + worker định kỳ).
 *
 * An toàn khi nhiều worker/instance chạy song song: mỗi bản ghi được CLAIM bằng
 * `updateMany(status = PENDING → SENDING)` (compare-and-set) — chỉ một worker xử lý một dòng.
 * Lỗi tạm thời ⇒ trả về PENDING với backoff; quá `OUTBOX_MAX_ATTEMPTS` ⇒ FAILED.
 *
 * @returns số notification đã gửi thành công trong lượt này.
 */
export async function flushNotificationOutbox(limit = OUTBOX_BATCH_SIZE): Promise<number> {
  const now = new Date();
  await prisma.notificationOutbox.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - OUTBOX_STUCK_SENDING_MS) } },
    data: { status: "PENDING" },
  });
  const pending = await prisma.notificationOutbox.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  for (const row of pending) {
    // CAS claim: worker khác đã lấy dòng này ⇒ bỏ qua.
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claimed.count === 0) continue;

    try {
      if (row.channel === "EMAIL") {
        if (!row.email) throw new Error("Outbox EMAIL thiếu địa chỉ người nhận");
        await sendEmail({ to: row.email, subject: row.title, html: row.body });
      } else {
        await createNotification(
          row.userId,
          row.type as NotificationTypeEnum,
          row.title,
          row.body,
          {
            reason: row.reason ?? undefined,
            metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
          }
        );
      }
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const failed = attempts >= OUTBOX_MAX_ATTEMPTS;
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          attempts,
          lastError: (err as Error).message.slice(0, 500),
          // Backoff luỹ tiến, trần 5 phút — tránh spam khi DB/notification tạm lỗi.
          availableAt: new Date(Date.now() + Math.min(2 ** attempts, 300) * 1000),
        },
      });
    }
  }

  return sent;
}
