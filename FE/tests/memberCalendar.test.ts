import { describe, expect, it } from "vitest";
import { memberDateKey, memberWeekStart } from "../src/shared/memberCalendar";

describe("member calendar uses Vietnam dates", () => {
  it("places Saturday and Sunday classes in their own columns", () => {
    const monday = memberWeekStart(new Date("2026-09-25T10:00:00Z"));
    const columns = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setUTCDate(day.getUTCDate() + i);
      return memberDateKey(day);
    });
    expect(columns.indexOf(memberDateKey("2026-09-26T08:00:00Z"))).toBe(5);
    expect(columns.indexOf(memberDateKey("2026-09-27T08:00:00Z"))).toBe(6);
    expect(columns.indexOf(memberDateKey("2026-09-25T18:00:00Z"))).toBe(5);
  });
  it("agrees across UTC and explicit Vietnam offsets", () => {
    expect(memberDateKey("2026-09-26T17:30:00Z")).toBe("2026-09-27");
    expect(memberDateKey("2026-09-27T00:30:00+07:00")).toBe("2026-09-27");
  });
  it("uses Vietnam Monday even when UTC is still Sunday, across year boundaries", () => {
    expect(
      memberWeekStart(new Date("2026-09-27T18:00:00Z")).toISOString(),
    ).toBe("2026-09-28T00:00:00.000Z");
    expect(
      memberWeekStart(new Date("2027-01-01T10:00:00Z")).toISOString(),
    ).toBe("2026-12-28T00:00:00.000Z");
  });
});
