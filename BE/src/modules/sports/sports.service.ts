import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listSports(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.search) where.name = { contains: query.search, mode: "insensitive" };

  const [total, sports] = await Promise.all([
    prisma.sport.count({ where }),
    prisma.sport.findMany({
      where, skip, take: limit,
      include: { _count: { select: { classes: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { sports, pagination: buildPaginationMeta(total, page, limit) };
}

export async function createSport(data: any) {
  const existing = await prisma.sport.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError("Sport with this name already exists", 409);
  return prisma.sport.create({ data });
}

export async function getSportById(id: string) {
  const sport = await prisma.sport.findUnique({
    where: { id },
    include: { classes: { where: { isActive: true }, take: 10 } },
  });
  if (!sport) throw new AppError("Sport not found", 404);
  return sport;
}

export async function updateSport(id: string, data: any) {
  const sport = await prisma.sport.findUnique({ where: { id } });
  if (!sport) throw new AppError("Sport not found", 404);
  return prisma.sport.update({ where: { id }, data });
}

export async function deleteSport(id: string) {
  const sport = await prisma.sport.findUnique({ where: { id } });
  if (!sport) throw new AppError("Sport not found", 404);
  const activeClasses = await prisma.class.count({ where: { sportId: id, isActive: true } });
  if (activeClasses > 0) throw new AppError("Cannot deactivate sport with active classes", 400);
  return prisma.sport.update({ where: { id }, data: { isActive: false } });
}
