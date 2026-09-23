import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fixture(page: Page, role = "MEMBER") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-09-20T03:00:00Z") });
  await page.addInitScript(() =>
    sessionStorage.setItem("pulse.access", "local-fixture"),
  );
  const calls: { path: string; method: string; body: any }[] = [];
  const cls = {
    id: "c1",
    name: "Yoga & Pilates",
    capacity: 20,
    classType: "REGULAR",
    isActive: true,
    sports: [
      { sport: { id: "s1", name: "Yoga" } },
      { sport: { id: "s2", name: "Pilates" } },
    ],
    coaches: [{ coach: { id: "coach1", user: { fullName: "HLV An" } } }],
    createdAt: "2026-09-01T00:00:00Z",
  };
  let cancelled = false,
    feedback: any[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", "");
    const body = request.postData() ? request.postDataJSON() : null;
    calls.push({ path, method: request.method(), body });
    let data: any = [];
    if (path === "/auth/me")
      data = {
        id: "u1",
        role,
        isActive: true,
        fullName: "Minh Anh",
        email: "test@example.test",
        memberProfile: { id: "m1" },
        coachProfile: { id: "coach1" },
      };
    else if (path === "/classes") data = [cls];
    else if (path === "/classes/c1") data = cls;
    else if (path === "/sports")
      data = [
        { id: "s1", name: "Yoga", isActive: true },
        { id: "s2", name: "Pilates", isActive: true },
      ];
    else if (path === "/class-schedules")
      data = [
        {
          id: "sch1",
          status: "SCHEDULED",
          startTime: "2026-09-20T02:00:00Z",
          endTime: "2026-09-20T04:00:00Z",
          class: { ...cls, coaches: undefined },
          room: { name: "Phòng A" },
        },
      ];
    else if (path === "/enrollments/my")
      data = [
        {
          id: "e1",
          memberId: "m1",
          status: "BOOKED",
          schedule: {
            id: "sch1",
            startTime: "2026-09-20T02:00:00Z",
            class: { ...cls, coaches: undefined },
          },
        },
      ];
    else if (path === "/attendance/generate-qr")
      data = { qrToken: "qr-" + calls.length, expiresIn: 60 };
    else if (path === "/attendance/scan-qr") data = { status: "PRESENT" };
    else if (path.startsWith("/subscriptions/member/"))
      data = [
        {
          id: "sub1",
          tier: "MEMBERSHIP",
          startDate: "2026-09-01T00:00:00Z",
          endDate: "2026-10-10T00:00:00Z",
          status: cancelled ? "CANCELLED" : "ACTIVE",
          plan: { name: "Gói 30 ngày", price: 300000, durationDays: 30 },
        },
      ];
    else if (path === "/subscriptions/sub1/cancel") {
      cancelled = true;
      data = {
        status: "CANCELLED",
        daysLeft: 20,
        refundAmount: 90000,
        willRefund: true,
      };
    } else if (path === "/feedbacks/my") data = feedback;
    else if (path === "/feedbacks" && request.method() === "POST") {
      feedback = [
        { ...body, id: "f1", member: { user: { fullName: "Minh Anh" } } },
      ];
      data = feedback[0];
    } else if (path === "/feedbacks")
      data = {
        feedbacks: feedback,
        summary: {
          averageRating: feedback.length ? 4 : null,
          totalFeedbacks: feedback.length,
        },
      };
    else if (path === "/feedbacks/f1") {
      feedback = [];
      data = {};
    } else if (path.endsWith("unread-count")) data = { unreadCount: 0 };
    await route.fulfill({
      json: {
        success: true,
        data,
        pagination: Array.isArray(data)
          ? { page: 1, totalPages: 1, total: data.length, limit: 100 }
          : undefined,
      },
    });
  });
  return calls;
}

test("member confirms cancellation once and sees the authoritative refund", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/member/membership");
  await page.getByRole("button", { name: "Hủy gói", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("30%");
  expect(calls.filter((c) => c.path.endsWith("/cancel"))).toHaveLength(0);
  await page.getByLabel("Lý do hủy").fill("Không còn thời gian");
  await page.getByRole("button", { name: "Xác nhận hủy gói" }).click();
  await expect(page.getByRole("dialog")).toContainText("90.000");
  expect(calls.filter((c) => c.path.endsWith("/cancel"))).toEqual([
    {
      path: "/subscriptions/sub1/cancel",
      method: "PATCH",
      body: { reason: "Không còn thời gian" },
    },
  ]);
});

test("member scans token and writes an anonymous class-specific feedback", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/member/attendance");
  await page
    .getByText("Nhập mã nếu không dùng được camera", { exact: true })
    .click();
  await page.getByLabel("Mã điểm danh", { exact: true }).fill("live-token");
  await page.getByRole("button", { name: "Xác nhận điểm danh" }).click();
  await expect(
    page.getByText("Điểm danh thành công!", { exact: true }),
  ).toBeVisible();
  expect(calls.find((c) => c.path === "/attendance/scan-qr")?.body).toEqual({
    qrToken: "live-token",
  });
  await page.goto("/member/classes/c1");
  await expect(page.getByText("Yoga · Pilates", { exact: true })).toBeVisible();
  await page.getByText("Đánh giá · HLV An", { exact: true }).click();
  await page.getByRole("button", { name: "Viết đánh giá" }).click();
  await page.getByLabel("Số sao").selectOption("4");
  await page.getByLabel("Hiển thị tên").selectOption("true");
  await page.getByLabel("Nhận xét").fill("Hướng dẫn rõ ràng");
  await page.getByRole("button", { name: "Gửi đánh giá" }).click();
  await expect(page.getByText("Ẩn danh · 4/5", { exact: true })).toBeVisible();
  expect(
    calls.find((c) => c.path === "/feedbacks" && c.method === "POST")?.body,
  ).toEqual({
    coachId: "coach1",
    classId: "c1",
    rating: 4,
    comment: "Hướng dẫn rõ ràng",
    isAnonymous: true,
  });
});

for (const width of [375, 1440])
  test(`compact details and multi-sport editing at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await fixture(page, "MANAGER");
    await page.goto("/manager/classes");
    await page.getByRole("button", { name: "Xem chi tiết" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Pilates", { exact: true })).toBeVisible();
    await expect(dialog.getByText("c1", { exact: true })).not.toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/new-details-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Chỉnh sửa", exact: true })
      .first()
      .click();
    await expect(page.getByLabel("Các bộ môn")).toHaveValues(["s1", "s2"]);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect
      .poll(
        () =>
          calls.find((c) => c.path === "/classes/c1" && c.method === "PATCH")
            ?.body.sportIds,
      )
      .toEqual(["s1", "s2"]);
  });

test("coach QR rotates after 55 seconds and stops when hidden", async ({
  page,
}) => {
  const calls = await fixture(page, "COACH");
  await page.goto("/coach/schedule");
  await page
    .getByRole("button", { name: /Yoga & Pilates.*Xem học viên/ })
    .click();
  await page.getByRole("button", { name: "Tạo QR điểm danh" }).click();
  await expect(
    page.getByRole("img", { name: "Mã QR điểm danh buổi học" }),
  ).toBeVisible();
  await page.clock.fastForward(55000);
  await expect
    .poll(
      () => calls.filter((c) => c.path === "/attendance/generate-qr").length,
    )
    .toBe(2);
  await page.getByRole("button", { name: "Ẩn mã QR" }).click();
  await page.clock.fastForward(60000);
  expect(
    calls.filter((c) => c.path === "/attendance/generate-qr"),
  ).toHaveLength(2);
});

test("expired membership QR response offers renewal and never reports success", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/attendance/scan-qr", (route) =>
    route.fulfill({
      status: 403,
      json: {
        success: false,
        message:
          "Gói tập của bạn đã hết hạn. Vui lòng gia hạn để có thể vào lớp học.",
      },
    }),
  );
  await page.goto("/member/attendance");
  await page
    .getByText("Nhập mã nếu không dùng được camera", { exact: true })
    .click();
  await page
    .getByLabel("Mã điểm danh", { exact: true })
    .fill("expired-membership-token");
  await page.getByRole("button", { name: "Xác nhận điểm danh" }).click();
  await expect(
    page.getByRole("link", { name: "Gia hạn ngay" }),
  ).toHaveAttribute("href", "/member/membership");
  await expect(
    page.getByText("Điểm danh thành công!", { exact: true }),
  ).toHaveCount(0);
});

test("booking conflict preserves server message and does not report a booking", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/class-schedules?**", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: "future",
            startTime: "2026-09-21T03:00:00Z",
            endTime: "2026-09-21T04:00:00Z",
            status: "SCHEDULED",
            class: { capacity: 20 },
            room: { name: "Phòng A" },
            _count: { enrollments: 0 },
          },
        ],
      },
    }),
  );
  await page.route("**/enrollments", (route) =>
    route.fulfill({
      status: 409,
      json: {
        success: false,
        message: "You have a conflicting class 'Yoga buổi sáng' at this time",
      },
    }),
  );
  await page.goto("/member/classes/c1");
  await page.getByRole("button", { name: "Đặt ca học" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Xác nhận/ })
    .click();
  await expect(
    page.getByText(/Bạn bị trùng giờ với lớp đã đăng ký/),
  ).toBeVisible();
  await expect(page.getByText(/Đặt lớp học thành công/)).toHaveCount(0);
});
