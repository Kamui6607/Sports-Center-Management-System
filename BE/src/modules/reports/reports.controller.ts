import { Request, Response, NextFunction } from "express";
import * as reportsService from "./reports.service.js";
import { sendSuccess } from "../../utils/response.js";

export async function getRevenueReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = req.query as any;
    const report = await reportsService.getRevenueReport(startDate, endDate);
    sendSuccess(res, report, "Revenue report retrieved successfully");
  } catch (err) { next(err); }
}
export async function getMemberReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = req.query as any;
    const report = await reportsService.getMemberReport(startDate, endDate);
    sendSuccess(res, report, "Member report retrieved successfully");
  } catch (err) { next(err); }
}
export async function getEnrollmentReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = req.query as any;
    const report = await reportsService.getEnrollmentReport(startDate, endDate);
    sendSuccess(res, report, "Enrollment report retrieved successfully");
  } catch (err) { next(err); }
}
export async function getMembershipReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = req.query as any;
    const report = await reportsService.getMembershipReport(startDate, endDate);
    sendSuccess(res, report, "Membership report retrieved successfully");
  } catch (err) { next(err); }
}
