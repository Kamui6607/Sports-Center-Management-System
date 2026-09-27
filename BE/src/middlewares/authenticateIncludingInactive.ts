import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";
import { prisma } from "../config/prisma.js";

/**
 * Giống `authenticate` nhưng KHÔNG chặn isActive=false.
 * Dùng cho endpoint Coach nộp CV — Coach vừa đăng ký chưa được duyệt (isActive=false)
 * vẫn cần có token để xác định mình là ai và upload CV.
 */
export async function authenticateIncludingInactive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Unauthorized: missing token", 401);
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, isActive: true },
    });

    if (!user) {
      sendError(res, "Unauthorized: user not found", 401);
      return;
    }

    // NOTE: Cho phép cả isActive=false (Coach chưa được duyệt vẫn được qua)
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
