import { expect, test } from "@playwright/test";
import { setup } from "./fixtures";

const checkout = (suffix: string) => ({
  paymentId: `payment-${suffix}`,
  orderCode: `SEVQR${suffix}`,
  amount: 300000,
  currency: "VND",
  status: "PENDING",
  gateway: "SEPAY",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  qrUrl: `https://qr.sepay.vn/img?des=SEVQR${suffix}`,
  transferContent: `SEVQR${suffix}`,
  bank: {
    id: "SACOMBANK",
    accountNumber: "0703339186",
    accountHolder: "NGUYEN TRAN TU",
  },
  plan: {
    id: "plan-membership",
    name: "Gói Membership",
    tier: "MEMBERSHIP",
    durationDays: 30,
  },
});

test("keeps tracking a checkout after closing and reloading", async ({ page }) => {
  await setup(page, "MEMBER");
  const payment = checkout("RESTORE");
  let paid = false;
  await page.route("**/api/v1/payments/sepay/checkout", route => route.fulfill({ status: 201, json: { success: true, data: payment } }));
  await page.route(`**/api/v1/payments/sepay/${payment.paymentId}`, route => route.fulfill({ json: { success: true, data: { ...payment, status: paid ? "SUCCESS" : "PENDING" } } }));
  await page.goto("/member/membership");
  await page.getByRole("button", { name: "Bảng giá các gói" }).click();
  await page.getByRole("button", { name: "Chuyển khoản VietQR", exact: true }).first().click();
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByRole("button", { name: `Xem trạng thái giao dịch ${payment.orderCode}` })).toBeVisible();
  await page.reload();
  paid = true;
  await page.getByRole("button", { name: `Xem trạng thái giao dịch ${payment.orderCode}` }).click();
  await expect(page.getByText("Thanh toán thành công", { exact: true })).toBeVisible({ timeout: 10000 });
});

for (const result of ["SUCCESS", "FAILED"] as const) {
  test(`member sees SePay ${result.toLowerCase()} result from API`, async ({
    page,
  }) => {
    await setup(page, "MEMBER");
    const payment = checkout(result);
    await page.route("**/api/v1/payments/sepay/checkout", (route) =>
      route.fulfill({ status: 201, json: { success: true, data: payment } }),
    );
    await page.route(`**/api/v1/payments/sepay/${payment.paymentId}`, (route) =>
      route.fulfill({
        json: { success: true, data: { ...payment, status: result } },
      }),
    );

    await page.goto("/member/membership");
    await page.getByRole("button", { name: "Bảng giá các gói" }).click();
    await page
      .locator('button:has-text("Chuyển khoản VietQR"):not([disabled])')
      .first()
      .click();

    await expect(
      page.getByText(
        result === "SUCCESS" ? "Thanh toán thành công" : "Thanh toán thất bại",
        { exact: true },
      ),
    ).toBeVisible();
  });
}

test("member reopens an existing pending SePay checkout from 409 details", async ({
  page,
}) => {
  await setup(page, "MEMBER");
  const payment = checkout("PENDING");
  await page.route("**/api/v1/payments/sepay/checkout", (route) =>
    route.fulfill({
      status: 409,
      json: {
        success: false,
        message: "Bạn đang có giao dịch chuyển khoản chờ thanh toán.",
        errors: { code: "SEPAY_PAYMENT_PENDING", ...payment },
      },
    }),
  );
  await page.route(`**/api/v1/payments/sepay/${payment.paymentId}`, (route) =>
    route.fulfill({ json: { success: true, data: payment } }),
  );

  await page.goto("/member/membership");
  await page.getByRole("button", { name: "Bảng giá các gói" }).click();
  await page
    .locator('button:has-text("Chuyển khoản VietQR"):not([disabled])')
    .first()
    .click();

  await expect(
    page.getByRole("img", { name: "Mã VietQR thanh toán gói hội viên" }),
  ).toBeVisible();
  await expect(
    page.getByText(payment.transferContent, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Không thể tạo đơn thanh toán")).toHaveCount(0);
});

test("member sees the counter-payment fallback when SePay is not configured", async ({
  page,
}) => {
  await setup(page, "MEMBER");
  await page.route("**/api/v1/payments/sepay/checkout", (route) =>
    route.fulfill({
      status: 503,
      json: {
        success: false,
        message: "SEPAY_NOT_CONFIGURED",
        errors: { code: "SEPAY_NOT_CONFIGURED" },
      },
    }),
  );

  await page.goto("/member/membership");
  await page.getByRole("button", { name: "Bảng giá các gói" }).click();
  await page
    .locator('button:has-text("Chuyển khoản VietQR"):not([disabled])')
    .first()
    .click();

  await expect(
    page.getByText(
      "Thanh toán online chưa được cấu hình. Vui lòng thanh toán tại quầy hoặc thử lại sau.",
    ),
  ).toBeVisible();
});
