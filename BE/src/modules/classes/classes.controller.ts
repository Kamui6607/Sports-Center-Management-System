import { Request, Response, NextFunction } from "express";
import * as classesService from "./classes.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listClasses(req: Request, res: Response, next: NextFunction) {
  try {
    const { classes, pagination } = await classesService.listClasses(req.query);
    sendSuccess(res, classes, "Classes retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function createClass(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.createClass(req.body);
    sendCreated(res, cls, "Class created successfully");
  } catch (err) { next(err); }
}
export async function getClassById(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.getClassById(req.params.id as string);
    sendSuccess(res, cls, "Class retrieved successfully");
  } catch (err) { next(err); }
}
export async function updateClass(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.updateClass(req.params.id as string, req.body);
    sendSuccess(res, cls, "Class updated successfully");
  } catch (err) { next(err); }
}
export async function assignCoach(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.assignCoach(req.params.id as string, req.body.coachId, req.body.isPrimary ?? false);
    sendSuccess(res, cls, "Coach assigned successfully");
  } catch (err) { next(err); }
}
export async function removeCoach(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.removeCoach(req.params.id as string, req.params.coachId as string);
    sendSuccess(res, cls, "Coach removed successfully");
  } catch (err) { next(err); }
}
export async function deleteClass(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.deleteClass(req.params.id as string);
    sendSuccess(res, cls, "Class deactivated successfully");
  } catch (err) { next(err); }
}
