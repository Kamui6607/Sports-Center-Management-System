import { describe, expect, it } from "vitest";
import { formatMemberDate } from "../src/shared/memberFormat";
describe("member date display", () => {
  it.each([undefined, null, "", "invalid", new Date(NaN)])("does not display Invalid Date for missing or invalid data", value => {
    expect(formatMemberDate(value)).toBe("Chưa cập nhật");
  });
  it("formats a valid timestamp in Vietnamese", () => {
    expect(formatMemberDate("2026-09-17T12:00:00Z")).toContain("2026");
  });
});
