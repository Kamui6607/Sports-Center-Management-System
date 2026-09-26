import { Request, Response, NextFunction } from "express";
import * as plansService from "./membership-plans.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const { plans, pagination } = await plansService.listPlans(req.query);
    sendSuccess(res, plans, "Plans retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function createPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await plansService.createPlan(req.body);
    sendCreated(res, plan, "Plan created successfully");
  } catch (err) { next(err); }
}

export async function getPlanById(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await plansService.getPlanById(req.params.id as string);
    sendSuccess(res, plan, "Plan retrieved successfully");
  } catch (err) { next(err); }
}

export async function updatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await plansService.updatePlan(req.params.id as string, req.body);
    sendSuccess(res, plan, "Plan updated successfully");
  } catch (err) { next(err); }
}

export async function deletePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await plansService.deletePlan(req.params.id as string);
    sendSuccess(res, plan, "Plan deactivated successfully");
  } catch (err) { next(err); }
}
