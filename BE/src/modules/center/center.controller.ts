import { Request, Response, NextFunction } from "express";
import * as service from "./center.service.js";
import { sendSuccess } from "../../utils/response.js";

export const getCenter = async (_req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await service.getCenter(), "Thông tin trung tâm"); } catch (e) { next(e); }
};
export const updateCenter = async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await service.updateCenter(req.body), "Đã cập nhật thông tin trung tâm"); } catch (e) { next(e); }
};
