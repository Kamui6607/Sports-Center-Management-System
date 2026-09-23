import { beforeEach, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.stubGlobal("sessionStorage", { getItem: () => null });
});
it("uses the Vietnam calendar day at the UTC midnight boundary", async () => {
  const { dateKey, fmt } = await import("../src/features/coach/data");
  expect(dateKey("2026-09-17T17:30:00Z")).toBe("2026-09-18");
  expect(fmt("2026-09-17T17:30:00Z", true)).toBe("00:30");
});
it("keeps Sunday in its teaching week across month boundaries", async () => {
  const { monday, addDays } = await import("../src/features/coach/data");
  expect(monday("2026-03-01")).toBe("2026-02-23");
  expect(addDays("2026-02-23", 6)).toBe("2026-03-01");
});
it("rejects impossible birthdates and unnormalized telephone input", async () => {
  const { validateCoachProfile } =
    await import("../src/features/coach/CoachProfile");
  const errors = validateCoachProfile({
    fullName: "  ",
    phone: "++0901234567",
    dateOfBirth: "2001-02-30",
  });
  expect(Object.keys(errors).sort()).toEqual([
    "dateOfBirth",
    "fullName",
    "phone",
  ]);
  expect(
    validateCoachProfile({
      fullName: "Nguyễn An",
      phone: "+84901234567",
      dateOfBirth: "2000-02-29",
    }),
  ).toEqual({});
});
it("rejects unexpected list payloads rather than displaying a false empty state", async () => {
  const { rows } = await import("../src/features/coach/data");
  expect(() => rows({ unexpected: [] })).toThrow("Dữ liệu danh sách");
});
it("does not silently duplicate roster data if the server ignores page", async () => {
  const client = await import("../src/shared/api");
  const mock = vi.spyOn(client, "api").mockResolvedValue({
    success: true,
    message: "OK",
    data: [{ id: "member" }],
    pagination: { page: 1, totalPages: 2, total: 2, limit: 1 },
  });
  const { all } = await import("../src/features/coach/data");
  await expect(
    all("GET /classes", {}, new AbortController().signal),
  ).rejects.toThrow("Máy chủ chưa trả đúng trang");
  mock.mockRestore();
});
