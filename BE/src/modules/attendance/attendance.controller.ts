import { Request, Response, NextFunction } from "express";
import * as service from "./attendance.service.js";

export const createAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendance = await service.createAttendance(req.body as any, req.user);
    res.status(201).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

export const getAttendances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAttendancesBySchedule(req.query.scheduleId as string);
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
    const attendance = await service.scanQr(req.body.qrToken, req.user);
    res.json({ success: true, message: "Điểm danh thành công", data: attendance });
  } catch (error) { next(error); }
};