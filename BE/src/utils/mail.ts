import { env } from "../config/env.js";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 10_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Gửi email qua Brevo Transactional Email API (HTTPS, dùng `fetch` có sẵn — không cần thư viện).
 * - Thiếu BREVO_API_KEY/BREVO_SENDER_EMAIL: ở dev chỉ cảnh báo và bỏ qua; ở production THROW
 *   để outbox ghi lỗi và retry (không "mất" email trong im lặng).
 * - Brevo trả non-2xx ⇒ throw (outbox sẽ retry theo backoff).
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    const msg = "Brevo chưa cấu hình (BREVO_API_KEY / BREVO_SENDER_EMAIL).";
    if (env.NODE_ENV === "production") throw new Error(msg);
    console.warn(`\n[WARNING] ${msg} Bỏ qua gửi email thật tới ${to} (subject: ${subject}).\n`);
    return;
  }

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Brevo ${res.status}: ${detail}`);
  }
}

export function buildResetPasswordEmail(resetLink: string): { subject: string; html: string } {
  return {
    subject: "Reset Your Password - Gym Center",
    html: `
      <h2>Reset Your Password</h2>
      <p>You requested a password reset for your Gym Center account.</p>
      <p>Click the link below to reset it (this link is valid for 15 minutes):</p>
      <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:5px;">Reset Password</a>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  };
}
