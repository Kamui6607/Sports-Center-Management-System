import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listRooms(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.search) where.name = { contains: query.search, mode: "insensitive" };

  const [total, rooms] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
  ]);
  return { rooms, pagination: buildPaginationMeta(total, page, limit) };
}

export async function createRoom(data: any) {
  const existing = await prisma.room.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError("Room with this name already exists", 409);
  return prisma.room.create({ data });
}

export async function getRoomById(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError("Room not found", 404);
  return room;
}

export async function updateRoom(id: string, data: any) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError("Room not found", 404);
  return prisma.room.update({ where: { id }, data });
}

export async function deleteRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError("Room not found", 404);
  const scheduled = await prisma.classSchedule.count({
    where: { roomId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
  });
  if (scheduled > 0) throw new AppError("Cannot deactivate room with upcoming schedules", 400);
  return prisma.room.update({ where: { id }, data: { isActive: false } });
}
