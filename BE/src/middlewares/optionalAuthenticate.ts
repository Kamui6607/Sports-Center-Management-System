import { Request, Response, NextFunction } from "express";
import { authenticate } from "./authenticate.js";

/**
 * BE-1: xác thực TÙY CHỌN cho endpoint công khai.
 * - Không gửi `Authorization` ⇒ Guest (`req.user` = undefined).
 * - Có gửi ⇒ xác thực như `authenticate` (token hỏng/hết hạn ⇒ 401 để client tự refresh,
 *   KHÔNG âm thầm hạ xuống Guest — tránh hiển thị sai dữ liệu theo vai trò).
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    next();
    return;
  }
  void authenticate(req, res, next);
}
