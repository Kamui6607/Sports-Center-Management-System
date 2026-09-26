import { beforeEach, describe, expect, it, vi } from "vitest";
const envelope = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status < 400,
      message: status < 400 ? "OK" : "Expired",
      data,
    }),
    { status },
  );
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
describe("API client contract and authentication", () => {
  it("does not refresh a session revoked by Dynamic Auth", async () => {
    sessionStorage.setItem("pulse.access", "old");
    sessionStorage.setItem("pulse.refresh", "refresh");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized: account is locked",
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { api, hasSession } = await import("../src/shared/api");
    await expect(api("GET /auth/me")).rejects.toThrow("Tài khoản đã bị khóa");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hasSession()).toBe(false);
  });
  it("keeps browser multipart boundaries for chat uploads", async () => {
    const fetch = vi.fn().mockResolvedValue(envelope({ id: "m1" }));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../src/shared/api");
    const body = new FormData();
    body.set("content", "Hello");
    await api("POST /chat/messages", { body });
    expect(fetch.mock.calls[0][1].body).toBe(body);
    expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
  });
  it("loads all verified pages and fails on a repeated page instead of hiding records", async () => {
    const fetch = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ id: String(page) }],
          pagination: { page, totalPages: 2, total: 2, limit: 1 },
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const { allPages } = await import("../src/shared/pagedApi");
    expect((await allPages("GET /membership-plans")).data).toEqual([
      { id: "1" },
      { id: "2" },
    ]);
    fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            pagination: { page: 1, totalPages: 2 },
          }),
        ),
    );
    await expect(allPages("GET /membership-plans")).rejects.toThrow(
      "sai trang",
    );
  });
  it("rejects an undocumented endpoint before network access", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../src/shared/api");
    await expect(api("GET /invented")).rejects.toThrow(
      "Undocumented operation",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects undocumented pagination and encodes path parameters", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        envelope(url.includes("/class-schedules") ? [] : {}),
      );
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../src/shared/api");
    await expect(
      api("GET /membership-plans", { query: { invented: "2" } }),
    ).rejects.toThrow("Undocumented query");
    await api("GET /users/{id}", { params: { id: "a/b?c" } });
    expect(fetch.mock.calls[0][0]).toMatch(/\/users\/a%2Fb%3Fc$/);
  });
  it("shares one refresh for concurrent 401 responses and retries with the new token", async () => {
    sessionStorage.setItem("pulse.access", "old");
    sessionStorage.setItem("pulse.refresh", "refresh");
    let refreshCalls = 0;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/auth/refresh-token")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return envelope({ accessToken: "new" });
      }
      return (options.headers as Record<string, string>).Authorization ===
        "Bearer old"
        ? envelope(null, 401)
        : envelope([]);
    });
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../src/shared/api");
    const result = await Promise.all([api("GET /users"), api("GET /rooms")]);
    expect(refreshCalls).toBe(1);
    expect(result.every((r) => r.success)).toBe(true);
    expect(sessionStorage.getItem("pulse.access")).toBe("new");
  });
  it("clears tokens and announces session expiration when refresh is rejected", async () => {
    sessionStorage.setItem("pulse.access", "old");
    sessionStorage.setItem("pulse.refresh", "bad");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => envelope(null, 401)),
    );
    const { api } = await import("../src/shared/api");
    await expect(api("GET /users")).rejects.toMatchObject({ status: 401 });
    expect(sessionStorage.getItem("pulse.access")).toBeNull();
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
  it("retains field validation errors and does not refresh on forbidden", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            message: "Validation failed",
            errors: [{ field: "capacity", message: "Must be positive" }],
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(envelope(null, 403));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../src/shared/api");
    await expect(
      api("POST /rooms", { body: { name: "A", capacity: 0 } }),
    ).rejects.toMatchObject({
      status: 400,
      errors: [{ field: "capacity", message: "Giá trị phải lớn hơn 0." }],
    });
    await expect(api("GET /users")).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reports malformed server content instead of inventing an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>Unavailable</html>", { status: 502 }),
      ),
    );
    const { api } = await import("../src/shared/api");
    await expect(api("GET /sports")).rejects.toMatchObject({ status: 502 });
  });
});

describe("member API uses the shared session transport", () => {
  it("adapts list envelopes without dropping pagination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: "class-1", name: "Yoga" }],
            pagination: { page: 2, totalPages: 3 },
          }),
          { status: 200 },
        ),
      ),
    );
    const { classesApi } = await import("../src/api/classes.api");
    await expect(classesApi.getClasses({ page: 2 })).resolves.toEqual({
      classes: [{ id: "class-1", name: "Yoga" }],
      pagination: { page: 2, totalPages: 3 },
    });
  });
  it("accepts enrollment pagination verified against the backend schema", async () => {
    const fetch = vi.fn().mockResolvedValue(envelope([]));
    vi.stubGlobal("fetch", fetch);
    const { enrollmentsApi } = await import("../src/api/enrollments.api");
    await enrollmentsApi.getMyEnrollments({ status: "BOOKED", limit: 5 });
    expect(fetch.mock.calls[0][0]).toContain(
      "/enrollments/my?status=BOOKED&page=1&limit=100",
    );
  });
  it("uses the deployed transfer, quota, calendar and whole-course contracts", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        envelope(url.includes("/class-schedules") ? [] : {}),
      );
    vi.stubGlobal("fetch", fetch);
    const { enrollmentsApi } = await import("../src/api/enrollments.api");
    const { classesApi } = await import("../src/api/classes.api");
    await enrollmentsApi.transferEnrollment("enrollment-1", "schedule-2");
    expect(fetch.mock.calls[0][0]).toMatch(
      /\/enrollments\/enrollment-1\/transfer$/,
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      targetScheduleId: "schedule-2",
    });
    await enrollmentsApi.getMyQuota();
    expect(fetch.mock.calls[1][0]).toMatch(/\/enrollments\/my\/quota$/);
    await classesApi.getSchedules({
      from: "2026-09-21T00:00:00+07:00",
      to: "2026-09-28T00:00:00+07:00",
      weekdays: "2,4,8",
    });
    const url = new URL(fetch.mock.calls[2][0]);
    expect(url.searchParams.get("weekdays")).toBe("2,4,8");
    expect(url.searchParams.get("from")).toBe("2026-09-20T17:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-09-27T17:00:00.000Z");
    await classesApi.getCoursePlan("class-1");
    expect(fetch.mock.calls[3][0]).toMatch(/\/classes\/class-1\/course-plan$/);
    await enrollmentsApi.enrollWholeCourse("class-1");
    expect(fetch.mock.calls[4][0]).toMatch(/\/enrollments\/bulk$/);
    expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({
      classId: "class-1",
    });
  });
  it("shares token changes with the existing API and localizes member errors", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          message: "Duplicate value for: phone",
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../src/shared/api");
    const { setTokens } = await import("../src/api/client");
    setTokens("member-token", "member-refresh");
    await expect(
      api("PATCH /auth/me", { body: { phone: "0900000000" } }),
    ).rejects.toMatchObject({ message: "Số điện thoại này đã được sử dụng." });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer member-token",
    );
  });
});
