import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || "smtp.gmail.com",
  port: Number(env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendResetPasswordEmail(email: string, resetLink: string) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.warn("\n[WARNING] Mail config missing in .env (SMTP_USER/SMTP_PASS). Skipping actual email send.");
    console.warn(`[WARNING] Would have sent link: ${resetLink}\n`);
    return;
  }
  
  await transporter.sendMail({
    from: `"Gym Center" <${env.SMTP_USER}>`,
    to: email,
    subject: "Reset Your Password - Gym Center",
    html: `
      <h2>Reset Your Password</h2>
      <p>You requested a password reset for your Gym Center account.</p>
      <p>Click the link below to reset it (this link is valid for 15 minutes):</p>
      <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:5px;">Reset Password</a>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}
