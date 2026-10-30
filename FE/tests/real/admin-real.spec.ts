import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Web Manager với BE + DB THẬT — mỗi thao tác đọc lại dữ liệu sau reload/API, không mock.
 * Dữ liệu tạo ra mang tiền tố `pw-<thời điểm>` (chỉ dùng trên DB test riêng).
 */
const API = process.env.ADMIN_API_URL || "http://127.0.0.1:8091/api/v1";
const EMAIL = process.env.ADMIN_EMAIL || "";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const RUN = `pw-${Date.now().toString(36)}`;
const shots = process.env.SHOT_DIR;

test.skip(!EMAIL || !PASSWORD, "Cần ADMIN_EMAIL / ADMIN_PASSWORD của Manager trong DB test");

async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  return body.data?.accessToken as string;
}
async function apiGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function login(page: Page, path = "/manager/dashboard") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test("deep link khi chưa đăng nhập → login → quay lại đúng trang, refresh vẫn giữ phiên", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => r.url().startsWith(API) && calls.push(new URL(r.url()).pathname));
  await login(page, "/manager/rooms");
  await expect(page).toHaveURL(/\/manager\/rooms$/);
  await expect(page.getByRole("heading", { name: "Phòng tập" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Phòng tập" })).toBeVisible();
  expect(calls).toContain("/api/v1/auth/me");
  expect(calls).toContain("/api/v1/rooms");
  await page.goto("/");
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await page.goto("/manager/khong-ton-tai");
  await expect(page.getByText("Không tìm thấy trang")).toBeVisible();
});

test("Người dùng: tạo → sửa (reload đọc lại) → khóa/mở khóa → cấp lại mật khẩu → xóa vĩnh viễn", async ({ page }) => {
  await login(page, "/manager/users");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  const dialog = page.getByRole("dialog");
  // Chỉ tạo được Hội viên / HLV — không có lựa chọn Quản lý.
  await expect(dialog.getByLabel("Vai trò").locator("option")).toHaveText(["Hội viên", "Huấn luyện viên"]);
  await dialog.getByLabel("Họ và tên").fill(`${RUN} Hội viên`);
  await dialog.getByLabel("Email đăng nhập").fill(`${RUN}@example.test`);
  await dialog.getByLabel("Mật khẩu ban đầu").fill("Pw#123456");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL(/\/manager\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: `${RUN} Hội viên` })).toBeVisible();

  await page.getByLabel("Họ và tên").fill(`${RUN} Đã sửa`);
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("heading", { name: `${RUN} Đã sửa` })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Họ và tên")).toHaveValue(`${RUN} Đã sửa`);

  await page.getByRole("button", { name: "Khóa tài khoản" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Khóa tài khoản" }).click();
  await expect(page.getByRole("button", { name: "Mở khóa" })).toBeVisible();
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mở khóa" }).click();
  await expect(page.getByRole("button", { name: "Khóa tài khoản" })).toBeVisible();

  await page.getByRole("button", { name: "Cấp lại mật khẩu" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Gửi email đặt lại" }).click();
  await expect(page.getByText("Còn hiệu lực")).toBeVisible();

  if (shots) await page.screenshot({ path: `${shots}/user-detail-1440.png`, fullPage: true });
  await page.getByRole("button", { name: "Xóa vĩnh viễn" }).click();
  const del = page.getByRole("dialog");
  const confirm = del.getByRole("button", { name: "Xóa vĩnh viễn" });
  await expect(confirm).toBeDisabled();
  await del.getByRole("textbox").fill(`${RUN}@example.test`);
  await confirm.click();
  await expect(page).toHaveURL(/\/manager\/users$/);
  const token = await apiLogin(EMAIL, PASSWORD);
  const left = await apiGet(token, `/users?search=${RUN}`);
  expect(left.data.length).toBe(0);
});

test("Lọc + phân trang giữ trên URL khi mở chi tiết rồi quay lại", async ({ page }) => {
  await login(page, "/manager/users");
  await page.getByLabel("Vai trò").selectOption("MEMBER");
  await expect(page).toHaveURL(/role=MEMBER/);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.locator("tbody tr a").first().click();
  await expect(page).toHaveURL(/\/manager\/users\/.+/);
  await page.goBack();
  await expect(page.getByLabel("Vai trò")).toHaveValue("MEMBER");
});

test("Phòng tập: tạo phòng, trùng tên báo lỗi, chi tiết có lịch tuần", async ({ page }) => {
  await login(page, "/manager/rooms");
  for (const attempt of [1, 2]) {
    await page.getByRole("button", { name: "Thêm phòng" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Tên phòng").fill(`${RUN} Phòng`);
    await d.getByLabel("Sức chứa").fill("18");
    await d.getByRole("button", { name: "Thêm phòng" }).click();
    if (attempt === 2) {
      await expect(d.getByRole("alert")).toBeVisible();
      await d.getByRole("button", { name: "Hủy" }).click();
    }
  }
  await page.getByPlaceholder("Tìm theo tên phòng").fill(RUN);
  await page.getByRole("link", { name: `${RUN} Phòng` }).click();
  await expect(page.getByRole("heading", { name: `${RUN} Phòng` })).toBeVisible();
  await expect(page.getByText("Lịch sử dụng phòng")).toBeVisible();
  await expect(page.locator(".cr-day")).toHaveCount(7);
});

test("Khóa học: duyệt khóa HLV gửi lên (tạo bằng API Coach thật)", async ({ page }) => {
  test.skip(!process.env.COACH_EMAIL, "Cần COACH_EMAIL/COACH_PASSWORD để HLV tạo khóa chờ duyệt");
  const coachToken = await apiLogin(process.env.COACH_EMAIL!, process.env.COACH_PASSWORD!);
  const created = await fetch(`${API}/classes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coachToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `${RUN} Yoga sáng`, fitness: "Yoga", capacity: 12, areaType: "INDOOR", price: 900000 }),
  }).then((r) => r.json());
  const id = created.data.id as string;
  await login(page, "/manager/classes?status=PENDING");
  await page.getByRole("link", { name: `${RUN} Yoga sáng` }).click();
  await page.getByRole("button", { name: "Duyệt khóa học" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByText("Đã duyệt").first()).toBeVisible();
  const token = await apiLogin(EMAIL, PASSWORD);
  expect((await apiGet(token, `/classes/${id}`)).data.status).toBe("APPROVED");
});

test("Lịch học: lịch tuần, đổi sang bảng, mở chi tiết buổi", async ({ page }) => {
  await login(page, "/manager/schedules");
  await expect(page.locator(".cr-day")).toHaveCount(7);
  await page.getByRole("button", { name: "Bảng" }).click();
  await expect(page).toHaveURL(/view=table/);
  const detail = page.getByRole("button", { name: "Chi tiết" }).first();
  if (await detail.count()) {
    await detail.click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Học viên" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Khóa học", { exact: true })).toBeVisible();
  }
});

test("Sản phẩm: tạo kèm tồn đầu → nhập kho → nhật ký kho", async ({ page }) => {
  await login(page, "/manager/products");
  await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Tên sản phẩm").fill(`${RUN} Bình nước`);
  await d.getByLabel("Giá bán (VND)").fill("45000");
  await d.getByLabel("Mô tả").fill("Bình nước thể thao 750ml");
  await d.getByLabel("Tồn đầu").fill("5");
  await d.getByRole("button", { name: "Thêm sản phẩm" }).click();
  await expect(page.getByRole("heading", { name: `${RUN} Bình nước` })).toBeVisible();
  await page.getByRole("button", { name: "Nhập / điều chỉnh kho" }).click();
  const s = page.getByRole("dialog");
  await s.getByLabel("Số lượng nhập").fill("3");
  await s.getByLabel("Lý do / ghi chú").fill("Nhập lô kiểm thử");
  await s.getByRole("button", { name: "Ghi vào nhật ký kho" }).click();
  await expect(page.locator(".cr-kpi").first().locator(".cr-kpi-value")).toHaveText("8");
  await expect(page.getByText("Nhập lô kiểm thử")).toBeVisible();
  await expect(page.getByText("Tồn đầu khi tạo sản phẩm")).toBeVisible();
});

test("Doanh thu: KPI khớp đúng response API cùng kỳ", async ({ page }) => {
  await login(page, "/manager/revenue?preset=year");
  const token = await apiLogin(EMAIL, PASSWORD);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const api = await apiGet(token, `/reports/revenue?startDate=${today.slice(0, 4)}-01-01&endDate=${today}`);
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
  await expect(page.locator(".cr-kpi").nth(0).locator(".cr-kpi-value")).toHaveText(fmt(api.data.totalRevenue));
  await expect(page.locator(".cr-kpi").nth(2).locator(".cr-kpi-value")).toHaveText(fmt(api.data.netRevenue));
  await expect(page.getByRole("button", { name: "Xuất CSV toàn bộ" })).toBeEnabled();
});

test("Tài khoản không phải Manager bị chặn và có nút đăng xuất", async ({ page }) => {
  test.skip(!process.env.MEMBER_EMAIL, "Cần MEMBER_EMAIL/MEMBER_PASSWORD");
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.MEMBER_EMAIL!);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.MEMBER_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await page.getByRole("button", { name: /Đăng xuất/ }).click();
  await expect(page).toHaveURL(/\/login/);
});

for (const width of [1440, 1024, 768, 375]) {
  test(`Responsive ${width}px: không tràn ngang, menu dùng được`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const path of ["/manager/dashboard", "/manager/users", "/manager/schedules", "/manager/revenue"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} tràn ngang`).toBeLessThanOrEqual(1);
      if (shots) await page.screenshot({ path: `${shots}/${path.split("/").pop()}-${width}.png`, fullPage: false });
    }
    if (width <= 900) {
      await page.getByRole("button", { name: "Mở menu" }).click();
      await page.getByRole("link", { name: "Sản phẩm" }).click();
      await expect(page).toHaveURL(/\/manager\/products$/);
    }
  });
}
