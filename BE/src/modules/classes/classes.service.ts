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

export async function listClasses(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.sportId) where.sports = { some: { id: query.sportId } };
  if (query.classType) where.classType = query.classType;
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
  const cls = await prisma.class.findUnique({ where: { id } });
  if (!cls) throw new AppError("Class not found", 404);

  if (data.isActive === false && cls.isActive === true) {
    const upcoming = await prisma.classSchedule.count({
      where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
    });
    if (upcoming > 0) throw new AppError("Cannot deactivate class with upcoming schedules", 400);
  }

  const { sportIds, ...restData } = data;
  const updateData: any = { ...restData };
  
  if (sportIds) {
    const sports = await prisma.sport.findMany({ where: { id: { in: sportIds }, isActive: true } });
    if (sports.length !== sportIds.length) throw new AppError("One or more sports not found or inactive", 404);
    updateData.sports = { set: sportIds.map((id: string) => ({ id })) };
  }

  return prisma.class.update({ where: { id }, data: updateData, include: classInclude });
}

async function notifyCoachChange(classId: string, className: string, coachName: string, action: "ASSIGNED" | "REMOVED") {
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
      ? `HLV ${coachName} vừa được phân công phụ trách lớp "${className}" mà bạn đã đặt lịch. Cùng chờ đón các buổi tập sắp tới nhé!`
      : `HLV ${coachName} sẽ ngừng phụ trách lớp "${className}" của bạn. Quản lý sẽ sớm phân công HLV thay thế.`;
    
    broadcastNotification(
      Array.from(userIdsToNotify),
      "COACH_CHANGED",
      title,
      body,
      { metadata: { classId } }
    ).catch(() => {});
  }
}

export async function assignCoach(classId: string, coachId: string, isPrimary: boolean) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) throw new AppError("Class not found", 404);

  const coach = await prisma.coachProfile.findUnique({ 
    where: { id: coachId },
    include: { user: true }
  });
  if (!coach || !coach.user.isActive || coach.user.role !== "COACH") {
    throw new AppError("Active coach not found", 404);
  }

  // Check for conflicts with existing upcoming schedules
  const upcomingSchedules = await prisma.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: new Date() } }
  });

  for (const schedule of upcomingSchedules) {
    const conflict = await prisma.classSchedule.findFirst({
      where: {
        status: "SCHEDULED",
        classId: { not: classId },
        startTime: { lt: schedule.endTime },
        endTime: { gt: schedule.startTime },
        class: { coaches: { some: { coachId } } },
      }
    });
    if (conflict) {
      throw new AppError(
        `Coach has a conflicting schedule between ${schedule.startTime.toISOString()} and ${schedule.endTime.toISOString()}`,
        409
      );
    }
  }

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
    await notifyCoachChange(classId, cls.name, coach.user.fullName, "ASSIGNED");
  }

  return getClassById(classId);
}

export async function removeCoach(classId: string, coachId: string) {
  const cm = await prisma.classMember.findUnique({
    where: { classId_coachId: { classId, coachId } },
    include: { class: true, coach: { include: { user: true } } }
  });
  if (!cm) throw new AppError("Coach assignment not found", 404);
  
  await prisma.classMember.delete({ where: { classId_coachId: { classId, coachId } } });
  
  await notifyCoachChange(classId, cm.class.name, cm.coach.user.fullName, "REMOVED");

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
