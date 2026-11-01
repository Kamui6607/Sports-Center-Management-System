import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5_000;

/**
 * Middleware xác minh Cloudflare Turnstile CAPTCHA.
 *
 * Client gửi token trong body field `cf_turnstile_response` (hoặc header `x-turnstile-token`).
 * Nếu `CLOUDFLARE_TURNSTILE_SECRET_KEY` chưa được set → BỎ QUA (dev-friendly).
 *
 * Khi dùng test secret key (0x4AAAAAAA...) Cloudflare luôn trả success — phù hợp test local.
 *
 * Tài liệu: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function verifyTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Bỏ qua nếu chưa cấu hình secret key (dev mode).
  if (!env.CLOUDFLARE_TURNSTILE_SECRET_KEY) {
    return next();
  }

  // Lấy token từ body hoặc header.
  const token: string | undefined =
    req.body?.cf_turnstile_response ??
    (req.headers["x-turnstile-token"] as string | undefined);

  if (!token) {
    res.status(400).json({
      success: false,
      message: "Thiếu Turnstile token (cf_turnstile_response). Vui lòng hoàn thành CAPTCHA.",
      code: "TURNSTILE_TOKEN_MISSING",
    });
    return;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", env.CLOUDFLARE_TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    // Gửi kèm IP người dùng để tăng độ chính xác (tuỳ chọn nhưng khuyến nghị).
    const clientIp = req.ip ?? (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim();
    if (clientIp) formData.append("remoteip", clientIp);

    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });

    if (!verifyRes.ok) {
      throw new Error(`Turnstile HTTP ${verifyRes.status}`);
    }

    const result = (await verifyRes.json()) as { success: boolean; "error-codes"?: string[] };

    if (!result.success) {
      const codes = result["error-codes"]?.join(", ") ?? "unknown";
      console.warn(`[TURNSTILE] Xác minh thất bại (${req.ip}): ${codes}`);
      res.status(400).json({
        success: false,
        message: "Xác minh CAPTCHA thất bại. Vui lòng thử lại.",
        code: "TURNSTILE_INVALID",
      });
      return;
    }

    // Token hợp lệ — tiếp tục.
    next();
  } catch (err) {
    // Lỗi network/timeout khi gọi Cloudflare → không block user (fail-open).
    console.error("[TURNSTILE] Lỗi khi gọi Cloudflare verify:", (err as Error).message);
    next();
  }
}
