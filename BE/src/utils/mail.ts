import { env } from "../config/env.js";

const RESEND_URL = "https://api.resend.com/emails";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

// ─── provider checks ────────────────────────────────────────────────────────

function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM);
}

function brevoConfigured(): boolean {
  return Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

function smtpConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

// ─── providers ──────────────────────────────────────────────────────────────

/**
 * Gửi qua Resend (https://resend.com) — hoạt động tốt trên cloud, ít bị chặn IP.
 * RESEND_FROM phải là địa chỉ đã verify domain trên Resend.
 * Trong sandbox (free tier) chỉ gửi được tới địa chỉ email chính mình nếu dùng "onboarding@resend.dev".
 */
async function sendViaResend({ to, subject, html }: SendEmailInput): Promise<void> {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.RESEND_FROM, to, subject, html }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  console.log(`[MAIL] Resend response ${res.status}: ${body.slice(0, 200)}`);
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Gửi email: ưu tiên Resend → Brevo → SMTP (nodemailer).
 *
 * Thứ tự chọn provider:
 * 1. Nếu `MAIL_PROVIDER` được đặt rõ ("resend" | "brevo" | "smtp") → dùng đúng provider đó.
 * 2. Nếu "auto": Resend (nếu có key) → Brevo (nếu có key) → SMTP (nếu có credentials).
 * 3. Không có provider nào → THROW để outbox giữ lỗi trong `lastError` và retry.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const forced = env.MAIL_PROVIDER;

  if (forced === "resend") {
    if (!resendConfigured()) throw new Error("MAIL_PROVIDER=resend nhưng thiếu RESEND_API_KEY / RESEND_FROM.");
    await sendViaResend(input);
    console.log(`[MAIL] Đã gửi qua Resend tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (forced === "brevo") {
    if (!brevoConfigured()) throw new Error("MAIL_PROVIDER=brevo nhưng thiếu BREVO_API_KEY / BREVO_SENDER_EMAIL.");
    await sendViaBrevo(input);
    console.log(`[MAIL] Brevo đã NHẬN yêu cầu gửi tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (forced === "smtp") {
    if (!smtpConfigured()) throw new Error("MAIL_PROVIDER=smtp nhưng thiếu SMTP_USER / SMTP_PASS.");
    await sendViaSmtp(input);
    console.log(`[MAIL] Đã gửi qua SMTP tới ${input.to} (subject: ${input.subject})`);
    return;
  }

  // "auto": Resend → Brevo → SMTP
  if (resendConfigured()) {
    await sendViaResend(input);
    console.log(`[MAIL] Resend đã NHẬN yêu cầu gửi tới ${input.to} (subject: ${input.subject})`);
    return;
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
    "Chưa cấu hình email: cần RESEND_API_KEY + RESEND_FROM, hoặc BREVO_API_KEY + BREVO_SENDER_EMAIL, hoặc SMTP_USER + SMTP_PASS."
  );
}

// ─── email templates ─────────────────────────────────────────────────────────

/**
 * Email đặt lại mật khẩu: mã OTP 6 số (nhập trong app Mobile) + liên kết (Web). Cả hai hết hạn sau 15 phút.
 */
export function buildResetPasswordEmail(resetLink: string, otp?: string): { subject: string; html: string } {
  const otpBlock = otp
    ? `
      <p>Mã xác nhận của bạn (nhập trong ứng dụng Pulse):</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0;color:#203D31;">${otp}</p>
      <p>Hoặc mở liên kết dưới đây trên trình duyệt:</p>`
    : `<p>Mở liên kết dưới đây để đặt lại mật khẩu:</p>`;
  return {
    subject: "Đặt lại mật khẩu - Pulse Sports Center",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
        <h2 style="color:#203D31;">Đặt lại mật khẩu</h2>
        <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản <strong>Pulse Sports Center</strong>.</p>
        ${otpBlock}
        <a href="${resetLink}"
           style="display:inline-block;padding:12px 24px;background:#203D31;color:#fff;text-decoration:none;border-radius:6px;margin:8px 0;font-weight:bold;">
          Đặt lại mật khẩu
        </a>
        <p style="color:#666;font-size:13px;">Mã và liên kết có hiệu lực trong <strong>15 phút</strong>. Không chia sẻ mã này với bất kỳ ai.</p>
        <p style="color:#666;font-size:13px;">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;"/>
        <p style="color:#aaa;font-size:12px;">Pulse Sports Center</p>
      </div>
    `,
  };
}

/**
 * Email thông báo chung (gửi qua outbox).
 * Dùng khi một sự kiện nghiệp vụ cần gửi cả notification in-app lẫn email.
 */
export function buildNotificationEmail(title: string, body: string): { subject: string; html: string } {
  return {
    subject: `${title} - Pulse Sports Center`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
        <h2 style="color:#203D31;">${title}</h2>
        <p style="font-size:15px;color:#333;">${body}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;"/>
        <p style="color:#aaa;font-size:12px;">Pulse Sports Center — Bạn nhận được email này vì là thành viên của trung tâm.</p>
      </div>
    `,
  };
}
