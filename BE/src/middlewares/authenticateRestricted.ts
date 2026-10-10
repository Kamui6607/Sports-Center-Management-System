import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";
import { prisma } from "../config/prisma.js";
import { ROLE_NAME_SELECT, type RoleName } from "../utils/roles.js";
import { isRestrictedCoach } from "../utils/certification.js";

/**
 * Giống `authenticate` nhưng cho phép thêm "phiên giới hạn" (BE-9): Coach chưa được duyệt CV
 * (`isActive=false`). Chỉ gắn vào các endpoint hồ sơ/CV (`/auth/me*`, `/auth/logout`, `/coaches/me/cv`).
 * Tài khoản bị khóa vì lý do khác (member/manager/coach đã duyệt bị khóa) vẫn bị chặn như cũ.
 */
export async function authenticateRestricted(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Unauthorized: missing token", 401);
    return;
  }

  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        isActive: true,
        role: ROLE_NAME_SELECT,
        coachProfile: { select: { certification: { select: { status: true } } } },
      },
    });

    if (!user) {
      sendError(res, "Unauthorized: user not found", 401);
      return;
    }
    if (user.role.name !== payload.role) {
      sendError(res, "Unauthorized: role has changed, please login again", 401);
      return;
    }
    const restricted = isRestrictedCoach(user);
    if (!user.isActive && !restricted) {
      sendError(res, "Unauthorized: account is locked", 401);
      return;
    }

    req.user = { id: user.id, role: user.role.name as RoleName, ...(restricted ? { restricted: true } : {}) };
    next();
  } catch {
    sendError(res, "Unauthorized: invalid or expired token", 401);
  }
}
