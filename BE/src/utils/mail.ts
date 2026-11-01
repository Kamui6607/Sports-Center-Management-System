import { env } from "../config/env.js";

const RESEND_URL = "https://api.resend.com/emails";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const EMAILJS_REST_URL = "https://api.emailjs.com/api/v1.0/email/send";
const REQUEST_TIMEOUT_MS = 10_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** OTP code — template param `{{passcode}}` trong EmailJS template. */
  otpCode?: string;
  /** Nhãn thời gian hết hạn — template param `{{time}}` (vd. "15 phút"). Mặc định "15 phút". */
  expiryLabel?: string;
}

// ─── provider checks ────────────────────────────────────────────────────────

function emailjsConfigured(): boolean {
  return Boolean(
    env.EMAILJS_SERVICE_ID &&
    env.EMAILJS_TEMPLATE_ID &&
    env.EMAILJS_PUBLIC_KEY &&
    env.EMAILJS_PRIVATE_KEY
  );
}

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
 * Gửi qua EmailJS REST API (server-side).
 *
 * Template "One-Time Password" (template_f8a5vl6) dùng 3 biến:
 *   {{to_email}}  → địa chỉ nhận (To Email field trong EmailJS)
 *   {{passcode}}  → mã OTP 6 số
 *   {{time}}      → thời gian hết hạn (vd. "15 phút")
 *
 * Tài liệu: https://www.emailjs.com/docs/rest-api/send/
 */
async function sendViaEmailJS(input: SendEmailInput): Promise<void> {
  // Template params khớp với EmailJS template "One-Time Password":
  //   {{to_email}}  → địa chỉ nhận
  //   {{passcode}}  → mã OTP 6 số
  //   {{time}}      → thời gian hết hạn (vd. "15 phút")
  const payload = {
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    accessToken: env.EMAILJS_PRIVATE_KEY, // bắt buộc khi gọi từ server (private key)
    template_params: {
      to_email: input.to,
      passcode: input.otpCode ?? "",      // {{passcode}} trong template
      time: input.expiryLabel ?? "15 phút", // {{time}} trong template
    },
  };

  const res = await fetch(EMAILJS_REST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${body.slice(0, 300)}`);
  console.log(`[MAIL] EmailJS response ${res.status}: ${body.slice(0, 200)}`);
}

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
 * Gửi email: chọn provider theo MAIL_DRIVER (hoặc MAIL_PROVIDER cũ).
 *
 * Thứ tự ưu tiên khi driver = "auto":
 *   EmailJS (nếu đủ 4 key) → Resend → Brevo → SMTP.
 *
 * Đặt rõ MAIL_DRIVER=emailjs | smtp | resend | brevo để bỏ qua tự chọn.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const driver = env.MAIL_DRIVER;

  // ─── forced driver ──────────────────────────────────────────────────────
  if (driver === "emailjs") {
    if (!emailjsConfigured())
      throw new Error("MAIL_DRIVER=emailjs nhưng thiếu EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY / EMAILJS_PRIVATE_KEY.");
    await sendViaEmailJS(input);
    console.log(`[MAIL] Đã gửi qua EmailJS tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (driver === "resend") {
    if (!resendConfigured()) throw new Error("MAIL_DRIVER=resend nhưng thiếu RESEND_API_KEY / RESEND_FROM.");
    await sendViaResend(input);
    console.log(`[MAIL] Đã gửi qua Resend tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (driver === "brevo") {
    if (!brevoConfigured()) throw new Error("MAIL_DRIVER=brevo nhưng thiếu BREVO_API_KEY / BREVO_SENDER_EMAIL.");
    await sendViaBrevo(input);
    console.log(`[MAIL] Brevo đã NHẬN yêu cầu gửi tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (driver === "smtp") {
    if (!smtpConfigured()) throw new Error("MAIL_DRIVER=smtp nhưng thiếu SMTP_USER / SMTP_PASS.");
    await sendViaSmtp(input);
    console.log(`[MAIL] Đã gửi qua SMTP tới ${input.to} (subject: ${input.subject})`);
    return;
  }

  // ─── auto: EmailJS → Resend → Brevo → SMTP ─────────────────────────────
  if (emailjsConfigured()) {
    await sendViaEmailJS(input);
    console.log(`[MAIL] (auto) Đã gửi qua EmailJS tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (resendConfigured()) {
    await sendViaResend(input);
    console.log(`[MAIL] (auto) Resend đã NHẬN yêu cầu gửi tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (brevoConfigured()) {
    await sendViaBrevo(input);
    console.log(`[MAIL] (auto) Brevo đã NHẬN yêu cầu gửi tới ${input.to} (subject: ${input.subject})`);
    return;
  }
  if (smtpConfigured()) {
    await sendViaSmtp(input);
    console.log(`[MAIL] (auto) Đã gửi qua SMTP tới ${input.to} (subject: ${input.subject})`);
    return;
  }

  throw new Error(
    "Chưa cấu hình email: cần EMAILJS_*, hoặc RESEND_API_KEY + RESEND_FROM, hoặc BREVO_API_KEY + BREVO_SENDER_EMAIL, hoặc SMTP_USER + SMTP_PASS."
  );
}

// ─── email templates ─────────────────────────────────────────────────────────

/**
 * Email đặt lại mật khẩu: mã OTP 6 số (nhập trong app Mobile) + liên kết (Web). Cả hai hết hạn sau 15 phút.
 */
export function buildResetPasswordEmail(resetLink: string, otp?: string): { subject: string; html: string; otpCode?: string; resetLink: string } {
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
    otpCode: otp,
    resetLink,
  };
}

/**
 * Email đặt lại mật khẩu do QUẢN LÝ khởi tạo: mã OTP + liên kết tới trang `/reset-password` của Web (nhập
 * email + mã + mật khẩu mới). Mã cũng dùng được ở màn "Quên mật khẩu" của ứng dụng Mobile.
 * Liên kết KHÔNG chứa mã/token — lộ link không đủ để đổi mật khẩu. Không bao giờ chứa mật khẩu.
 */
export function buildAdminResetPasswordEmail(fullName: string, otp: string, resetUrl: string): { subject: string; html: string; otpCode: string; resetLink: string } {
  const safeName = fullName.replace(/[<>&"]/g, "");
  return {
    subject: "Yêu cầu đặt lại mật khẩu - Pulse Sports Center",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
        <h2 style="color:#203D31;">Đặt lại mật khẩu</h2>
        <p>Xin chào ${safeName},</p>
        <p>Quản lý trung tâm <strong>Pulse Sports Center</strong> vừa gửi cho bạn yêu cầu đặt lại mật khẩu. Mật khẩu hiện tại <strong>chưa thay đổi</strong> cho tới khi bạn tự đặt mật khẩu mới.</p>
        <p>Mã xác nhận của bạn:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0;color:#203D31;">${otp}</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#203D31;color:#fff;text-decoration:none;border-radius:6px;margin:8px 0;font-weight:bold;">
          Đặt mật khẩu mới
        </a>
        <p>Mở liên kết trên (hoặc ứng dụng Pulse → <strong>Quên mật khẩu</strong>), nhập email và mã rồi đặt mật khẩu mới. Sau khi đổi, mọi phiên đăng nhập cũ sẽ bị đăng xuất.</p>
        <p style="color:#666;font-size:13px;">Mã có hiệu lực trong <strong>15 phút</strong>, dùng một lần, khóa sau 5 lần nhập sai. Không chia sẻ mã này với bất kỳ ai — nhân viên trung tâm cũng không bao giờ hỏi mã.</p>
        <p style="color:#666;font-size:13px;">Nếu bạn không yêu cầu, hãy bỏ qua email này hoặc liên hệ trung tâm.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;"/>
        <p style="color:#aaa;font-size:12px;">Pulse Sports Center</p>
      </div>
    `,
    otpCode: otp,
    resetLink: resetUrl,
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
