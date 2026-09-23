import { describe, expect, it } from "vitest";
import { downgradeReason, refundEstimate } from "../src/shared/businessRules";
import { classSports, sportNames } from "../src/shared/sports";

describe("September business rules", () => {
  it("blocks tier and same-tier duration downgrades but permits an upgrade", () => {
    expect(
      downgradeReason(
        { tier: "PREMIUM", plan: { durationDays: 20 } },
        { tier: "MEMBERSHIP", durationDays: 90 },
      ),
    ).not.toBe("");
    expect(
      downgradeReason(
        { tier: "MEMBERSHIP", plan: { durationDays: 30 } },
        { tier: "MEMBERSHIP", durationDays: 20 },
      ),
    ).not.toBe("");
    expect(
      downgradeReason(
        { tier: "MEMBERSHIP", plan: { durationDays: 30 } },
        { tier: "PREMIUM", durationDays: 20 },
      ),
    ).toBe("");
  });
  it("uses the strict 15-day boundary and different manager/member refund rules", () => {
    const now = Date.parse("2026-09-01T00:00:00Z");
    expect(
      refundEstimate("2026-09-16T00:00:00Z", 500000, 30, "MEMBER", now)
        .refundAmount,
    ).toBe(0);
    expect(
      refundEstimate("2026-09-16T00:00:01Z", 500000, 30, "MEMBER", now)
        .refundAmount,
    ).toBe(150000);
    expect(
      refundEstimate("2026-09-21T00:00:00Z", 300000, 30, "MANAGER", now)
        .refundAmount,
    ).toBe(200000);
    expect(
      refundEstimate("2026-08-21T00:00:00Z", 300000, 30, "MANAGER", now)
        .refundAmount,
    ).toBe(0);
  });
  it("reads many-to-many sports without discarding the second sport", () => {
    expect(
      sportNames({
        sports: [
          { sport: { id: "1", name: "Yoga" } },
          { sport: { id: "2", name: "Pilates" } },
        ],
      }),
    ).toBe("Yoga · Pilates");
    expect(classSports({ sports: [{ id: "1", name: "Yoga" }] })).toEqual([
      { id: "1", name: "Yoga" },
    ]);
    expect(sportNames({ sport: { name: "Yoga" } })).toBe("Yoga");
  });
});
