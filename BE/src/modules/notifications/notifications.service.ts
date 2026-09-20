import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export type NotificationTypeEnum =
  // Tài khoản
  | "MEMBER_REGISTERED"
  // Chat
  | "CHAT_MESSAGE"
  // Gói tập
  | "SUBSCRIPTION_EXPIRING"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_CANCELLED"
  // Lịch học
  | "UPCOMING_CLASS"
  | "SCHEDULE_CANCELLED"
  | "SCHEDULE_UPDATED"
  // Đặt lớp
  | "ENROLLMENT_CONFIRMED"
  | "ENROLLMENT_CANCELLED"
  // Kế hoạch tập luyện
  | "TRAINING_PLAN_ASSIGNED"
  // Lớp học mới
  | "NEW_CLASS"
  | "COACH_CHANGED"
  // Thanh toán
  | "PAYMENT_SUCCESS"
  | "PAYMENT_REFUNDED"
  // Chung
  | "GENERAL";

/**
 * Internal helper — gửi một notification cho một user.
 * Luôn fire-and-forget (không await ở ngoài) để không block response.
 */
export async function createNotification(
  userId: string,
  type: NotificationTypeEnum,
  title: string,
  body: string,
  options?: {
    reason?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      reason: options?.reason ?? null,
      ...(options?.metadata ? { metadata: options.metadata as object } : {}),
    },
  });
}

/**
 * Gửi notification đến nhiều user (batch).
 * Ví dụ: thông báo lớp mới cho tất cả thành viên.
 */
export async function broadcastNotification(
  userIds: string[],
  type: NotificationTypeEnum,
  title: string,
  body: string,
  options?: { reason?: string; metadata?: Record<string, unknown> }
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type,
      title,
      body,
      reason: options?.reason ?? null,
      metadata: options?.metadata ? (options.metadata as object) : undefined,
    })),
    skipDuplicates: true,
  });
}

// ─── CRUD API ──────────────────────────────────────────────────────────────

export async function getMyNotifications(userId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (query.isRead !== undefined) where.isRead = query.isRead === "true";
  if (query.type) where.type = query.type;

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { notifications, pagination: buildPaginationMeta(total, page, limit) };
}

export async function markNotificationRead(id: string, userId: string) {
  const notif = await prisma.notification.findUnique({ where: { id } });
  if (!notif) throw new AppError("Notification not found", 404);
  if (notif.userId !== userId) throw new AppError("Forbidden", 403);

  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { message: "All notifications marked as read" };
}

export async function getUnreadCount(userId: string) {
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return { unreadCount: count };
}

// ─── UPCOMING CLASS REMINDER (thủ công trigger) ───────────────────────────

/**
 * Gửi nhắc nhở cho tất cả hội viên có lớp trong 24h tới.
 * Gọi từ PATCH /class-schedules/:id/remind hoặc qua cron.
 * Idempotent: không gửi trùng nếu đã có UPCOMING_CLASS cho schedule+user trong 24h.
 */
export async function sendUpcomingClassReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Lấy tất cả lịch SCHEDULED trong 24h tới
  const upcomingSchedules = await prisma.classSchedule.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: in24h },
    },
    include: {
      class: { include: { sports: true } },
      enrollments: {
        where: { status: "BOOKED" },
        include: { member: { include: { user: true } } },
      },
    },
  });

  let sent = 0;
  for (const schedule of upcomingSchedules) {
    for (const enrollment of schedule.enrollments) {
      const userId = enrollment.member.userId;
      // Kiểm tra đã gửi chưa (tránh gửi trùng)
      const exists = await prisma.notification.findFirst({
        where: {
          userId,
          type: "UPCOMING_CLASS",
          metadata: { path: ["scheduleId"], equals: schedule.id },
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });
      if (exists) continue;

      const startStr = schedule.startTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      const sportNames = schedule.class.sports.map(s => s.name).join(", ");
      await createNotification(
        userId,
        "UPCOMING_CLASS",
        `Nhắc nhở: Lớp ${schedule.class.name} sắp bắt đầu`,
        `Lớp "${schedule.class.name}" (${sportNames}) sẽ bắt đầu lúc ${startStr}. Đừng quên chuẩn bị!`,
        { metadata: { scheduleId: schedule.id, classId: schedule.classId } }
      );
      sent++;
    }
  }
  return { sent, schedulesChecked: upcomingSchedules.length };
}
