import { test, expect } from "@playwright/test";
import { setup } from "./fixtures";
import fs from "node:fs";
const portals = [
  [
    "MANAGER",
    "manager",
    [
      "dashboard",
      "users",
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
      "profile",
    ],
  ],
  [
    "STAFF",
    "receptionist",
    [
      "dashboard",
      "members",
      "members/create",
      "membership",
      "classes",
      "checkin",
      "payments",
      "support",
      "profile",
    ],
  ],
  ["COACH", "coach", ["dashboard", "schedule", "classes", "profile"]],
  ["MEMBER", "user", ["dashboard", "membership", "schedule", "profile"]],
] as const;
for (const width of [320, 375, 430, 768, 1024, 1280, 1440, 1920])
  test(`all portals responsive at ${width}px`, async ({ browser }) => {
    test.setTimeout(120000);
    const issues: string[] = [];
    for (const [role, base, routes] of portals) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await setup(page, role);
      page.on("pageerror", (e) => issues.push(e.message));
      for (const route of routes) {
        await page.goto("/" + base + "/" + route);
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.locator(".loading, .skeleton")).toHaveCount(0);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        if (overflow) issues.push(`${base}/${route}: horizontal overflow`);
        if (["320", "1440"].includes(String(width)) && route === "dashboard")
          await page.screenshot({
            path: `artifacts/audit/${process.env.AUDIT_BASELINE ? "before" : "after"}-${base}-${width}.png`,
            fullPage: true,
          });
      }
      await context.close();
    }
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByPlaceholder("Email của bạn")).toBeVisible();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      issues.push("login: horizontal overflow");
    await context.close();
    fs.mkdirSync("artifacts/audit", { recursive: true });
    fs.writeFileSync(
      `artifacts/audit/${process.env.AUDIT_BASELINE ? "before" : "after"}-${width}.json`,
      JSON.stringify(issues, null, 2),
    );
    if (!process.env.AUDIT_BASELINE) expect(issues).toEqual([]);
  });
