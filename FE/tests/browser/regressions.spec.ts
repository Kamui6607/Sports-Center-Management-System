import { test, expect } from "@playwright/test";
import { setup } from "./fixtures";
for (const width of [320, 375, 430, 768, 1024, 1280, 1440, 1920])
  test(`long text, selected member and modal at ${width}px`, async ({
    page,
  }) => {
    await setup(page, "STAFF", true);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/receptionist/membership");
    await page
      .getByRole("button", { name: "Chọn", exact: true })
      .first()
      .click();
    await expect(page.locator(".loading, .skeleton")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Đăng ký gói", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Đăng ký gói",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.goto("/receptionist/classes");
    await page
      .getByRole("button", { name: "Chọn", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Xem đăng ký" }).first().click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Đăng ký cho hội viên đã chọn" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  });
test("boolean unchanged omits field and whitespace required input never submits", async ({
  page,
}) => {
  await setup(page, "MANAGER");
  await page.goto("/manager/rooms");
  await page
    .getByRole("button", { name: "Chỉnh sửa", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Đang hoạt động").selectOption("false");
  await dialog.getByLabel("Đang hoạt động").selectOption("");
  const sent = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().includes("/rooms/"),
  );
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect((await sent).postDataJSON()).not.toHaveProperty("isActive");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Thêm phòng tập", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Tên", { exact: false })
    .fill("   ");
  await page.getByRole("dialog").getByLabel("Sức chứa").fill("12");
  let calls = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") calls++;
  });
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("alert")).toContainText("Không được để trống");
  expect(calls).toBe(0);
});
test("member search debounces requests and shows empty and network error states", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/receptionist/members");
  await expect(page.locator("table")).toBeVisible();
  const searches: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/members?")) searches.push(r.url());
  });
  await page
    .getByPlaceholder("Tên, email hoặc số điện thoại")
    .pressSequentially("Nonexistent", { delay: 20 });
  await expect
    .poll(() => searches.filter((url) => url.includes("Nonexistent")).length)
    .toBe(1);
  expect(searches.length).toBeLessThan(4);
  await page.route("**/members?**", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.getByPlaceholder("Tên, email hoặc số điện thoại").fill("Empty");
  await expect(
    page.getByRole("heading", { name: "Chưa có dữ liệu" }),
  ).toBeVisible();
  await page.route("**/members?**", (route) => route.abort("failed"));
  await page.getByPlaceholder("Tên, email hoặc số điện thoại").fill("Offline");
  await expect(page.getByRole("alert")).toContainText("Không thể kết nối");
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
});
