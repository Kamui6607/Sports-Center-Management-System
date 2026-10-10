/**
 * Chạy các bộ E2E bổ sung cho Mobile trên PostgreSQL local.
 *   npm run test:local                 # tất cả
 *   npm run test:local -- auth-security  # lọc theo tên
 */
import { spawnSync } from "node:child_process";

const SUITES = ["auth-security", "mobile-api", "wallet-attendance", "shop"];
const filter = process.argv[2];
const selected = filter ? SUITES.filter((s) => s.includes(filter)) : SUITES;
const results = [];
for (const suite of selected) {
  console.log(`\n════════ ${suite} ════════`);
  const r = spawnSync("npx", ["tsx", `tests/${suite}.e2e.ts`], { stdio: "inherit", shell: true, env: process.env });
  results.push([suite, r.status === 0]);
}
console.log("\nKết quả:");
for (const [suite, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${suite}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
