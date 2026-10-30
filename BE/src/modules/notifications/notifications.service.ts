import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { emitToUsers } from "../../utils/realtime.js";

export type NotificationTypeEnum =
  // Tài khoản
  | "MEMBER_REGISTERED"
  // Chat
  | "CHAT_MESSAGE"
  // Gói tập
  
  
  
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
  | "CLASS_APPROVED"
  | "CLASS_REJECTED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_REJECTED"
  | "NEW_CLASS"
  | "COACH_CHANGED"
  // Chuyên cần (Attendance)
  | "ATTENDANCE_WARNING"
  | "ATTENDANCE_PENALTY"
  | "ATTENDANCE_PENALTY_REVOKED"
  // Lịch học đổi phòng (bulk transfer Room hư)
  | "SCHEDULE_ROOM_CHANGED"
  // Thanh toán
  | "PAYMENT_SUCCESS"
  | "PAYMENT_REFUNDED"
  // Cửa hàng
  | "ORDER_UPDATED"
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
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      reason: options?.reason ?? null,
      ...(options?.metadata ? { metadata: options.metadata as object } : {}),
    },
  });
  // Realtime (REST vẫn là nguồn chính): client cập nhật badge / danh sách khi nhận sự kiện.
  emitToUsers([userId], "notification:new", notification);
  return notification;
}

/**
 * Gửi notification đến nhiều user (batch).
 * Ví dụ: thông báo lớp mới cho tất cả thành viên.
 *
 * Không dedupe ở DB: Notification không có unique constraint nên không dùng
 * `skipDuplicates` (đã gỡ vì misleading). Dedupe thật (nếu cần) làm ở caller,
 * ví dụ UPCOMING_CLASS check findFirst theo metadata.scheduleId trong 24h.
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
  });
  emitToUsers(userIds, "notification:new", { type, title, body, metadata: options?.metadata ?? null });
}

// ─── CRUD API ──────────────────────────────────────────────────────────────

/**
 * Xóa/dọn dẹp toàn bộ thông báo liên quan đến một khóa học khi khóa học không còn nữa.
 */
export async function cleanNotificationsForClass(classId: string) {
  try {
    const schedules = await prisma.classSchedule.findMany({
      where: { classId },
      select: { id: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    await prisma.notification.deleteMany({
      where: {
        OR: [
          { metadata: { path: ["classId"], equals: classId } },
          ...(scheduleIds.length > 0
            ? scheduleIds.map((sId) => ({ metadata: { path: ["scheduleId"], equals: sId } }))
            : []),
        ],
      },
    });
  } catch {
    // Ignore error
  }
}

export async function getMyNotifications(userId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (query.isRead !== undefined) where.isRead = query.isRead === "true";
  if (query.type) where.type = query.type;

  // Lấy danh sách notifications của user
  const rawNotifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Thu thập tất cả classId và scheduleId từ metadata
  const classIds = new Set<string>();
  const scheduleIds = new Set<string>();

  for (const n of rawNotifications) {
    const meta = n.metadata as Record<string, any> | null;
    if (meta?.classId && typeof meta.classId === "string") {
      classIds.add(meta.classId);
    }
    if (meta?.scheduleId && typeof meta.scheduleId === "string") {
      scheduleIds.add(meta.scheduleId);
    }
  }

  // Tra cứu các schedule để tìm classId
  let scheduleToClassMap = new Map<string, string>();
  if (scheduleIds.size > 0) {
    const schedules = await prisma.classSchedule.findMany({
      where: { id: { in: Array.from(scheduleIds) } },
      select: { id: true, classId: true },
    });
    for (const s of schedules) {
      if (s.classId) {
        classIds.add(s.classId);
        scheduleToClassMap.set(s.id, s.classId);
      }
    }
  }

  // Tìm các khóa học đang HIỆN HỮU (isActive === true và chưa bị đóng/hủy)
  const activeClasses = await prisma.class.findMany({
    where: {
      id: { in: Array.from(classIds) },
      isActive: true,
      closedReason: null,
    },
    select: { id: true },
  });
  const activeClassIdSet = new Set(activeClasses.map((c) => c.id));

  // Lọc chỉ giữ lại thông báo của những gì đang hiện hữu, ẩn và dọn dẹp các thông báo rác
  const staleNotificationIds: string[] = [];
  const validNotifications = rawNotifications.filter((n) => {
    const meta = n.metadata as Record<string, any> | null;
    let notifClassId = meta?.classId;
    if (!notifClassId && meta?.scheduleId) {
      notifClassId = scheduleToClassMap.get(meta.scheduleId);
    }

    // Nếu thông báo liên quan đến khóa học nhưng khóa học đó không còn hiện hữu
    if (notifClassId && !activeClassIdSet.has(notifClassId)) {
      staleNotificationIds.push(n.id);
      return false;
    }
    return true;
  });

  // Tự động xóa các thông báo rác của khóa học không còn nữa (fire-and-forget)
  if (staleNotificationIds.length > 0) {
    prisma.notification.deleteMany({ where: { id: { in: staleNotificationIds } } }).catch(() => {});
  }

  const total = validNotifications.length;
  const pagedNotifications = validNotifications.slice(skip, skip + limit);

  return { notifications: pagedNotifications, pagination: buildPaginationMeta(total, page, limit) };
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
  const unreadNotifs = await prisma.notification.findMany({
    where: { userId, isRead: false },
    select: { id: true, metadata: true },
  });

  const classIds = new Set<string>();
  const scheduleIds = new Set<string>();
  for (const n of unreadNotifs) {
    const meta = n.metadata as Record<string, any> | null;
    if (meta?.classId && typeof meta.classId === "string") classIds.add(meta.classId);
    if (meta?.scheduleId && typeof meta.scheduleId === "string") scheduleIds.add(meta.scheduleId);
  }

  let scheduleToClassMap = new Map<string, string>();
  if (scheduleIds.size > 0) {
    const schedules = await prisma.classSchedule.findMany({
      where: { id: { in: Array.from(scheduleIds) } },
      select: { id: true, classId: true },
    });
    for (const s of schedules) {
      if (s.classId) {
        classIds.add(s.classId);
        scheduleToClassMap.set(s.id, s.classId);
      }
    }
  }

  const activeClasses = await prisma.class.findMany({
    where: { id: { in: Array.from(classIds) }, isActive: true, closedReason: null },
    select: { id: true },
  });
  const activeClassIdSet = new Set(activeClasses.map((c) => c.id));

  const validUnread = unreadNotifs.filter((n) => {
    const meta = n.metadata as Record<string, any> | null;
    let notifClassId = meta?.classId;
    if (!notifClassId && meta?.scheduleId) notifClassId = scheduleToClassMap.get(meta.scheduleId);
    if (notifClassId && !activeClassIdSet.has(notifClassId)) return false;
    return true;
  });

  return { unreadCount: validUnread.length };
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
      class: true,
      enrollments: {
        where: { status: "BOOKED" },
        include: { member: { select: { id: true, userId: true } } },
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
      await createNotification(
        userId,
        "UPCOMING_CLASS",
        `Nhắc nhở: Lớp ${schedule.class.name} sắp bắt đầu`,
        `Lớp "${schedule.class.name}" sẽ bắt đầu lúc ${startStr}. Đừng quên chuẩn bị!`,
        { metadata: { scheduleId: schedule.id, classId: schedule.classId } }
      );
      sent++;
    }
  }
  return { sent, schedulesChecked: upcomingSchedules.length };
}
