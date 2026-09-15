import { Request, Response, NextFunction } from "express";
import * as coachService from "./coaches.service.js";
import { sendSuccess } from "../../utils/response.js";
import type { CoachQueryInput, UpdateCoachInput } from "./coaches.schema.js";

export async function listCoaches(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as CoachQueryInput;
    const { coaches, pagination } = await coachService.listCoaches(query);
    sendSuccess(res, coaches, "Coaches retrieved successfully", 200, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getCoachById(req: Request, res: Response, next: NextFunction) {
  try {
    const coach = await coachService.getCoachById(req.params.id as string);
    sendSuccess(res, coach, "Coach retrieved successfully");
  } catch (err) {
    next(err);
  }
}

export async function updateCoach(req: Request, res: Response, next: NextFunction) {
  try {
    const data = req.body as UpdateCoachInput;
    const updated = await coachService.updateCoach(req.params.id as string, data);
    sendSuccess(res, updated, "Coach updated successfully");
  } catch (err) {
    next(err);
  }
}
