import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification } from "../notifications/notifications.service.js";
import { evaluateCourseEligibility } from "../enrollments/course-enrollment.service.js";

const classInclude = {
  sports: true,
  coaches: {
    include: {
      coach: {
        include: { user: { select: { id: true, fullName: true, email: true } } },
      },
    },
  },
  _count: { select: { enrollments: true, schedules: true } },
};

function assertSportsSupportAreaType(sports: { name: string; areaTypes: string[] }[], areaType: string) {
  for (const sport of sports) {
    if (!sport.areaTypes.includes(areaType)) {
      throw new AppError(`Sport "${sport.name}" does not support area type "${areaType}"`, 400);
    }
  }
}

export async function listClasses(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.sportId) where.sports = { some: { id: query.sportId } };
  if (query.classType) where.classType = query.classType;
  if (query.areaType) where.areaType = query.areaType;
  if (query.search) where.name = { contains: query.search, mode: "insensitive" };
  if (query.coachId) {
    where.coaches = { some: { coachId: query.coachId } };
  }

  const [total, classes] = await Promise.all([
    prisma.class.count({ where }),
    prisma.class.findMany({
      where, skip, take: limit,
      include: classInclude,
      orderBy: { name: "asc" },
    }),
  ]);
  return { classes, pagination: buildPaginationMeta(total, page, limit) };
}

export async function createClass(data: any) {
  const { sportIds, ...restData } = data;
  const sports = await prisma.sport.findMany({ where: { id: { in: sportIds }, isActive: true } });
  if (sports.length !== sportIds.length) throw new AppError("One or more sports not found or inactive", 404);

  // Business rule: TẤT CẢ sport của Class đều phải support Class.areaType.
  assertSportsSupportAreaType(sports, data.areaType);

  const newClass = await prisma.class.create({ 
    data: {
      ...restData,
      sports: { connect: sportIds.map((id: string) => ({ id })) }
    }, 
    include: classInclude 
  });

  // Broadcast NEW_CLASS notification to all active members — fire-and-forget
  prisma.memberProfile.findMany({
    where: { user: { isActive: true, role: "MEMBER" } },
    select: { userId: true },
  }).then((members) => {
    const userIds = members.map((m) => m.userId);
    const typeLabel = newClass.classType === "PREMIUM" ? "Premium" : "Thường";
    const sportNames = sports.map(s => s.name).join(", ");
    return broadcastNotification(
      userIds,
      "NEW_CLASS",
      `Lớp học mới: ${newClass.name}`,
      `Lớp "${newClass.name}" (${sportNames} - ${typeLabel}) vừa được mở. Đặt chỗ ngay trước khi hết!`,
      { metadata: { classId: newClass.id, sportIds } }
    );
  }).catch(() => {});

  return newClass;
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
  return cls;
}

export async function updateClass(id: string, data: any) {
  const cls = await prisma.class.findUnique({ where: { id }, include: { sports: true } });
  if (!cls) throw new AppError("Class not found", 404);

  if (data.isActive === false && cls.isActive === true) {
    const upcoming = await prisma.classSchedule.count({
      where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
    });
    if (upcoming > 0) throw new AppError("Cannot deactivate class with upcoming schedules", 400);
  }

  // Tính effectiveAreaType để xử lý partial update (chỉ đổi sportIds hoặc chỉ đổi areaType).
  const effectiveAreaType = data.areaType ?? cls.areaType;

  let sportsToCheck = cls.sports;
  if (data.sportIds) {
    const sports = await prisma.sport.findMany({ where: { id: { in: data.sportIds }, isActive: true } });
    if (sports.length !== data.sportIds.length) throw new AppError("One or more sports not found or inactive", 404);
    sportsToCheck = sports;
  }

  if (data.areaType !== undefined || data.sportIds !== undefined) {
    assertSportsSupportAreaType(sportsToCheck, effectiveAreaType);
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

  const { sportIds, ...restData } = data;
  const updateData: any = { ...restData };

  if (sportIds) {
    updateData.sports = { set: sportIds.map((sid: string) => ({ id: sid })) };
  }

  return prisma.class.update({ where: { id }, data: updateData, include: classInclude });
}

async function notifyCoachChange(
  classId: string,
  className: string,
  coachName: string,
  action: "ASSIGNED" | "REMOVED",
  isPrimary = true
) {
  const upcomingSchedules = await prisma.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: new Date() } },
    include: {
      enrollments: {
        where: { status: "BOOKED" },
        include: { member: true }
      }
    }
  });

  const userIdsToNotify = new Set<string>();
  for (const schedule of upcomingSchedules) {
    for (const enrollment of schedule.enrollments) {
      userIdsToNotify.add(enrollment.member.userId);
    }
  }

  if (userIdsToNotify.size > 0) {
    const title = action === "ASSIGNED" ? `Thay đổi HLV: Lớp ${className}` : `Thay đổi HLV: Lớp ${className}`;
    const body = action === "ASSIGNED" 
      ? `${isPrimary ? "HLV" : "HLV hỗ trợ"} ${coachName} vừa được phân công ${isPrimary ? "phụ trách" : "hỗ trợ"} lớp "${className}" mà bạn đã đặt lịch. Cùng chờ đón các buổi tập sắp tới nhé!`
      : isPrimary
        ? `HLV ${coachName} sẽ ngừng phụ trách lớp "${className}" của bạn. Quản lý sẽ sớm phân công HLV thay thế.`
        : `HLV hỗ trợ ${coachName} sẽ ngừng hỗ trợ lớp "${className}". Lớp vẫn diễn ra bình thường với HLV chính.`;
    
    broadcastNotification(
      Array.from(userIdsToNotify),
      "COACH_CHANGED",
      title,
      body,
      { metadata: { classId } }
    ).catch(() => {});
  }
}

/** HLV hợp lệ để phân công: tồn tại, đúng role COACH và đang hoạt động. */
async function findAssignableCoach(coachId: string) {
  const coach = await prisma.coachProfile.findUnique({
    where: { id: coachId },
    include: { user: true },
  });
  if (!coach || !coach.user.isActive || coach.user.role !== "COACH") {
    throw new AppError("Active coach not found", 404);
  }
  return coach;
}

/** Chặn phân công nếu coach bị trùng lịch với các buổi SCHEDULED sắp tới của Class. */
async function assertNoUpcomingScheduleConflict(classId: string, coachId: string) {
  const upcomingSchedules = await prisma.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: new Date() } },
  });

  for (const schedule of upcomingSchedules) {
    const conflict = await prisma.classSchedule.findFirst({
      where: {
        status: "SCHEDULED",
        classId: { not: classId },
        startTime: { lt: schedule.endTime },
        endTime: { gt: schedule.startTime },
        class: { coaches: { some: { coachId } } },
      },
    });
    if (conflict) {
      throw new AppError(
        `Coach has a conflicting schedule between ${schedule.startTime.toISOString()} and ${schedule.endTime.toISOString()}`,
        409
      );
    }
  }
}

export async function assignCoach(classId: string, coachId: string, isPrimary: boolean) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) throw new AppError("Class not found", 404);

  const coach = await findAssignableCoach(coachId);
  await assertNoUpcomingScheduleConflict(classId, coachId);

  // Check if coach is already assigned to determine if we should send ASSIGNED notification
  const existingAssignment = await prisma.classMember.findUnique({
    where: { classId_coachId: { classId, coachId } }
  });

  await prisma.$transaction(async (tx) => {
    if (isPrimary) {
      // Unset existing primary atomically
      await tx.classMember.updateMany({
        where: { classId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    await tx.classMember.upsert({
      where: { classId_coachId: { classId, coachId } },
      update: { isPrimary },
      create: { classId, coachId, isPrimary },
    });
  });

  if (!existingAssignment) {
    await notifyCoachChange(classId, cls.name, coach.user.fullName, "ASSIGNED", isPrimary);
  }

  return getClassById(classId);
}

/**
 * Phân công HLV hỗ trợ (support coach) cho Class.
 * Quy ước: mỗi Class chỉ có duy nhất 1 HLV chính (isPrimary = true), HLV hỗ trợ lưu isPrimary = false.
 * - 400: Class đã ngừng hoạt động.
 * - 404: Class hoặc HLV đang hoạt động không tồn tại.
 * - 409: HLV đang là HLV chính của Class, hoặc trùng lịch với buổi SCHEDULED sắp tới.
 * Idempotent: HLV đã là HLV hỗ trợ thì trả về chi tiết Class và không gửi lại thông báo.
 */
export async function assignSupportCoach(classId: string, coachId: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) throw new AppError("Class not found", 404);
  if (!cls.isActive) throw new AppError("Class is inactive", 400);

  const coach = await findAssignableCoach(coachId);

  const existingAssignment = await prisma.classMember.findUnique({
    where: { classId_coachId: { classId, coachId } },
  });

  // HLV chính không kiêm nhiệm HLV hỗ trợ: đổi vai trò phải dùng POST /classes/:id/coaches.
  if (existingAssignment?.isPrimary) {
    throw new AppError(
      "Coach is the primary coach of this class. Reassign roles via POST /classes/:id/coaches",
      409
    );
  }

  // Đã là HLV hỗ trợ: idempotent, không tạo trùng và không gửi lại thông báo.
  if (existingAssignment) return getClassById(classId);

  await assertNoUpcomingScheduleConflict(classId, coachId);

  await prisma.classMember.create({ data: { classId, coachId, isPrimary: false } });

  await notifyCoachChange(classId, cls.name, coach.user.fullName, "ASSIGNED", false);

  return getClassById(classId);
}

export async function removeCoach(classId: string, coachId: string) {
  const cm = await prisma.classMember.findUnique({
    where: { classId_coachId: { classId, coachId } },
    include: { class: true, coach: { include: { user: true } } }
  });
  if (!cm) throw new AppError("Coach assignment not found", 404);
  
  await prisma.classMember.delete({ where: { classId_coachId: { classId, coachId } } });
  
  await notifyCoachChange(classId, cm.class.name, cm.coach.user.fullName, "REMOVED", cm.isPrimary);

  return getClassById(classId);
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
      classType: true,
      areaType: true,
      capacity: true,
      isActive: true,
      sports: { select: { id: true, name: true } },
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
            classType: cls.classType,
            areaType: cls.areaType,
            capacity: cls.capacity,
            sports: cls.sports,
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
