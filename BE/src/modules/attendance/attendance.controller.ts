import { Request, Response, NextFunction } from "express";
import * as service from "./attendance.service.js";
import * as penalties from "./attendance-penalties.service.js";
import { sendSuccess } from "../../utils/response.js";

export const createAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendance = await service.createAttendance(req.body as any, req.user);
    res.status(201).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

export const getAttendances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAttendancesBySchedule(
      req.query.scheduleId as string,
      req.user!
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendance = await service.updateAttendance(req.params.id as string, req.body as any, req.user);
    res.json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

export const generateQr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.generateQrToken(req.body.scheduleId, req.user);
    res.json({ success: true, message: "QR token generated successfully", data: result });
  } catch (error) { next(error); }
};

export const scanQr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendance = await service.scanQr(
      req.body as { qrToken?: string; code?: string },
      req.user
    );
    res.json({ success: true, message: "Điểm danh thành công", data: attendance });
  } catch (error) { next(error); }
};

// ─── MEMBER SELF-SERVICE ───────────────────────────────────────────────────
export const getMyAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { records, pagination } = await service.getMyAttendance(req.user!.id, req.query);
    sendSuccess(res, records, "Attendance retrieved successfully", 200, pagination);
  } catch (error) { next(error); }
};

export const getMyAttendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await service.getMyAttendanceSummary(req.user!.id);
    sendSuccess(res, summary, "Attendance summary retrieved successfully");
  } catch (error) { next(error); }
};

// ─── WARNING + PENALTY (MANAGER) ───────────────────────────────────────────
export const scanWarnings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.scanAttendanceWarnings(req.body?.classId);
    sendSuccess(res, result, "Attendance warnings scanned");
  } catch (error) { next(error); }
};

export const previewPenalties = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await penalties.previewPenalties();
    sendSuccess(res, result, "Penalty preview generated");
  } catch (error) { next(error); }
};

export const applyPenalty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await penalties.applyPenalty({
      memberId: req.body.memberId,
      classId: req.body.classId,
      reason: req.body.reason,
      decidedByUserId: req.user!.id,
    });
    sendSuccess(res, result, "Attendance penalty applied");
  } catch (error) { next(error); }
};

export const listPenalties = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { penalties: rows, pagination } = await penalties.listPenalties(req.query);
    sendSuccess(res, rows, "Attendance penalties retrieved successfully", 200, pagination);
  } catch (error) { next(error); }
};

export const appealPenalty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await penalties.appealPenalty(
      req.params.id as string,
      req.user!.id,
      req.body.reason
    );
    sendSuccess(res, result, "Appeal submitted");
  } catch (error) { next(error); }
};

export const revokePenalty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await penalties.revokePenalty(req.params.id as string, req.user!.id, {
      reason: req.body?.reason,
      restoreSlots: req.body?.restoreSlots,
    });
    sendSuccess(res, result, "Attendance penalty revoked");
  } catch (error) { next(error); }
};