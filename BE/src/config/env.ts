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
  // Email — thứ tự ưu tiên: Resend → Brevo → SMTP (nodemailer).
  // Resend (https://resend.com): hoạt động tốt trên cloud, ít bị chặn IP hơn Gmail.
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  // Brevo Transactional API (https://api.brevo.com/v3/smtp/email). Sender phải verify trên Brevo.
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME ?? "Gym Center",
  // Chọn kênh gửi mail cụ thể: "auto" (mặc định) | "resend" | "brevo" | "smtp".
  MAIL_PROVIDER: (process.env.MAIL_PROVIDER ?? "auto").toLowerCase(),
  // Fallback SMTP (vd. Gmail App Password khi dev local).
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  // Base URL của FE để dựng link trong email (reset password...).
  FRONTEND_URL: (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
};
