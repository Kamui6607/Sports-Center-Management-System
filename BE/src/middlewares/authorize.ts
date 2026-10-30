import { Request, Response, NextFunction } from "express";
import type { RoleName } from "../utils/roles.js";
import { sendError } from "../utils/response.js";

export function authorize(...roles: RoleName[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Unauthorized", 401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, "Forbidden: insufficient permissions", 403);
      return;
    }
    next();
  };
}
