import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

const classInclude = {
  sport: true,
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
  if (query.sportId) where.sportId = query.sportId;
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
  const sport = await prisma.sport.findUnique({ where: { id: data.sportId } });
  if (!sport || !sport.isActive) throw new AppError("Sport not found or inactive", 404);
  return prisma.class.create({ data, include: classInclude });
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
  return prisma.class.update({ where: { id }, data, include: classInclude });
}

export async function assignCoach(classId: string, coachId: string, isPrimary: boolean) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) throw new AppError("Class not found", 404);

  const coach = await prisma.coachProfile.findUnique({ where: { id: coachId } });
  if (!coach) throw new AppError("Coach not found", 404);

  if (isPrimary) {
    // Unset existing primary
    await prisma.classMember.updateMany({
      where: { classId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  await prisma.classMember.upsert({
    where: { classId_coachId: { classId, coachId } },
    update: { isPrimary },
    create: { classId, coachId, isPrimary },
  });

  return getClassById(classId);
}

export async function removeCoach(classId: string, coachId: string) {
  const cm = await prisma.classMember.findUnique({
    where: { classId_coachId: { classId, coachId } },
  });
  if (!cm) throw new AppError("Coach assignment not found", 404);
  await prisma.classMember.delete({ where: { classId_coachId: { classId, coachId } } });
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
