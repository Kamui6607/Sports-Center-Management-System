import { test, expect, type Page } from "@playwright/test";
import { setup } from "./fixtures";
const memberId = "aecd9439-82e2-47da-90a2-2830bbe04dc4";
async function chooseMember(page: Page) {
  await page.getByRole("button", { name: "Chọn", exact: true }).first().click();
}
for (const [role, home, title] of [
  ["STAFF", "/receptionist", "Tổng quan lễ tân"],
  ["COACH", "/coach", "Tổng quan huấn luyện viên"],
  ["MEMBER", "/member", "Tổng quan hội viên"],
]) {
  test(
    role + " lands in its own portal and cannot open manager",
    async ({ page }) => {
      await setup(page, role);
      await page.goto("/");
      await expect(page).toHaveURL(new RegExp(home + "/dashboard$"));
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await page.goto("/manager/users");
      await expect(
        page.getByRole("heading", { name: "Không có quyền truy cập" }),
      ).toBeVisible();
    },
  );
}
test("staff registers member through public registration without changing session", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/receptionist/members/create");
  await page.getByLabel("Email").fill("new@example.test");
  await page.getByLabel("Mật khẩu", { exact: false }).fill("test-password");
  await page.getByLabel("Họ và tên").fill("Hội viên mới");
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/auth/register"),
  );
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    email: "new@example.test",
    fullName: "Hội viên mới",
  });
  await expect(page.getByRole("status")).toContainText("Đã tạo tài khoản");
  expect(
    await page.evaluate(() => sessionStorage.getItem("pulse.access")),
  ).toBe("fixture-token");
});
test("membership registration and renewal use the selected profile and subscription", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/receptionist/membership");
  await chooseMember(page);
  await page.getByRole("button", { name: "Đăng ký gói", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Gói tập")
    .selectOption({ index: 1 });
  await page
    .getByRole("dialog")
    .getByLabel("Phương thức thanh toán")
    .selectOption("CASH");
  const sent = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/subscriptions"),
  );
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    memberId,
    paymentMethod: "CASH",
  });
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "thành công",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đóng", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Gia hạn", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Gói tập")
    .selectOption({ index: 1 });
  await page
    .getByRole("dialog")
    .getByLabel("Phương thức thanh toán")
    .selectOption("BANK_TRANSFER");
  const renewal = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/renew"),
  );
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect((await renewal).postDataJSON()).toMatchObject({
    paymentMethod: "BANK_TRANSFER",
  });
});
test("booking uses member profile and schedule; cancellation requires confirmation", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/receptionist/classes");
  await chooseMember(page);
  await page.getByRole("button", { name: "Xem đăng ký" }).first().click();
  await page
    .getByRole("button", { name: "Đăng ký cho hội viên đã chọn" })
    .click();
  const booking = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/enrollments"),
  );
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect((await booking).postDataJSON()).toMatchObject({
    memberId,
    scheduleId: expect.any(String),
  });
  await expect(page.getByRole("dialog").getByRole("status")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đóng", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: /Hủy đăng ký của/ })
    .first()
    .click();
  const cancel = page.waitForRequest(
    (r) => r.method() === "DELETE" && r.url().includes("/enrollments/"),
  );
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  expect((await cancel).url()).toContain(
    "6b6b6b6b-0000-4000-8000-000000000201",
  );
});
test("payment validation, submission and printable invoice", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/receptionist/payments");
  await chooseMember(page);
  await page
    .getByRole("button", { name: "Ghi nhận thanh toán", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Số tiền").fill("-1");
  await page
    .getByRole("dialog")
    .getByLabel("Phương thức", { exact: false })
    .selectOption("CASH");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect(
    await page
      .getByRole("dialog")
      .getByLabel("Số tiền")
      .evaluate((e: HTMLInputElement) => e.validity.rangeUnderflow),
  ).toBe(true);
  await page.getByRole("dialog").getByLabel("Số tiền").fill("300000");
  const payment = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/payments"),
  );
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  expect((await payment).postDataJSON()).toMatchObject({
    memberId,
    amount: 300000,
    method: "CASH",
  });
  await expect(page.getByRole("dialog").getByRole("status")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đóng", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Xem / In hóa đơn" }).first().click();
  await expect(page.locator(".invoice-print")).toContainText("INV-");
  await page.emulateMedia({ media: "print" });
  expect(
    await page
      .locator(".invoice-print")
      .evaluate((e) => getComputedStyle(e).visibility),
  ).toBe("visible");
  expect(
    await page
      .locator(".invoice-print")
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBeGreaterThan(0);
});
test("reception mobile navigation and unavailable features never call invented endpoints", async ({
  page,
}) => {
  await setup(page);
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1")) calls.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/receptionist/dashboard");
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: "Điểm danh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Điểm danh hội viên" }),
  ).toBeVisible();
  await page.goto("/receptionist/support");
  await expect(
    page.getByRole("heading", { name: "Yêu cầu hỗ trợ", exact: true }),
  ).toBeVisible();
  expect(calls.some((p) => /attendance|checkin|support/.test(p))).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/reception-mobile.png",
    fullPage: true,
  });
});
