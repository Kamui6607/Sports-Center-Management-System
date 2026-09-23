import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification } from "../notifications/notifications.service.js";

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
