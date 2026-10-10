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

/**
 * Email đặt lại mật khẩu: mã OTP 6 số (nhập trong app Mobile) + liên kết (Web). Cả hai hết hạn sau 15 phút.
 */
export function buildResetPasswordEmail(resetLink: string, otp?: string): { subject: string; html: string } {
  const otpBlock = otp
    ? `
      <p>Mã xác nhận của bạn (nhập trong ứng dụng Pulse):</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0;">${otp}</p>
      <p>Hoặc mở liên kết dưới đây trên trình duyệt:</p>`
    : `<p>Mở liên kết dưới đây để đặt lại mật khẩu:</p>`;
  return {
    subject: "Đặt lại mật khẩu - Pulse Sports Center",
    html: `
      <h2>Đặt lại mật khẩu</h2>
      <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Pulse Sports Center.</p>
      ${otpBlock}
      <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#203D31;color:#fff;text-decoration:none;border-radius:5px;">Đặt lại mật khẩu</a>
      <p>Mã và liên kết có hiệu lực trong 15 phút. Không chia sẻ mã này với bất kỳ ai.</p>
      <p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
    `,
  };
}
