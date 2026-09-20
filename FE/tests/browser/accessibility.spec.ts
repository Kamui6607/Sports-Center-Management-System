import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "./fixtures";
const screens = [
  ...[
    "members",
    "coaches",
    "staff",
    "membership-plans",
    "sports",
    "rooms",
    "classes",
    "schedules",
    "reports",
    "roles",
    "audit-logs",
  ].map((path) => ["MANAGER", "/manager/" + path] as const),
  ...["dashboard", "members", "checkin", "support", "profile"].map(
    (path) => ["STAFF", "/receptionist/" + path] as const,
  ),
  ["MANAGER", "/manager/dashboard"],
  ["MANAGER", "/manager/users"],
  ["MANAGER", "/manager/profile"],
  ["STAFF", "/receptionist/members/create"],
  ["STAFF", "/receptionist/membership"],
  ["STAFF", "/receptionist/classes"],
  ["STAFF", "/receptionist/payments"],
  ["COACH", "/coach/dashboard"],
  ["MEMBER", "/user/dashboard"],
] as const;
for (const width of [375, 1440])
  test(`accessibility at ${width}px`, async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const failures: unknown[] = [];
    for (const [role, path] of screens) {
      const context = await browser.newContext({
        viewport: { width, height: 960 },
      });
      const page = await context.newPage();
      await setup(page, role);
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator(".loading, .skeleton")).toHaveCount(0);
      if (
        role === "STAFF" &&
        [
          "/receptionist/membership",
          "/receptionist/classes",
          "/receptionist/payments",
        ].includes(path)
      ) {
        await page
          .getByRole("button", { name: "Chọn", exact: true })
          .first()
          .click();
        await expect(page.locator(".loading, .skeleton")).toHaveCount(0);
      }
      const scan = async () => {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        failures.push(
          ...result.violations.map((v) => ({
            path,
            id: v.id,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
        );
      };
      await scan();
      if (path.endsWith("/users")) {
        await page
          .getByRole("button", { name: "Xem chi tiết", exact: true })
          .first()
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.locator(".loading, .skeleton")).toHaveCount(0);
        await scan();
      }
      if (path.endsWith("/membership")) {
        await page
          .getByRole("button", { name: "Đăng ký gói", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await scan();
      }
      if (path.endsWith("/payments")) {
        await page
          .getByRole("button", { name: "Xem / In hóa đơn" })
          .first()
          .click();
        await expect(page.locator(".invoice-print")).toBeVisible();
        await scan();
        await page.screenshot({
          path: `artifacts/audit/invoice-${width}.png`,
          fullPage: true,
        });
      }
      await context.close();
    }
    const context = await browser.newContext({
      viewport: { width, height: 960 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    const login = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    failures.push(
      ...login.violations.map((v) => ({
        path: "/login",
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    );
    await context.close();
    await testInfo.attach("a11y-results", {
      body: JSON.stringify(failures, null, 2),
      contentType: "application/json",
    });
    expect(failures).toEqual([]);
  });
test("mobile keyboard navigation traps focus, closes on Escape, restores focus", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/receptionist/dashboard");
  const trigger = page.getByRole("button", { name: "Mở menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("dialog", { name: "Điều hướng chính" }),
  ).toBeVisible();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => document.activeElement?.closest(".sidebar") !== null,
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => document.activeElement?.closest(".sidebar") === null,
    ),
  ).toBe(true);
});
test("manager modal blocks dismissal while saving and restores focus after closing", async ({
  page,
}) => {
  await setup(page, "MANAGER");
  await page.goto("/manager/rooms");
  const add = page.getByRole("button", { name: "Thêm phòng tập", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Thêm phòng tập" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Tên", { exact: false }).fill("Room");
  await dialog.getByLabel("Sức chứa").fill("12");
  let finish: () => void = () => {};
  const gate = new Promise<void>((resolve) => (finish = resolve));
  await page.route("**/api/v1/rooms", async (route) => {
    if (route.request().method() === "POST") {
      await gate;
      await route.fulfill({ json: { success: true, data: {}, message: "OK" } });
    } else await route.fallback();
  });
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(
    dialog.getByRole("button", { name: "Đóng", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  finish();
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
});
