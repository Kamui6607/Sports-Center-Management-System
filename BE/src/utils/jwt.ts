import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";
import { env } from "../config/env.js";

export interface JwtPayload {
  id: string;
  role: string;
  /** "Phiên bản mật khẩu" lúc cấp access token — xem `passwordVersion`. */
  pv?: string;
}

/**
 * Dấu vân tay ngắn của HASH mật khẩu hiện tại (không lộ gì về mật khẩu: hash bcrypt được băm lại).
 * Gắn vào access token; `authenticate*` so với hash trong DB ⇒ đổi/đặt lại mật khẩu làm MỌI access token
 * cũ hết hiệu lực ngay (refresh token cũng đã bị xóa), không cần cột/migration mới.
 */
export function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

/** Access token còn khớp mật khẩu hiện tại? (token không có `pv` = cấp trước khi có cơ chế ⇒ coi như hết hạn). */
export function isAccessTokenCurrent(payload: JwtPayload, passwordHash: string): boolean {
  return payload.pv === passwordVersion(passwordHash);
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    // `jti` ngẫu nhiên: hai lần đăng nhập trong cùng một giây không sinh token trùng
    // (RefreshToken.token là UNIQUE — trước đây gây 409 khi đăng ký Coach rồi đăng nhập ngay).
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<JwtPayload>;
  // JWT_ACCESS_SECRET còn ký QR điểm danh và thẻ Coach — chỉ token có đủ id + role mới là access token.
  if (typeof payload.id !== "string" || typeof payload.role !== "string") throw new Error("Invalid access token payload");
  return payload as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}

/** Returns seconds until expiry from JWT_REFRESH_EXPIRES_IN string (e.g. "7d") */
export function getRefreshTokenExpiryDate(): Date {
  const raw = env.JWT_REFRESH_EXPIRES_IN;
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error("Invalid JWT_REFRESH_EXPIRES_IN format");
  const value = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 3600 * 1000,
    d: 86400 * 1000,
  };
  return new Date(Date.now() + value * multipliers[unit]);
}
