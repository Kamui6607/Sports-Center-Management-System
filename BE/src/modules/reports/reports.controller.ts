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
export async function getCourseRevenueReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = req.query as any;
    const report = await reportsService.getCourseRevenueReport(startDate, endDate);
    sendSuccess(res, report, "Course revenue report retrieved successfully");
  } catch (err) { next(err); }
}

export async function getCoursePurchaseLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, page, limit } = req.query as any;
    const report = await reportsService.getCoursePurchaseLogs(startDate, endDate, page, limit);
    sendSuccess(res, report, "Course purchase logs retrieved successfully");
  } catch (err) { next(err); }
}

export async function getAttendanceReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows, summary, pagination } = await reportsService.getAttendanceReport(req.query as any);
    sendSuccess(
      res,
      { rows, summary },
      "Attendance report retrieved successfully",
      200,
      pagination
    );
  } catch (err) { next(err); }
}
