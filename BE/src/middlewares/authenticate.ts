import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";
import { prisma } from "../config/prisma.js";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Unauthorized: missing token", 401);
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    
    // BR-02: Ensure user is still active and role hasn't changed
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, isActive: true }
    });

    if (!user) {
      sendError(res, "Unauthorized: user not found", 401);
      return;
    }
    if (!user.isActive) {
      sendError(res, "Unauthorized: account is locked", 401);
      return;
    }
    if (user.role !== payload.role) {
      sendError(res, "Unauthorized: role has changed, please login again", 401);
      return;
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    sendError(res, "Unauthorized: invalid or expired token", 401);
  }
}
