import { env } from "../config/env.js";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 10_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

function brevoConfigured(): boolean {
  return Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

function smtpConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

async function sendViaBrevo({ to, subject, html }: SendEmailInput): Promise<void> {
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY!,
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

  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  // Brevo trả 201 = đã NHẬN yêu cầu, chưa chắc đã giao tới hộp thư. Tra messageId trong Brevo → Transactional → Logs.
  console.log(`[MAIL] Brevo response ${res.status}: ${body.slice(0, 200)}`);
}

async function sendViaSmtp({ to, subject, html }: SendEmailInput): Promise<void> {
  const nodemailer = await import("nodemailer");
  const port = Number(env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: env.SMTP_SECURE || port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporter.sendMail({
    from: env.SMTP_FROM ?? `"${env.BREVO_SENDER_NAME}" <${env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

/**
 * Gửi email: ưu tiên Brevo (HTTPS API); không có Brevo thì dùng SMTP (nodemailer).
 * - Không cấu hình provider nào ⇒ THROW (mọi môi trường) để outbox giữ lỗi trong `lastError` và retry,
 *   thay vì đánh dấu SENT mà thực tế không có mail nào được gửi.
 * - Provider trả lỗi ⇒ throw (kèm tên provider); outbox retry theo backoff.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const forced = env.MAIL_PROVIDER;
  if (forced === "smtp") {
    if (!smtpConfigured()) throw new Error("MAIL_PROVIDER=smtp nhưng thiếu SMTP_USER / SMTP_PASS.");
    await sendViaSmtp(input);
    console.log(`[MAIL] Đã gửi qua SMTP tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (forced === "brevo" && !brevoConfigured()) {
    throw new Error("MAIL_PROVIDER=brevo nhưng thiếu BREVO_API_KEY / BREVO_SENDER_EMAIL.");
  }
  if (brevoConfigured()) {
    await sendViaBrevo(input);
    console.log(`[MAIL] Brevo đã NHẬN yêu cầu gửi tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (smtpConfigured()) {
    await sendViaSmtp(input);
    console.log(`[MAIL] Đã gửi qua SMTP tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  throw new Error(
    "Chưa cấu hình email: cần BREVO_API_KEY + BREVO_SENDER_EMAIL, hoặc SMTP_USER + SMTP_PASS (+ SMTP_HOST/SMTP_PORT)."
  );
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
