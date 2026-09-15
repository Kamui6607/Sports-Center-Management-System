import { Request, Response, NextFunction } from "express";
import * as roomsService from "./rooms.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const { rooms, pagination } = await roomsService.listRooms(req.query);
    sendSuccess(res, rooms, "Rooms retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function createRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomsService.createRoom(req.body);
    sendCreated(res, room, "Room created successfully");
  } catch (err) { next(err); }
}
export async function getRoomById(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomsService.getRoomById(req.params.id as string);
    sendSuccess(res, room, "Room retrieved successfully");
  } catch (err) { next(err); }
}
export async function updateRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomsService.updateRoom(req.params.id as string, req.body);
    sendSuccess(res, room, "Room updated successfully");
  } catch (err) { next(err); }
}
export async function deleteRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomsService.deleteRoom(req.params.id as string);
    sendSuccess(res, room, "Room deactivated successfully");
  } catch (err) { next(err); }
}
