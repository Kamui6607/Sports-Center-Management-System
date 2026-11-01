/**
 * Script test thủ công:
 *   npx tsx scripts/test-emailjs.ts <email_nhận>
 *
 * Dùng để kiểm tra EmailJS gửi OTP template hoạt động đúng.
 */
import "dotenv/config";

const EMAILJS_REST_URL = "https://api.emailjs.com/api/v1.0/email/send";

const serviceId   = process.env.EMAILJS_SERVICE_ID;
const templateId  = process.env.EMAILJS_TEMPLATE_ID;
const publicKey   = process.env.EMAILJS_PUBLIC_KEY;
const privateKey  = process.env.EMAILJS_PRIVATE_KEY;
const mailDriver  = process.env.MAIL_DRIVER ?? "auto";

const toEmail = process.argv[2] ?? "tranngoc5979@gmail.com";
const testOtp = "123456";

console.log("=== EmailJS Test Script ===");
console.log(`MAIL_DRIVER   : ${mailDriver}`);
console.log(`SERVICE_ID    : ${serviceId}`);
console.log(`TEMPLATE_ID   : ${templateId}`);
console.log(`PUBLIC_KEY    : ${publicKey}`);
console.log(`PRIVATE_KEY   : ${privateKey ? privateKey.slice(0, 6) + "..." : "(missing)"}`);
console.log(`To            : ${toEmail}`);
console.log(`OTP (passcode): ${testOtp}`);
console.log("");

if (!serviceId || !templateId || !publicKey || !privateKey) {
  console.error("❌ Thiếu một hoặc nhiều biến EMAILJS_*. Kiểm tra lại file .env.");
  process.exit(1);
}

const payload = {
  service_id:   serviceId,
  template_id:  templateId,
  user_id:      publicKey,
  accessToken:  privateKey,
  template_params: {
    to_email: toEmail,
    passcode: testOtp,
    time:     "15 phút",
  },
};

console.log("Payload gửi đến EmailJS:");
console.log(JSON.stringify({ ...payload, accessToken: "***" }, null, 2));
console.log("");

async function main() {
  try {
    const res = await fetch(EMAILJS_REST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.text();
    console.log(`HTTP Status : ${res.status}`);
    console.log(`Response    : ${body}`);

    if (res.ok) {
      console.log(`\n✅ Gửi thành công! Kiểm tra hộp thư ${toEmail}`);
    } else {
      console.log(`\n❌ Gửi thất bại (${res.status}): ${body}`);
    }
  } catch (err) {
    console.error("❌ Lỗi network:", (err as Error).message);
  }
}

main();
