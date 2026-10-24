import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.js";

/**
 * Rate limit cửa sổ trượt TRONG BỘ NHỚ tiến trình, theo user (hoặc IP khi chưa đăng nhập).
 *
 * Mục đích: chặn spam API (thêm giỏ, checkout, đánh giá, tra mã nhận hàng). Các giới hạn nghiệp vụ
 * quan trọng (số đơn chờ, số lượng/ngày, khóa đặt hàng) đều kiểm tra trong DB nên vẫn đúng khi chạy
 * nhiều instance; rate limit này chỉ là lớp chặn sớm (Doc/SHOP_FLOW_DESIGN.md D7).
 *
 * 429 `{ code: "RATE_LIMITED", retryAfterSeconds }`.
 */
export function rateLimit(opts: { name: string; windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    // Chạy e2e hàng loạt trong cùng tiến trình: tắt khi có biến môi trường này.
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const key = req.user?.id ?? req.ip ?? "anonymous";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((opts.windowMs - (now - recent[0])) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      sendError(res, "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.", 429, {
        code: "RATE_LIMITED",
        limit: opts.name,
        retryAfterSeconds,
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    // Chống phình Map ở server chạy dài.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= opts.windowMs)) hits.delete(k);
    }
    next();
  };
}
