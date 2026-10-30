import { Request, Response, NextFunction } from "express";
import * as service from "./locations.service.js";
import { sendSuccess } from "../../utils/response.js";

export const listProvinces = async (_req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await service.listProvinces(), "Provinces retrieved successfully"); } catch (e) { next(e); }
};
export const listDistricts = async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await service.listDistricts(Number(req.params.code)), "Districts retrieved successfully"); } catch (e) { next(e); }
};
export const listWards = async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await service.listWards(Number(req.params.code)), "Wards retrieved successfully"); } catch (e) { next(e); }
};
