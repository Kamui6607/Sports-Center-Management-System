import { prisma } from "../../config/prisma.js";
import { MAKEUP } from "../../config/makeup.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { createNotification } from "../notifications/notifications.service.js";
import {
  assertCanManageClassSchedule,
  assertClassRoomAreaMatch,
  checkScheduleConflicts,
  lockScheduleResources,
} from "../class-schedules/class-schedules.service.js";
import { assignMakeup, type MakeupActor } from "./makeup-requests.service.js";

const DAY = 86_400_000;

export type OpenSlotInput = {
  classId: string;
  startTime: string;
  endTime: string;
  roomId?: string;
  capacity?: number;
  /** Yêu cầu PENDING của khóa này để xếp luôn vào buổi bù vừa mở. */
  assignRequestIds?: string[];
};

const fmtSession = (d: Date) =>
  d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/**
 * HLV MỞ BUỔI BÙ cho một khóa (Doc/MAKEUP_ABSENCE_PLAN.md §3.4) — không thay buổi nào, không bán, không tự ghi danh.
 * - Khóa APPROVED của chính HLV; giờ cách hiện tại ≥ 2h, dài ≤ 4h, từ ngày bắt đầu khóa tới ngày kết thúc + 14 ngày.
 * - Phòng: mặc định phòng của buổi gần nhất; đúng khu vực, đủ sức chứa; không trùng phòng / lịch dạy HLV.
 * - Xếp luôn các yêu cầu được chọn; học viên còn chờ của khóa nhận thông báo để tự chọn.
 */
export async function openMakeupSlot(actor: MakeupActor, input: OpenSlotInput) {
  await assertCanManageClassSchedule(prisma, actor, input.classId);
  const cls = await prisma.class.findUnique({
    where: { id: input.classId },
    select: { id: true, name: true, status: true, areaType: true, capacity: true, coachId: true, startDate: true, endDate: true },
  });
  if (!cls) throw new AppError("Class not found", 404);
  if (cls.status !== "APPROVED") throw new AppError("Chỉ mở buổi bù cho khóa đang hoạt động.", 400, { code: "CLASS_NOT_APPROVED" });

  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new AppError("Giờ buổi bù không hợp lệ.", 400, { code: "SLOT_TIME_INVALID" });
  }
  if (end.getTime() - start.getTime() > MAKEUP.SLOT_MAX_DURATION_MINUTES * 60_000) {
    throw new AppError(`Buổi bù dài tối đa ${MAKEUP.SLOT_MAX_DURATION_MINUTES / 60} giờ.`, 400, { code: "SLOT_TOO_LONG" });
  }
  if (start.getTime() < Date.now() + MAKEUP.SLOT_MIN_LEAD_MINUTES * 60_000) {
    throw new AppError(`Buổi bù phải cách hiện tại ít nhất ${MAKEUP.SLOT_MIN_LEAD_MINUTES / 60} giờ.`, 400, { code: "SLOT_TOO_SOON" });
  }
  if (cls.startDate && start < new Date(cls.startDate.getTime() - DAY)) {
    throw new AppError("Buổi bù phải sau ngày bắt đầu khóa.", 400, { code: "SLOT_OUT_OF_RANGE" });
  }
  if (cls.endDate && start.getTime() > cls.endDate.getTime() + MAKEUP.SLOT_MAX_DAYS_AFTER_COURSE * DAY) {
    throw new AppError(`Buổi bù chỉ được mở tới ${MAKEUP.SLOT_MAX_DAYS_AFTER_COURSE} ngày sau khi khóa kết thúc.`, 400, {
      code: "SLOT_OUT_OF_RANGE",
    });
  }
  const capacity = input.capacity ?? cls.capacity;
  if (capacity < 1 || capacity > cls.capacity) {
    throw new AppError(`Sức chứa buổi bù từ 1 đến ${cls.capacity}.`, 400, { code: "SLOT_CAPACITY_INVALID" });
  }

  let roomId = input.roomId;
  if (!roomId) {
    const last = await prisma.classSchedule.findFirst({ where: { classId: cls.id }, orderBy: { startTime: "desc" }, select: { roomId: true } });
    roomId = last?.roomId;
  }
  if (!roomId) throw new AppError("Chọn phòng cho buổi bù.", 400, { code: "SLOT_ROOM_REQUIRED" });
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || !room.isActive) throw new AppError("Room not found or inactive", 404);
  assertClassRoomAreaMatch(cls.areaType, room.areaType);
  if (room.capacity < capacity) throw new AppError("Phòng không đủ sức chứa cho buổi bù.", 400, { code: "ROOM_TOO_SMALL" });

  const slot = await prisma.$transaction(async (tx) => {
    await lockScheduleResources(tx, [roomId!], [cls.coachId]);
    await checkScheduleConflicts(tx, roomId!, cls.id, start, end);
    return tx.classSchedule.create({
      data: { classId: cls.id, roomId: roomId!, startTime: start, endTime: end, status: "SCHEDULED", isMakeupSlot: true, slotCapacity: capacity },
      include: { room: { select: { name: true } } },
    });
  });

  // Xếp từng yêu cầu được chọn (lỗi của một yêu cầu không chặn các yêu cầu khác).
  const assigned: string[] = [];
  const failed: { requestId: string; message: string; code?: string }[] = [];
  for (const requestId of [...new Set(input.assignRequestIds ?? [])]) {
    const req = await prisma.makeupRequest.findUnique({ where: { id: requestId }, select: { paidClassId: true } });
    if (!req || req.paidClassId !== cls.id) {
      failed.push({ requestId, message: "Yêu cầu không thuộc khóa này.", code: "MAKEUP_NOT_IN_CLASS" });
      continue;
    }
    try {
      await assignMakeup(requestId, slot.id, actor);
      assigned.push(requestId);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      failed.push({ requestId, message: err.message, code: (err.errors as { code?: string } | undefined)?.code });
    }
  }

  const waiting = await prisma.makeupRequest.findMany({
    where: { paidClassId: cls.id, status: "PENDING" },
    select: { id: true, member: { select: { userId: true } } },
  });
  for (const w of waiting) {
    createNotification(
      w.member.userId,
      "MAKEUP_SLOT_OPENED",
      `HLV mở buổi bù: ${cls.name}`,
      `Có buổi bù ${fmtSession(start)} tại ${slot.room.name}. Mở yêu cầu học bù của bạn để chọn buổi này.`,
      { metadata: { makeupRequestId: w.id, scheduleId: slot.id, classId: cls.id } }
    ).catch(() => {});
  }

  return {
    slot: {
      id: slot.id,
      classId: cls.id,
      className: cls.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomId: slot.roomId,
      roomName: slot.room.name,
      capacity,
      isMakeupSlot: true,
    },
    assigned,
    failed,
    notifiedWaiting: waiting.length,
  };
}
