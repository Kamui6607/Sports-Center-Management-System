import { Request, Response, NextFunction } from "express";
import * as sportsService from "./sports.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listSports(req: Request, res: Response, next: NextFunction) {
  try {
    const { sports, pagination } = await sportsService.listSports(req.query);
    sendSuccess(res, sports, "Sports retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function createSport(req: Request, res: Response, next: NextFunction) {
  try {
    const sport = await sportsService.createSport(req.body);
    sendCreated(res, sport, "Sport created successfully");
  } catch (err) { next(err); }
}
export async function getSportById(req: Request, res: Response, next: NextFunction) {
  try {
    const sport = await sportsService.getSportById(req.params.id as string);
    sendSuccess(res, sport, "Sport retrieved successfully");
  } catch (err) { next(err); }
}
export async function updateSport(req: Request, res: Response, next: NextFunction) {
  try {
    const sport = await sportsService.updateSport(req.params.id as string, req.body);
    sendSuccess(res, sport, "Sport updated successfully");
  } catch (err) { next(err); }
}
export async function deleteSport(req: Request, res: Response, next: NextFunction) {
  try {
    const sport = await sportsService.deleteSport(req.params.id as string);
    sendSuccess(res, sport, "Sport deactivated successfully");
  } catch (err) { next(err); }
}
