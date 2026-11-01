import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 8080),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",

  // ── Email driver ─────────────────────────────────────────────────────────────
  // MAIL_DRIVER (hoặc MAIL_PROVIDER cũ) chọn kênh gửi mail:
  //   "emailjs" → EmailJS REST API (server-side, yêu cầu EMAILJS_PRIVATE_KEY).
  //   "smtp"    → Gmail / SMTP qua nodemailer.
  //   "resend"  → Resend.com.
  //   "brevo"   → Brevo Transactional API.
  //   "auto"    → Tự chọn theo thứ tự: emailjs → resend → brevo → smtp.
  /** Đọc MAIL_DRIVER trước; fallback MAIL_PROVIDER để tương thích ngược. */
  MAIL_DRIVER: (process.env.MAIL_DRIVER ?? process.env.MAIL_PROVIDER ?? "auto").toLowerCase(),
  // Alias tương thích ngược cho code cũ đọc MAIL_PROVIDER.
  get MAIL_PROVIDER() { return this.MAIL_DRIVER; },

  // ── EmailJS server-side (https://www.emailjs.com/docs/rest-api/send/) ────────
  EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY,
  EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY,

  // ── Resend (https://resend.com) ───────────────────────────────────────────────
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,

  // ── Brevo Transactional API ───────────────────────────────────────────────────
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME ?? "Gym Center",

  // ── Fallback SMTP (nodemailer / Gmail App Password) ───────────────────────────
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,

  // ── Frontend URL (dựng link reset password trong email) ───────────────────────
  FRONTEND_URL: (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, ""),

  // ── Cloudflare Turnstile CAPTCHA (server-side verify) ────────────────────────
  // Lấy secret tại: dash.cloudflare.com → Turnstile → <site> → Secret key.
  // Để trống / không set = BỎ QUA kiểm tra (dev-friendly; production nên set).
  CLOUDFLARE_TURNSTILE_SECRET_KEY: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
};
