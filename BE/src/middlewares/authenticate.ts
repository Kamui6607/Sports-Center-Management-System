import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Unauthorized: missing token", 401);
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, role: payload.role as any };
    next();
  } catch {
    sendError(res, "Unauthorized: invalid or expired token", 401);
  }
}
