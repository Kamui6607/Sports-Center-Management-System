/**
 * Hạ tầng chung cho E2E THẬT (HTTP + PostgreSQL) của các API bổ sung cho Mobile.
 *
 * - CHỈ chạy trên PostgreSQL local: dừng ngay nếu DATABASE_URL không trỏ localhost
 *   (DB dùng chung trên Render tuyệt đối không được ghi dữ liệu test).
 * - Chạy qua: `npm run test:local` (hoặc `node scripts/with-local-env.mjs npx tsx tests/<file>.e2e.ts`).
 * - Fixture có tiền tố `e2e-<RUN>` và được dọn ở cuối (kể cả khi test fail).
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error("[e2e] TỪ CHỐI CHẠY: DATABASE_URL không trỏ PostgreSQL local. Dùng `npm run test:local`.");
  process.exit(1);
}

export const RUN = `e2e-${Date.now().toString(36)}`;
export const PASSWORD = "E2eMobile!2026";

let baseUrl = "";
let server: Server | null = null;

/** Khởi động app Express (không mở Socket.IO) trên cổng ngẫu nhiên. */
export async function startServer(): Promise<void> {
  const { default: app } = await import("../../src/app.js");
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

export async function stopServer(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

export function serverUrl(): string {
  return baseUrl;
}

export type HttpResult = { status: number; body: any };

export async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string>; rawBody?: string } = {}
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      ...(opts.form ? {} : { "Content-Type": "application/json" }),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.form ?? opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// ── Báo cáo ────────────────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];
let section = "";

export function group(name: string): void {
  section = name;
  console.log(`\n▶ ${name}`);
}

export function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    const msg = `${section} › ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 400)}`}`;
    failures.push(msg);
    console.log(`  ✗ ${name}${detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

/** In tổng kết; trả exit code (0 = pass hết). */
export function report(suite: string): number {
  console.log(`\n${suite}: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  return failures.length === 0 ? 0 : 1;
}

/** Chạy suite: khởi động server, chạy [body], luôn dọn dữ liệu, thoát với mã kết quả. */
export async function runSuite(suite: string, body: () => Promise<void>, cleanup: () => Promise<void>) {
  let code = 1;
  try {
    await startServer();
    await body();
    code = report(suite);
  } catch (err) {
    console.error(`\n[${suite}] lỗi không mong đợi:`, err);
    report(suite);
    code = 1;
  } finally {
    try {
      await cleanup();
    } catch (err) {
      console.error(`[${suite}] dọn dữ liệu lỗi:`, err);
    }
    await stopServer();
  }
  process.exit(code);
}
