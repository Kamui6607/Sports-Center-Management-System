import { test, expect, type Page } from "@playwright/test";
import { setup } from "./fixtures";

async function workflow(page: Page, role = "MEMBER") {
  await setup(page, role);
  const calls: { path: string; method: string; body: string | null }[] = [];
  const plan = {
    id: "p1",
    memberId: "member-1",
    coachId: "coach-1",
    name: "Cải thiện sức bền",
    startDate: "2026-09-01T00:00:00Z",
    endDate: "2026-09-30T00:00:00Z",
    coach: { user: { fullName: "Huấn luyện viên An" } },
    results: [
      {
        id: "result-1",
        date: "2026-09-10T00:00:00Z",
        coachNote: "Tiến bộ tốt",
        metrics: { "Quãng đường": "5 km" },
      },
    ],
  };
  let read = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    calls.push({ path, method: req.method(), body: req.postData() });
    let data: unknown, pagination: unknown;
    if (path === "/auth/me")
      data = {
        id: "user-1",
        fullName: "Nguyễn Minh Anh",
        email: "user@example.test",
        role,
        isActive: true,
        memberProfile: { id: "member-1" },
        coachProfile: { id: "coach-1" },
      };
    else if (path === "/notifications") {
      data = [
        {
          id: "n1",
          title: "Lịch học đã cập nhật",
          body: "Lớp Yoga chuyển sang phòng B. ".repeat(20),
          isRead: read,
          createdAt: "2026-09-18T03:00:00Z",
        },
      ];
      pagination = { page: 1, totalPages: 1, total: 1, limit: 20 };
    } else if (path === "/notifications/unread-count")
      data = { unreadCount: read ? 0 : 1 };
    else if (
      path === "/notifications/n1/read" ||
      path === "/notifications/mark-all-read"
    ) {
      read = true;
      data = {};
    } else if (path === "/chat/contacts")
      data = [
        { id: "coach-user", fullName: "Huấn luyện viên An", role: "COACH" },
      ];
    else if (path === "/chat/conversations") data = [];
    else if (path === "/chat/messages" && req.method() === "GET")
      data = [
        {
          id: "m1",
          senderId: "coach-user",
          sender: { fullName: "Huấn luyện viên An" },
          content: "Hẹn gặp tại lớp Yoga",
          createdAt: "2026-09-18T03:00:00Z",
          fileUrl: "javascript:alert(1)",
        },
      ];
    else if (path === "/chat/messages") data = { id: "sent" };
    else if (path === "/training-plans") {
      expect(url.searchParams.get("memberId")).toBe("member-1");
      data = [
        plan,
        {
          ...plan,
          id: "other",
          memberId: "member-other",
          name: "Không được hiển thị",
        },
      ];
    } else if (path === "/enrollments/my")
      data = [
        {
          id: "e1",
          memberId: "member-1",
          scheduleId: "s1",
          status: "COMPLETED",
          schedule: {
            id: "s1",
            startTime: "2026-09-10T02:00:00Z",
            class: { name: "Yoga" },
          },
        },
      ];
    else if (path === "/attendance")
      data = [
        {
          id: "a1",
          memberId: "member-1",
          scheduleId: "s1",
          status: "ABSENT",
          note: "Nghỉ học",
        },
        {
          id: "a2",
          memberId: "member-other",
          scheduleId: "s1",
          status: "PRESENT",
          note: "Thông tin riêng người khác",
        },
      ];
    else return route.fallback();
    return route.fulfill({
      json: { success: true, data, ...(pagination ? { pagination } : {}) },
    });
  });
  return calls;
}

for (const width of [375, 1440])
  test(`real notifications wrap and mark read at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await workflow(page);
    await page.goto("/member/notifications");
    await expect(
      page.getByRole("heading", { name: "Lịch học đã cập nhật" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await expect(
      page.getByText("0 thông báo chưa đọc", { exact: true }),
    ).toBeVisible();
    expect(
      calls.some(
        (c) => c.path === "/notifications/n1/read" && c.method === "PATCH",
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/workflow-notifications-${width}.png`,
      fullPage: true,
    });
  });

test("member sees assigned training results and cannot edit or see another member", async ({
  page,
}) => {
  await workflow(page);
  await page.goto("/member/training");
  await expect(
    page.getByText("Cải thiện sức bền", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("5 km", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Không được hiển thị", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thêm kế hoạch" })).toHaveCount(
    0,
  );
});

test("completed booking does not imply presence; member sees own recorded attendance", async ({
  page,
}) => {
  await workflow(page);
  await page.goto("/member/attendance");
  await expect(page.getByText("Vắng mặt", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Thông tin riêng người khác", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lưu điểm danh" })).toHaveCount(
    0,
  );
});

test("chat sends private multipart messages, validates empty input and rejects unsafe links", async ({
  page,
}) => {
  const calls = await workflow(page);
  await page.goto("/member/chat");
  await page.getByLabel("Cuộc trò chuyện").selectOption("coach-user");
  await expect(
    page.getByRole("button", { name: "Gửi tin nhắn" }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Mở tệp đính kèm" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Nội dung", { exact: true })
    .fill("Em xin xác nhận lịch tập.");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByLabel("Nội dung", { exact: true })).toHaveValue("");
  const sent = calls.find(
    (c) => c.path === "/chat/messages" && c.method === "POST",
  );
  expect(sent?.body).toContain('name="receiverId"');
  expect(sent?.body).toContain("coach-user");
  expect(sent?.body).toContain("Em xin xác nhận lịch tập.");
});

test("dynamic role changes expire session without refreshing obsolete permissions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("pulse.access", "old");
    sessionStorage.setItem("pulse.refresh", "refresh");
  });
  const calls: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    calls.push(route.request().url());
    return route.fulfill({
      status: 401,
      json: {
        success: false,
        message: "Unauthorized: role has changed, please login again",
      },
    });
  });
  await page.goto("/member/dashboard");
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Vai trò tài khoản đã thay đổi. Vui lòng đăng nhập lại.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls.some((c) => c.endsWith("/auth/refresh-token"))).toBe(false);
  expect(
    await page.evaluate(() => sessionStorage.getItem("pulse.access")),
  ).toBeNull();
});

test("manager gains finance screens while staff has no refund action", async ({
  page,
}) => {
  await setup(page, "MANAGER");
  await page.goto("/manager/payments");
  await expect(
    page.getByRole("heading", { name: "Thanh toán & hóa đơn", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chọn", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Hoàn tiền", exact: true }),
  ).toBeVisible();
  await setup(page, "STAFF");
  await page.goto("/receptionist/payments");
  await page.getByRole("button", { name: "Chọn", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Hoàn tiền", exact: true }),
  ).toHaveCount(0);
});

test("staff completes only ended sessions through dedicated API and cannot mark attendance", async ({
  page,
}) => {
  await setup(page, "STAFF");
  const now = Date.now();
  const past = {
    id: "ended",
    status: "SCHEDULED",
    startTime: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(now - 60 * 60 * 1000).toISOString(),
    class: { name: "Buổi đã kết thúc" },
    room: { name: "Phòng A" },
  };
  let completed = false;
  const mutations: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    if (req.method() !== "GET") mutations.push(req.method() + " " + path);
    let data: unknown;
    if (path === "/class-schedules")
      data = [
        { ...past, status: completed ? "COMPLETED" : "SCHEDULED" },
        {
          ...past,
          id: "future",
          startTime: new Date(now + 60 * 60 * 1000).toISOString(),
          endTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
          class: { name: "Buổi chưa kết thúc" },
        },
      ];
    else if (path === "/class-schedules/ended/complete") {
      completed = true;
      data = { ...past, status: "COMPLETED" };
    } else if (path === "/class-schedules/ended")
      data = { ...past, status: completed ? "COMPLETED" : "SCHEDULED" };
    else if (path === "/class-schedules/future")
      data = {
        ...past,
        id: "future",
        startTime: new Date(now + 60 * 60 * 1000).toISOString(),
        endTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        class: { name: "Buổi chưa kết thúc" },
      };
    else if (path === "/enrollments/schedule/ended")
      data = [
        {
          id: "e1",
          memberId: "m1",
          status: "COMPLETED",
          member: { user: { fullName: "Hội viên An" } },
        },
      ];
    else if (path === "/attendance") data = [];
    else return route.fallback();
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto("/receptionist/schedules");
  await page.getByRole("button", { name: /Buổi chưa kết thúc/ }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Hoàn tất" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Buổi đã kết thúc/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hoàn tất" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  expect(mutations).toEqual(["PATCH /class-schedules/ended/complete"]);
  await page.getByRole("button", { name: /Buổi đã kết thúc/ }).click();
  await page.getByRole("button", { name: "Học viên & điểm danh" }).click();
  await expect(
    page.locator("summary").filter({ hasText: "Chưa điểm danh" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu điểm danh" })).toHaveCount(
    0,
  );
});

test("manager edit schedule does not offer lifecycle status bypass", async ({
  page,
}) => {
  await setup(page, "MANAGER");
  const schedule = {
    id: "editable-schedule",
    status: "SCHEDULED",
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    class: { id: "class-1", name: "Lớp chỉnh sửa" },
    room: { id: "room-1", name: "Phòng A" },
  };
  await page.route("**/api/v1/class-schedules**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1",
      "",
    );
    return route.fulfill({
      json: {
        success: true,
        data: path === "/class-schedules" ? [schedule] : schedule,
      },
    });
  });
  await page.goto("/manager/schedules");
  await page.locator(".calendar-event").first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Chỉnh sửa", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByLabel("Trạng thái")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("dialog").getByLabel("Bắt đầu", { exact: true }),
  ).toBeVisible();
});
