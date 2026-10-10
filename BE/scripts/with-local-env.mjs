/**
 * Chạy một lệnh với biến môi trường của `.env.local` (PostgreSQL local trong Docker).
 *
 *   node scripts/with-local-env.mjs <lệnh> [...tham số]
 *   VD: node scripts/with-local-env.mjs prisma migrate deploy
 *
 * An toàn dữ liệu: nạp `.env.local` với `override` (đè mọi giá trị từ `.env`) và DỪNG nếu
 * DATABASE_URL không trỏ về máy local — tránh chạy migrate/seed/test vào DB dùng chung (Render).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

if (!existsSync(".env.local")) {
  console.error("[local-env] Thiếu BE/.env.local — xem hướng dẫn trong Doc/BE_API_CHANGES.md.");
  process.exit(1);
}
dotenv.config({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`[local-env] TỪ CHỐI: DATABASE_URL trỏ tới "${host || "?"}" (không phải máy local).`);
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("[local-env] Cách dùng: node scripts/with-local-env.mjs <lệnh> [...tham số]");
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
