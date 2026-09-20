import { Request, Response, NextFunction } from "express";
import * as service from "./training-plans.service.js";

export const createPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.createPlan(req.body as any, req.user);
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
};

export const getPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await service.getPlans(req.query.memberId as string);
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
};

export const createResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createResult(req.body as any, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
};