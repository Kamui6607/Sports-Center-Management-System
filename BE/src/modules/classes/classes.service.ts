import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification, createNotification } from "../notifications/notifications.service.js";
import { evaluateCourseEligibility } from "../enrollments/course-enrollment.service.js";

/** HLV phụ trách lớp (mỗi lớp đúng 1 HLV — Class.coachId). */
const CLASS_COACH_INCLUDE = {
  include: { user: { select: { id: true, fullName: true, email: true } } },
};

const classInclude = {
  coach: CLASS_COACH_INCLUDE,
  _count: { select: { schedules: true } },
};

/**
 * Số lượt giữ chỗ (Enrollment) của từng lớp — đếm qua ClassSchedule vì Enrollment chỉ gắn với buổi học.
 * Trả kèm vào `_count.enrollments` để response giữ nguyên định dạng cũ cho FE.
 */
async function countEnrollmentsByClass(classIds: string[]): Promise<Map<string, number>> {
  if (classIds.length === 0) return new Map();
  const rows = await prisma.classSchedule.findMany({
    where: { classId: { in: classIds } },
    select: { classId: true, _count: { select: { enrollments: true } } },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.classId, (map.get(r.classId) ?? 0) + r._count.enrollments);
  return map;
}

function withEnrollmentCount<T extends { id: string; _count: { schedules: number } }>(cls: T, counts: Map<string, number>) {
  return { ...cls, _count: { ...cls._count, enrollments: counts.get(cls.id) ?? 0 } };
}

async function withEnrollmentCountOne<T extends { id: string; _count: { schedules: number } }>(cls: T) {
  return withEnrollmentCount(cls, await countEnrollmentsByClass([cls.id]));
}

export async function listClasses(query: any, actor?: { id: string; role: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.fitness) where.fitness = { equals: String(query.fitness).trim(), mode: "insensitive" };
  if (query.classType) where.classType = query.classType;
  if (query.areaType) where.areaType = query.areaType;
  if (query.search) where.name = { contains: query.search, mode: "insensitive" };
  if (query.coachId) where.coachId = query.coachId;
  if (query.status) {
    where.status = query.status;
  }

  // Coach xem list: mặc định thấy class APPROVED + class của chính mình (mọi status)
  if (actor?.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
    if (coachProfile && query.createdByMe === "true") {
      where.coachId = coachProfile.id;
    } else if (coachProfile && !query.status) {
      where.OR = [{ status: "APPROVED" }, { coachId: coachProfile.id }];
    }
  } else if (actor?.role === "MEMBER" && !query.status) {
    // Member chỉ thấy class APPROVED
    where.status = "APPROVED";
  }

  const [total, classes] = await Promise.all([
    prisma.class.count({ where }),
    prisma.class.findMany({
      where, skip, take: limit,
      include: classInclude,
      orderBy: { name: "asc" },
    }),
  ]);
  const counts = await countEnrollmentsByClass(classes.map((c) => c.id));
  return { classes: classes.map((c) => withEnrollmentCount(c, counts)), pagination: buildPaginationMeta(total, page, limit) };
}

/**
 * CHỈ Coach tạo lớp (route chỉ mở cho COACH). Coach tạo ⇒ là HLV phụ trách lớp (Class.coachId),
 * lớp ở trạng thái PENDING chờ Manager duyệt.
 */
export async function createClass(data: any, actor: { id: string; role: string }) {
  if (actor.role !== "COACH") throw new AppError("Chỉ Coach được tạo lớp học", 403);

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  const newClass = await prisma.$transaction(async (tx) => {
    const cls = await tx.class.create({
      data: {
        ...data,
        status: "PENDING",
        coachId: coachProfile.id,
      },
      include: classInclude,
    });

    // Tạo ví HLV nếu chưa có (nhận 85% doanh thu khi có học viên mua lớp)
    await tx.coachWallet.upsert({
      where: { coachId: coachProfile.id },
      create: { coachId: coachProfile.id, balance: 0 },
      update: {},
    });

    return cls;
  });

  // Thông báo cho tất cả Manager rằng có class mới chờ duyệt
  const managers = await prisma.user.findMany({
    where: { role: { name: "MANAGER" }, isActive: true },
    select: { id: true },
  });
  broadcastNotification(
    managers.map((m) => m.id),
    "CLASS_APPROVED", // tái dùng type; FE phân biệt qua title
    `Khóa học mới chờ duyệt: ${newClass.name}`,
    `Coach đã tạo khóa học "${newClass.name}" và đang chờ xác nhận của bạn.`,
    { metadata: { classId: newClass.id } }
  ).catch(() => {});

  return withEnrollmentCountOne(newClass);
}

/**
 * Manager duyệt hoặc từ chối class do Coach tạo.
 */
export async function reviewClass(classId: string, action: "APPROVE" | "REJECT", reason?: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { coach: { select: { userId: true } } },
  });
  if (!cls) throw new AppError("Class not found", 404);
  if (cls.status !== "PENDING") {
    throw new AppError(`Class is already ${cls.status} — cannot review again`, 400);
  }

  const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const updated = await prisma.class.update({
    where: { id: classId },
    data: { status: newStatus },
    include: classInclude,
  });

  // Thông báo cho Coach phụ trách lớp biết kết quả
  const notifType = action === "APPROVE" ? "CLASS_APPROVED" : "CLASS_REJECTED";
  const title =
    action === "APPROVE"
      ? `Khóa học được duyệt: ${cls.name}`
      : `Khóa học bị từ chối: ${cls.name}`;
  const body =
    action === "APPROVE"
      ? `Khóa học "${cls.name}" của bạn đã được Manager phê duyệt. Hãy thêm lịch học để bắt đầu!`
      : `Khóa học "${cls.name}" của bạn bị từ chối.${reason ? ` Lý do: ${reason}` : ""}`;
  createNotification(cls.coach.userId, notifType, title, body, {
    metadata: { classId },
  }).catch(() => {});

  // Nếu APPROVED: broadcast cho Members
  if (action === "APPROVE") {
    prisma.memberProfile
      .findMany({ where: { user: { isActive: true, role: { name: "MEMBER" } } }, select: { userId: true } })
      .then((members) =>
        broadcastNotification(
          members.map((m) => m.userId),
          "NEW_CLASS",
          `Lớp học mới: ${cls.name}`,
          `Lớp "${cls.name}" vừa được mở. Đặt chỗ ngay!`,
          { metadata: { classId } }
        )
      )
      .catch(() => {});
  }

  return withEnrollmentCountOne(updated);
}


export async function getClassById(id: string) {
  const cls = await prisma.class.findUnique({
    where: { id },
    include: {
      ...classInclude,
      schedules: {
        where: { status: "SCHEDULED", startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        take: 10,
        include: { room: true, _count: { select: { enrollments: true } } },
      },
    },
  });
  if (!cls) throw new AppError("Class not found", 404);
  return withEnrollmentCountOne(cls);
}

export async function updateClass(id: string, data: any, actor?: { id: string; role: string }) {
  const cls = await prisma.class.findUnique({
    where: { id },
    include: { coach: { select: { userId: true } } },
  });
  if (!cls) throw new AppError("Class not found", 404);

  // Coach chỉ được sửa class PENDING của chính mình
  if (actor?.role === "COACH") {
    if (cls.coach.userId !== actor.id) {
      throw new AppError("Forbidden: You can only edit your own classes", 403);
    }
    if (cls.status !== "PENDING") {
      throw new AppError("Cannot edit a class that has already been reviewed by Manager", 400);
    }
  }

  if (data.isActive === false && cls.isActive === true) {
    const upcoming = await prisma.classSchedule.count({
      where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
    });
    if (upcoming > 0) throw new AppError("Cannot deactivate class with upcoming schedules", 400);
  }

  // A11: KHÔNG cho giảm sức chứa xuống dưới số chỗ đã giữ ở các buổi sắp tới.
  if (data.capacity !== undefined && data.capacity < cls.capacity) {
    const upcomingSchedules = await prisma.classSchedule.findMany({
      where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
      select: {
        id: true,
        _count: {
          select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } },
        },
      },
    });
    const maxBooked = upcomingSchedules.reduce((max, s) => Math.max(max, s._count.enrollments), 0);
    if (data.capacity < maxBooked) {
      throw new AppError(
        `Không thể giảm sức chứa lớp xuống ${data.capacity}: ${maxBooked} chỗ đang được giữ ở các buổi sắp tới.`,
        400,
        { code: "CLASS_CAPACITY_BELOW_BOOKED", capacity: data.capacity, minCapacity: maxBooked }
      );
    }
  }

  // Không được để upcoming SCHEDULED tồn tại ở Room không còn phù hợp với areaType mới.
  if (data.areaType !== undefined && data.areaType !== cls.areaType) {
    const mismatched = await prisma.classSchedule.count({
      where: {
        classId: id,
        status: "SCHEDULED",
        startTime: { gte: new Date() },
        room: { areaType: { not: data.areaType } },
      },
    });
    if (mismatched > 0) {
      throw new AppError(
        `Cannot change Class area type to "${data.areaType}" because ${mismatched} upcoming schedule(s) use a Room with a different area type`,
        400
      );
    }
  }

  const updated = await prisma.class.update({ where: { id }, data, include: classInclude });
  return withEnrollmentCountOne(updated);
}

export async function deleteClass(id: string) {
  const cls = await prisma.class.findUnique({ where: { id } });
  if (!cls) throw new AppError("Class not found", 404);
  const upcoming = await prisma.classSchedule.count({
    where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
  });
  if (upcoming > 0) throw new AppError("Cannot deactivate class with upcoming schedules", 400);
  return prisma.class.update({ where: { id }, data: { isActive: false } });
}

// ─────────────────────────────────────────
// COURSE PLAN (gom lịch trình của Class thành 1 "khóa học")
// ─────────────────────────────────────────

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
/** Thứ 2..Chủ nhật theo ISO 1..7. */
const WEEKDAY_LABELS_VI = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

const vnWeekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIME_ZONE,
  weekday: "short",
});
const vnClockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const VN_WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

/** Thứ trong tuần (ISO 1..7) theo giờ Việt Nam. */
function vnWeekdayIso(date: Date): number {
  return VN_WEEKDAY_TO_ISO[vnWeekdayFormatter.format(date).slice(0, 3)] ?? 1;
}

/** Giờ HH:mm theo giờ Việt Nam (không phụ thuộc timezone của server). */
function vnClock(date: Date): string {
  return vnClockFormatter.format(date);
}

function vnWeekdayLabel(iso: number): string {
  return WEEKDAY_LABELS_VI[iso - 1] ?? `Thứ ${iso + 1}`;
}

type CourseSlot = {
  weekday: number;
  weekdayLabel: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  roomId: string;
  roomName: string;
  sessionCount: number;
  firstSessionStart: Date;
  lastSessionStart: Date;
  sessionIds: string[];
};

/**
 * GET /classes/:id/course-plan — "nguyên cái lịch trình" của Class dưới dạng MỘT khóa học.
 *
 * Trả về:
 * - `course.slots[]`: các khung lịch lặp lại (Thứ + giờ + phòng) để FE hiển thị kiểu
 *   "Thứ 2 · 18:00–19:30 · Phòng Yoga" thay vì liệt kê từng buổi rời rạc.
 * - `course`: tổng số buổi, buổi đầu/cuối, các thứ, các phòng, độ khả dụng (còn chỗ ít nhất).
 * - `sessions[]`: từng buổi (đã có nhãn thứ/giờ VN) + sức chứa còn lại + trạng thái đặt của member.
 * - `registration` (chỉ khi caller là MEMBER): điều kiện đăng ký trọn khóa theo đúng bộ luật
 *   all-or-nothing dùng chung với `POST /enrollments/bulk` (blockers + gói tập + quota + penalty).
 */
export async function getClassCoursePlan(
  classId: string,
  actor?: { id: string; role: string }
) {
  const now = new Date();

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      fitness: true,
      classType: true,
      areaType: true,
      capacity: true,
      isActive: true,
    },
  });
  if (!cls) throw new AppError("Class not found", 404);

  // Khóa học = toàn bộ buổi SCHEDULED chưa bắt đầu, sắp theo thời gian.
  const schedules = await prisma.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: now } },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      roomId: true,
      room: { select: { id: true, name: true, areaType: true } },
      _count: {
        select: {
          enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } },
        },
      },
    },
  });

  const memberProfile =
    actor?.role === "MEMBER"
      ? await prisma.memberProfile.findUnique({
          where: { userId: actor.id },
          select: { id: true },
        })
      : null;

  // Preview điều kiện đăng ký trọn khóa — cùng nguồn luật với POST /enrollments/bulk.
  const eligibility = memberProfile
    ? await evaluateCourseEligibility(
        prisma,
        memberProfile.id,
        { id: cls.id, classType: cls.classType, capacity: cls.capacity },
        schedules.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          roomId: s.roomId,
          room: { id: s.room.id, name: s.room.name },
        }))
      )
    : null;
  const eligibilityBySchedule = new Map(
    (eligibility?.sessions ?? []).map((s) => [s.scheduleId, s])
  );

  const sessions = schedules.map((s) => {
    const state = eligibilityBySchedule.get(s.id);
    const bookedCount = state?.bookedCount ?? s._count.enrollments;
    const remainingSlots = Math.max(0, cls.capacity - bookedCount);
    const isFull = remainingSlots === 0;
    const myEnrollmentStatus = state?.myEnrollment?.status ?? null;
    const alreadyRegistered =
      myEnrollmentStatus === "BOOKED" || myEnrollmentStatus === "COMPLETED";
    const weekday = vnWeekdayIso(s.startTime);

    return {
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMinutes: Math.round((s.endTime.getTime() - s.startTime.getTime()) / 60000),
      weekday,
      weekdayLabel: vnWeekdayLabel(weekday),
      timeLabel: `${vnClock(s.startTime)} – ${vnClock(s.endTime)}`,
      status: s.status,
      room: { id: s.room.id, name: s.room.name, areaType: s.room.areaType },
      bookedCount,
      remainingSlots,
      isFull,
      isBookable: !isFull,
      canBook: !isFull && !alreadyRegistered,
      myEnrollmentId: state?.myEnrollment?.id ?? null,
      myEnrollmentStatus,
      conflictWith: state?.conflictWith ?? null,
    };
  });

  // Gom các buổi lặp lại cùng (thứ + giờ bắt đầu/kết thúc + phòng) thành 1 khung lịch.
  const slotMap = new Map<string, CourseSlot>();
  for (const session of sessions) {
    const key = `${session.weekday}|${vnClock(session.startTime)}|${vnClock(session.endTime)}|${session.room.id}`;
    const existing = slotMap.get(key);
    if (existing) {
      existing.sessionCount += 1;
      existing.lastSessionStart = session.startTime;
      existing.sessionIds.push(session.id);
      continue;
    }
    slotMap.set(key, {
      weekday: session.weekday,
      weekdayLabel: session.weekdayLabel,
      startTime: vnClock(session.startTime),
      endTime: vnClock(session.endTime),
      durationMinutes: session.durationMinutes,
      roomId: session.room.id,
      roomName: session.room.name,
      sessionCount: 1,
      firstSessionStart: session.startTime,
      lastSessionStart: session.startTime,
      sessionIds: [session.id],
    });
  }

  const slots = [...slotMap.values()].sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime) ||
      a.roomName.localeCompare(b.roomName)
  );
  const weekdays = [...new Set(sessions.map((s) => s.weekday))].sort((a, b) => a - b);
  const rooms = [
    ...new Map(
      sessions.map((s) => [s.room.id, { id: s.room.id, name: s.room.name, areaType: s.room.areaType }])
    ).values(),
  ];

  const registeredCount = sessions.filter(
    (s) => s.myEnrollmentStatus === "BOOKED" || s.myEnrollmentStatus === "COMPLETED"
  ).length;

  const firstSession = sessions[0];
  const lastSession = sessions[sessions.length - 1];

  return {
    course:
      sessions.length === 0
        ? null
        : {
            classId: cls.id,
            className: cls.name,
            description: cls.description,
            goal: cls.goal,
            fitness: cls.fitness,
            classType: cls.classType,
            areaType: cls.areaType,
            capacity: cls.capacity,
            totalSessions: sessions.length,
            firstSessionStart: firstSession.startTime,
            lastSessionStart: lastSession.startTime,
            lastSessionEnd: lastSession.endTime,
            weekdays,
            weekdayLabels: weekdays.map(vnWeekdayLabel),
            timeSlots: [
              ...new Map(
                slots.map((slot) => [
                  `${slot.startTime}-${slot.endTime}`,
                  {
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    durationMinutes: slot.durationMinutes,
                  },
                ])
              ).values(),
            ],
            rooms,
            slots,
            availability: {
              minRemainingSlots:
                sessions.length === 0 ? 0 : Math.min(...sessions.map((s) => s.remainingSlots)),
              fullSessionCount: sessions.filter((s) => s.isFull).length,
              isFullyBookable: sessions.every((s) => s.isBookable),
            },
          },
    sessions,
    registration: memberProfile
      ? {
          eligible: (eligibility?.blockers.length ?? 0) === 0,
          blockers: eligibility?.blockers ?? [],
          subscription: eligibility?.subscription ?? null,
          quota: eligibility?.quota ?? null,
          penalty: eligibility?.penalty ?? null,
          registeredSessions: registeredCount,
          remainingSessionsToRegister: sessions.length - registeredCount,
          isFullyRegistered: sessions.length > 0 && registeredCount === sessions.length,
        }
      : null,
  };
}
