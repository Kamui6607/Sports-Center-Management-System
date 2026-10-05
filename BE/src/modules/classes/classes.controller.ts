import { Request, Response, NextFunction } from "express";
import * as classesService from "./classes.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listClasses(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = req.user ? { id: req.user.id, role: req.user.role } : undefined;
    const { classes, pagination } = await classesService.listClasses(req.query, actor);
    sendSuccess(res, classes, "Classes retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function createClass(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = { id: req.user!.id, role: req.user!.role };
    const cls = await classesService.createClass(req.body, actor);
    sendCreated(res, cls, "Class created successfully");
  } catch (err) { next(err); }
}
export async function reviewClass(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, reason } = req.body;
    const cls = await classesService.reviewClass(req.params.id as string, action, reason);
    const msg = action === "APPROVE" ? "Class approved successfully" : "Class rejected";
    sendSuccess(res, cls, msg);
  } catch (err) { next(err); }
}
export async function getClassById(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.getClassById(req.params.id as string);
    sendSuccess(res, cls, "Class retrieved successfully");
  } catch (err) { next(err); }
}
export async function getClassCoursePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await classesService.getClassCoursePlan(req.params.id as string, req.user);
    sendSuccess(res, plan, "Class course plan retrieved successfully");
  } catch (err) { next(err); }
}
export async function updateClass(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = { id: req.user!.id, role: req.user!.role };
    const cls = await classesService.updateClass(req.params.id as string, req.body, actor);
    sendSuccess(res, cls, "Class updated successfully");
  } catch (err) { next(err); }
}
export async function deleteClass(req: Request, res: Response, next: NextFunction) {
  try {
    const cls = await classesService.deleteClass(req.params.id as string);
    sendSuccess(res, cls, "Class deactivated successfully");
  } catch (err) { next(err); }
}
