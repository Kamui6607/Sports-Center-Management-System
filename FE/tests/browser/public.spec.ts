import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [375, 768, 1440]) {
  test(`public pages are responsive and accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/", "/register"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(
        violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: `artifacts/${path === "/" ? "landing" : "register"}-${width}.png`,
        fullPage: true,
      });
    }
  });
}

test("mobile navigation, preview tabs and registration links work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Nền tảng" })
    .click();
  await expect(page.getByRole("button", { name: "Mở menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("tab", { name: "Hội viên", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "THẺ HỘI VIÊN MINH HỌA",
  );
  await page.getByRole("tab", { name: "Báo cáo" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("DỮ LIỆU MINH HỌA");
  await page.getByRole("link", { name: "Bắt đầu hành trình" }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("registration validates confirmation and submits the exact API body once", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/auth/register", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      fullName: "Nguyễn Minh Anh",
      email: "member@example.test",
      password: "test-password",
      phone: "0901234567",
    });
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        message: "Registration successful",
        data: { role: "MEMBER" },
      },
    });
  });
  await page.goto("/register");
  await page.getByLabel("Họ và tên").fill("  Nguyễn Minh Anh  ");
  await page.getByLabel("Email", { exact: false }).fill("member@example.test");
  await page.getByLabel("Số điện thoại", { exact: false }).fill("0901234567");
  await page.locator("#password").fill("test-password");
  await page.locator("#confirmPassword").fill("different-password");
  await page.getByRole("button", { name: "Tạo tài khoản miễn phí" }).click();
  await expect(page.getByText("Mật khẩu xác nhận chưa khớp.")).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Hiện mật khẩu" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.locator("#confirmPassword").fill("test-password");
  await page.getByRole("button", { name: "Tạo tài khoản miễn phí" }).click();
  await expect(
    page.getByRole("heading", { name: "Bạn đã sẵn sàng!" }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("link", { name: "Đăng nhập ngay" }).click();
  await expect(
    page.getByRole("heading", { name: "Sẵn sàng giữ nhịp?" }),
  ).toBeVisible();
});

test("registration shows conflict, server validation and connection errors with retry", async ({
  page,
}) => {
  let attempt = 0;
  await page.route("**/api/v1/auth/register", async (route) => {
    attempt++;
    if (attempt === 1)
      return route.fulfill({
        status: 409,
        json: { success: false, message: "Email exists" },
      });
    if (attempt === 2)
      return route.fulfill({
        status: 400,
        json: {
          success: false,
          message: "Validation failed",
          errors: [{ field: "email", message: "Email không hợp lệ" }],
        },
      });
    return route.abort("failed");
  });
  await page.goto("/register");
  await page.locator("#fullName").fill("Test Member");
  await page.locator("#email").fill("member@example.test");
  await page.locator("#password").fill("test-password");
  await page.locator("#confirmPassword").fill("test-password");
  const submit = page.getByRole("button", { name: "Tạo tài khoản miễn phí" });
  await submit.click();
  await expect(page.getByRole("alert")).toContainText(
    "Email này đã được sử dụng",
  );
  await submit.click();
  await expect(page.locator("#email-error")).toHaveText("Email không hợp lệ");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText(
    "Không thể kết nối máy chủ",
  );
  await expect(submit).toBeEnabled();
});

test("duplicate phone is translated and attached to phone, never email", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/register", (route) =>
    route.fulfill({
      status: 409,
      json: { success: false, message: "Duplicate value for: phone" },
    }),
  );
  await page.goto("/register");
  await page.locator("#fullName").fill("Nguyễn Minh Anh");
  await page.locator("#email").fill("member@example.test");
  await page.locator("#phone").fill("0901234567");
  await page.locator("#password").fill("test-password");
  await page.locator("#confirmPassword").fill("test-password");
  await page.getByRole("button", { name: "Tạo tài khoản miễn phí" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Số điện thoại này đã được sử dụng.",
  );
  await expect(page.locator("#phone-error")).toHaveText(
    "Số điện thoại này đã được sử dụng.",
  );
  await expect(page.locator("#phone")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "false");
});

test("sport video respects reduced motion, switches sports and falls back on failure", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/assets.mixkit.co/**", (route) => route.abort());
  await page.goto("/");
  const video = page.locator("video");
  await expect(video).not.toHaveAttribute("src");
  await page.getByRole("button", { name: "Yoga", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Yoga", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Phát video" }).click();
  await expect(video).toHaveAttribute("src", /1053/);
  await expect(page.getByRole("status")).toContainText(
    "Video tạm thời chưa khả dụng",
  );
  await expect(page.locator(".p-hero-image")).toBeVisible();
});
