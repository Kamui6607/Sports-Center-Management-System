import { Request, Response, NextFunction } from "express";
import * as schedulesService from "./class-schedules.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const { schedules, pagination } = await schedulesService.listSchedules(req.query);
    sendSuccess(res, schedules, "Schedules retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const schedule = await schedulesService.createSchedule(req.body);
    sendCreated(res, schedule, "Schedule created successfully");
  } catch (err) { next(err); }
}
export async function getScheduleById(req: Request, res: Response, next: NextFunction) {
  try {
    const schedule = await schedulesService.getScheduleById(req.params.id as string);
    sendSuccess(res, schedule, "Schedule retrieved successfully");
  } catch (err) { next(err); }
}
export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const schedule = await schedulesService.updateSchedule(req.params.id as string, req.body);
    sendSuccess(res, schedule, "Schedule updated successfully");
  } catch (err) { next(err); }
}
export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const schedule = await schedulesService.deleteSchedule(req.params.id as string);
    sendSuccess(res, schedule, "Schedule cancelled successfully");
  } catch (err) { next(err); }
}
