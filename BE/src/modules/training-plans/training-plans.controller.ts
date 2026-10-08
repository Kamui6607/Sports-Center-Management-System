import { Request, Response, NextFunction } from "express";
import * as service from "./training-plans.service.js";
import { sendSuccess } from "../../utils/response.js";

export const createPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.createPlan(req.body as any, req.user);
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
};

export const getPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await service.getPlans(req.query.memberId as string, req.user!);
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
};

export const createResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createResult(req.body as any, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const updateResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.updateResult(req.params.id as string, req.body, req.user);
    sendSuccess(res, result, "Training result updated successfully");
  } catch (error) { next(error); }
};

export const deleteResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteResult(req.params.id as string, req.user);
    sendSuccess(res, null, "Training result deleted successfully");
  } catch (error) { next(error); }
};

export const getPlanProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getPlanProgress(req.params.id as string, req.user!);
    sendSuccess(res, data);
  } catch (error) { next(error); }
};

export const updatePlanCoach = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.updatePlanCoach(
      req.params.id as string,
      req.body.coachId,
      req.user
    );
    sendSuccess(res, plan, "Training plan coach updated successfully");
  } catch (error) { next(error); }
};