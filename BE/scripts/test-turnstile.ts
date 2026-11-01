/**
 * Script test Cloudflare Turnstile verify (server-side).
 *   npx tsx scripts/test-turnstile.ts
 *
 * Dùng test token đặc biệt của Cloudflare:
 *   "1x00000000000000000000AA" → luôn PASS
 *   "2x00000000000000000000AB" → luôn FAIL
 *   "3x00000000000000000000FF" → luôn ERROR
 *
 * Tài liệu: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
import "dotenv/config";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

console.log("=== Cloudflare Turnstile Test ===");
console.log(`SECRET_KEY: ${secretKey ? secretKey.slice(0, 10) + "..." : "(missing)"}`);
console.log("");

if (!secretKey) {
  console.warn("⚠️  CLOUDFLARE_TURNSTILE_SECRET_KEY chưa set → middleware sẽ BỎ QUA (pass-through).");
  process.exit(0);
}

async function verifyToken(label: string, token: string) {
  console.log(`--- Test: ${label} (token: ${token}) ---`);
  const form = new URLSearchParams({ secret: secretKey!, response: token });
  const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
  const json = await res.json() as { success: boolean; "error-codes"?: string[] };
  const status = json.success ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${status}  |  error-codes: ${json["error-codes"]?.join(", ") || "(none)"}\n`);
}

async function main() {
  await verifyToken("Token hợp lệ (always pass)", "1x00000000000000000000AA");
  await verifyToken("Token không hợp lệ (always fail)", "2x00000000000000000000AB");
}

main();
