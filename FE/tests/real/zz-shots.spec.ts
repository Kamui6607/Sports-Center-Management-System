import { test } from "@playwright/test";
// Chụp ảnh review giao diện (tạm thời, không phải test nghiệm thu).
const pages = (process.env.SHOT_PAGES || "/manager/products,/manager/users").split(",");
for (const theme of ["light", "dark"]) {
  test(`shots ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: Number(process.env.SHOT_W || 1440), height: 900 });
    await page.addInitScript((t) => localStorage.setItem("pulse.theme", t), theme);
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.locator('input[autocomplete="current-password"]').fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL(/manager/);
    for (const p of pages) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const name = p.replace(/\W+/g, "_");
      await page.screenshot({ path: `${process.env.SHOT_DIR}/${theme}${name}.png`, fullPage: process.env.SHOT_FULL === "1" });
    }
  });
}
