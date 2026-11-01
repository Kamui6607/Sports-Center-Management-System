import { Request, Response, NextFunction } from "express";
import { sendCreated, sendSuccess } from "../../utils/response.js";
import * as service from "./makeup-requests.service.js";
import { openMakeupSlot, type OpenSlotInput } from "./makeup-slots.service.js";

const actorOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await service.listMyMakeupRequests(req.user!.id), "Makeup requests retrieved");
  } catch (err) { next(err); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { requests, pagination } = await service.listMakeupRequests(actorOf(req), req.query as Record<string, string>);
    sendSuccess(res, requests, "Makeup requests retrieved", 200, pagination);
  } catch (err) { next(err); }
}

export async function options(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await service.getMakeupOptions(req.params.id as string, actorOf(req)), "Makeup options retrieved");
  } catch (err) { next(err); }
}

export async function assign(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await service.assignMakeup(req.params.id as string, req.body.scheduleId, actorOf(req)), "Đã xếp buổi học bù");
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await service.rejectMakeupRequest(req.params.id as string, actorOf(req), req.body.reason), "Đã từ chối yêu cầu học bù");
  } catch (err) { next(err); }
}

export async function cancelMine(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await service.cancelMyMakeupRequest(req.params.id as string, actorOf(req)), "Đã rút yêu cầu học bù");
  } catch (err) { next(err); }
}

export async function openSlot(req: Request, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await openMakeupSlot(actorOf(req), req.body as OpenSlotInput), "Đã mở buổi bù");
  } catch (err) { next(err); }
}
