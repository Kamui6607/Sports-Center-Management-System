import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const longName =
  "Lớp rèn luyện thể lực và vận động toàn thân dành cho học viên nâng cao ".repeat(
    3,
  );
async function setupCoach(
  page: Page,
  options: {
    long?: boolean;
    empty?: boolean;
    fail?: string;
    slow?: boolean;
  } = {},
) {
  await page.clock.install({ time: new Date("2026-09-18T03:00:00Z") });
  await page.addInitScript(() =>
    sessionStorage.setItem("pulse.access", "coach-test"),
  );
  const calls: {
    path: string;
    method: string;
    query: Record<string, string>;
    body: unknown;
  }[] = [];
  const profile = {
    id: "user-coach",
    fullName: "Nguyễn Minh An",
    email: "coach@example.test",
    phone: "0901234567",
    gender: "MALE",
    dateOfBirth: "1995-03-01",
    role: "COACH",
    isActive: true,
    coachProfile: {
      id: "coach-profile",
      specialization: "Yoga & thể lực",
      experienceYears: 5,
    },
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", "");
    calls.push({
      path,
      method: request.method(),
      query: Object.fromEntries(url.searchParams),
      body: request.postData() ? request.postDataJSON() : null,
    });
    if (options.slow && path === "/classes")
      await new Promise((r) => setTimeout(r, 700));
    if (path === options.fail)
      return route.fulfill({
        status: 403,
        json: { success: false, message: "Forbidden" },
      });
    let data: unknown = [],
      pagination: unknown;
    if (path === "/auth/me") data = profile;
    else if (path === "/auth/me/change-password") data = null;
    else if (path === "/classes") {
      data = options.empty
        ? []
        : [
            {
              id: "class-1",
              name: options.long ? longName : "Yoga nền tảng",
              sport: { name: "Yoga" },
              capacity: 20,
              isActive: true,
              classType: "REGULAR",
              description: "Hít thở, sự cân bằng và chuyển động chủ động.",
            },
          ];
      pagination = {
        page: 1,
        totalPages: 1,
        total: options.empty ? 0 : 1,
        limit: 100,
      };
    } else if (path === "/class-schedules")
      data = [
        {
          id: "session-1",
          classId: "class-1",
          status: "SCHEDULED",
          startTime: "2026-09-18T09:00:00+07:00",
          endTime: "2026-09-18T10:00:00+07:00",
          class: {
            id: "class-1",
            name: options.long ? longName : "Yoga nền tảng",
          },
          room: {
            name: options.long
              ? "Phòng tập chuyên biệt ".repeat(12)
              : "Phòng A",
          },
        },
      ];
    else if (path === "/enrollments/schedule/session-1") {
      const pg = Number(url.searchParams.get("page"));
      data = [
        {
          id: "enroll-" + pg,
          memberId: "member-" + pg,
          status: "BOOKED",
          member: {
            id: "member-" + pg,
            user: {
              fullName: pg === 1 ? "Trần Minh Anh" : "Học viên trang hai",
              email: options.long
                ? "x".repeat(160) + "@example.test"
                : "member@example.test",
            },
          },
        },
      ];
      pagination = { page: pg, totalPages: 2, total: 2, limit: 1 };
    } else if (path.startsWith("/members/"))
      data = {
        id: "member-1",
        user: {
          fullName: "Trần Minh Anh",
          email: options.long
            ? "x".repeat(160) + "@example.test"
            : "member@example.test",
          phone: "0909876543",
        },
        fitnessGoal: options.long
          ? "Mục tiêu rất dài ".repeat(200)
          : "Cải thiện sức bền",
        trainingLevel: "BEGINNER",
        trainingPreference: "Tập buổi sáng",
      };
    else
      return route.fulfill({
        status: 404,
        json: { success: false, message: "Unexpected endpoint " + path },
      });
    await route.fulfill({
      json: { success: true, data, ...(pagination ? { pagination } : {}) },
    });
  });
  return calls;
}

test("coach dashboard scopes classes by profile ID and schedule by assigned class", async ({
  page,
}) => {
  const calls = await setupCoach(page);
  await page.goto("/coach/dashboard");
  await expect(
    page.getByRole("heading", {
      name: "Tổng quan huấn luyện viên",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".coach-session")).toHaveCount(1);
  expect(calls.find((c) => c.path === "/classes")?.query.coachId).toBe(
    "coach-profile",
  );
  expect(
    calls
      .filter((c) => c.path === "/class-schedules")
      .every((c) => c.query.classId === "class-1"),
  ).toBeTruthy();
  await expect(page.locator(".coach-session")).toContainText("09:00");
  expect(
    calls.some(
      (c) => c.path.startsWith("/attendance") || c.path.startsWith("/training"),
    ),
  ).toBeFalsy();
});
test("roster loads every page and opens student goals, Escape returns to roster", async ({
  page,
}) => {
  const calls = await setupCoach(page);
  await page.goto("/coach/schedule");
  await page.locator(".coach-session").click();
  await expect(
    page.getByText("Học viên trang hai", { exact: true }),
  ).toBeVisible();
  expect(
    calls.some((c) => c.path.includes("/enrollments/") && c.query.page === "2"),
  ).toBeTruthy();
  await page.getByRole("button", { name: /Trần Minh Anh/ }).click();
  await expect(
    page.getByText("Cải thiện sức bền", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        !!document
          .querySelector("dialog[open]")
          ?.contains(document.activeElement),
    ),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Danh sách học viên" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("calendar navigation, status filter and agenda view use correct date window", async ({
  page,
}) => {
  const calls = await setupCoach(page);
  await page.goto("/coach/schedule");
  await page.locator(".coach-session").waitFor();
  await page.getByRole("button", { name: "Danh sách", exact: true }).click();
  await expect(page.locator(".coach-agenda")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Trạng thái", exact: true })
    .selectOption("CANCELLED");
  await expect(
    page.getByText("Không có buổi dạy trong tuần hoặc bộ lọc này."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tuần sau", exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter((c) => c.path === "/class-schedules").at(-1)?.query
          .startAfter,
    )
    .toBe("2026-09-20T17:00:00.000Z");
});
test("class cards filter and carry class into teaching schedule", async ({
  page,
}) => {
  await setupCoach(page);
  await page.goto("/coach/classes");
  await page.getByLabel("Tìm lớp").fill("không có");
  await expect(page.getByText("Không tìm thấy lớp phù hợp.")).toBeVisible();
  await page.getByLabel("Tìm lớp").fill("");
  await page.getByRole("button", { name: "Chi tiết lớp" }).click();
  await expect(page.getByRole("dialog")).toContainText("Hít thở");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Xem lịch dạy", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Lớp học", exact: true }),
  ).toHaveValue("class-1");
});
test("profile validates names, phone and birthdate before API call", async ({
  page,
}) => {
  const calls = await setupCoach(page);
  await page.goto("/coach/profile");
  await page.getByLabel("Họ và tên", { exact: true }).fill("  ");
  await page.getByLabel("Số điện thoại", { exact: true }).fill("abc");
  await page.getByLabel("Ngày sinh", { exact: true }).fill("2099-01-01");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Họ tên cần từ 2 đến 100 ký tự.")).toBeVisible();
  await expect(
    page.getByText("Ngày sinh phải hợp lệ và trước hôm nay."),
  ).toBeVisible();
  expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  await page.getByLabel("Họ và tên", { exact: true }).fill("Nguyễn Minh An");
  await page.getByLabel("Số điện thoại", { exact: true }).fill("0901234567");
  await page.getByLabel("Ngày sinh", { exact: true }).fill("1995-03-01");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("status")).toContainText("Đã cập nhật hồ sơ");
  expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
    fullName: "Nguyễn Minh An",
    phone: "0901234567",
  });
});
test("password confirmation is required and is not sent to BE", async ({
  page,
}) => {
  const calls = await setupCoach(page);
  await page.goto("/coach/profile");
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await page
    .getByLabel("Mật khẩu hiện tại", { exact: true })
    .fill("old-password");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("new-password");
  await page.getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill("bad");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Mật khẩu xác nhận chưa khớp.")).toBeVisible();
  expect(calls.some((c) => c.method === "PATCH")).toBeFalsy();
  await page
    .getByLabel("Xác nhận mật khẩu mới", { exact: true })
    .fill("new-password");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("status")).toContainText("Đã đổi mật khẩu");
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
    currentPassword: "old-password",
    newPassword: "new-password",
  });
  await expect(page.getByLabel("Mật khẩu mới", { exact: true })).toHaveValue(
    "",
  );
});
test("empty assigned classes never query global schedules", async ({
  page,
}) => {
  const calls = await setupCoach(page, { empty: true });
  await page.goto("/coach/classes");
  await expect(page.getByText(/Bạn chưa được phân công lớp nào/)).toBeVisible();
  expect(calls.some((c) => c.path === "/class-schedules")).toBeFalsy();
});
test("API error remains visible instead of becoming empty data", async ({
  page,
}) => {
  await setupCoach(page, { fail: "/classes" });
  await page.goto("/coach/schedule");
  await expect(page.getByRole("alert")).toContainText("Bạn không có quyền");
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
});
test("loading has accessible skeleton and page has no serious axe findings", async ({
  page,
}) => {
  await setupCoach(page, { slow: true });
  await page.goto("/coach/dashboard");
  await expect(
    page.getByRole("status", { name: "Đang tải dữ liệu…" }).first(),
  ).toBeVisible();
  await page.locator(".coach-session").waitFor();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ),
  ).toEqual([]);
});
for (const width of [375, 768, 1440])
  test(`long content and student modal fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupCoach(page, { long: true });
    await page.goto("/coach/schedule");
    await page.locator(".coach-session").click();
    const fits = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          [...document.querySelectorAll("dialog[open]")].every(
            (d) =>
              d.scrollWidth <= d.clientWidth + 1 &&
              d.getBoundingClientRect().left >= 0 &&
              d.getBoundingClientRect().right <= innerWidth + 1,
          ),
      );
    await expect.poll(fits).toBeTruthy();
    await page.getByRole("button", { name: /Trần Minh Anh/ }).click();
    await expect(
      page.getByRole("heading", { name: "Mục tiêu tập luyện" }),
    ).toBeVisible();
    await expect.poll(fits).toBeTruthy();
    await page.screenshot({
      path: `artifacts/coach-student-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `artifacts/coach-schedule-${width}.png`,
      fullPage: true,
    });
  });
