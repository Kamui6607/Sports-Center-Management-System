/**
 * DEV LOCAL: đồng bộ schema.prisma hiện tại vào PostgreSQL local (Docker) khi đang phát triển,
 * KHÔNG ghi lịch sử migration. Migration chính thức vẫn nằm ở `prisma/migrations/*`.
 *
 *   node scripts/with-local-env.mjs node scripts/local-db-sync.mjs
 *
 * Chỉ chạy qua `with-local-env.mjs` (đã chặn DATABASE_URL không phải localhost).
 */
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("[local-db-sync] TỪ CHỐI: DATABASE_URL không phải localhost.");
  process.exit(1);
}
const sql = execSync(
  `npx prisma migrate diff --from-url "${url}" --to-schema-datamodel prisma/schema.prisma --script`,
  { encoding: "utf8" }
);
if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log("[local-db-sync] Schema đã khớp.");
  process.exit(0);
}
execSync(`npx prisma db execute --url "${url}" --stdin`, { input: sql, stdio: ["pipe", "inherit", "inherit"] });
console.log("[local-db-sync] Đã áp thay đổi:\n" + sql);
