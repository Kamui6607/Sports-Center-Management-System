import { defineConfig } from "@playwright/test";

/**
 * Kiểm thử trình duyệt với BE + DB THẬT (không intercept/mock).
 * Chuẩn bị: BE trỏ DB local/test riêng, FE Vite trỏ BE đó, tài khoản Manager trong DB test.
 *   ADMIN_WEB_URL=http://127.0.0.1:5191 ADMIN_EMAIL=... ADMIN_PASSWORD=... npx playwright test -c playwright.real.config.ts
 * Có thể đặt MEMBER_EMAIL / MEMBER_PASSWORD để kiểm chặn vai trò khác. Không chạy với DB demo/production.
 */
export default defineConfig({
  testDir: "./tests/real",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: process.env.ADMIN_WEB_URL || "http://127.0.0.1:5191",
    headless: true,
    trace: "retain-on-failure",
    // Máy chưa tải đúng bản Chromium của Playwright: trỏ CHROME_PATH tới Chrome/Chromium có sẵn.
    ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}),
  },
  reporter: "list",
});
