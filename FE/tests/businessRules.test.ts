import { describe, expect, it } from "vitest";
import {
  canCompleteSchedule,
  effectiveSubscription,
  isEffectiveSubscription,
  paymentTransitions,
  subscriptionTransitions,
  terminalSessionError,
} from "../src/shared/businessRules";
import { translateApiMessage } from "../src/shared/apiErrors";
const now = Date.parse("2026-09-18T06:00:00Z");
describe("workflow state boundaries", () => {
  it("requires ACTIVE status and both date bounds for entitlement", () => {
    const s = {
      status: "ACTIVE",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
      tier: "MEMBERSHIP",
    };
    expect(isEffectiveSubscription(s, now)).toBe(true);
    expect(
      isEffectiveSubscription({ ...s, startDate: "2026-09-19" }, now),
    ).toBe(false);
    expect(isEffectiveSubscription({ ...s, endDate: "2026-09-17" }, now)).toBe(
      false,
    );
    expect(isEffectiveSubscription({ ...s, status: "SUSPENDED" }, now)).toBe(
      false,
    );
    expect(isEffectiveSubscription({ ...s, startDate: "invalid" }, now)).toBe(
      false,
    );
    expect(
      effectiveSubscription([s, { ...s, tier: "PREMIUM" }], now)?.tier,
    ).toBe("PREMIUM");
  });
  it("payment states are terminal and refunds require manager", () => {
    expect(paymentTransitions("PENDING", "MANAGER")).toEqual([
      "SUCCESS",
      "FAILED",
    ]);
    expect(paymentTransitions("SUCCESS", "MANAGER")).toEqual(["REFUNDED"]);
    expect(paymentTransitions("REFUNDED", "MANAGER")).toEqual([]);
    expect(paymentTransitions("FAILED", "MANAGER")).toEqual([]);
    expect(paymentTransitions("SUCCESS", "STAFF")).toEqual([]);
  });
  it("does not resume auto-suspended subscriptions without saved entitlement", () => {
    expect(subscriptionTransitions({ status: "SUSPENDED" }, "MANAGER")).toEqual(
      ["CANCELLED"],
    );
    expect(
      subscriptionTransitions(
        { status: "SUSPENDED", remainingDays: 4 },
        "MANAGER",
      ),
    ).toEqual(["ACTIVE", "CANCELLED"]);
    expect(subscriptionTransitions({ status: "CANCELLED" }, "MANAGER")).toEqual(
      [],
    );
    expect(subscriptionTransitions({ status: "ACTIVE" }, "STAFF")).toEqual([]);
  });
  it("only closes scheduled sessions after their end", () => {
    expect(
      canCompleteSchedule(
        { status: "SCHEDULED", endTime: "2026-09-18T06:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      canCompleteSchedule(
        { status: "SCHEDULED", endTime: "2026-09-18T06:01:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      canCompleteSchedule({ status: "CANCELLED", endTime: "2026-09-17" }, now),
    ).toBe(false);
    expect(
      canCompleteSchedule({ status: "COMPLETED", endTime: "2026-09-17" }, now),
    ).toBe(false);
  });
  it("distinguishes revoked access from refreshable token expiry", () => {
    for (const message of [
      "Unauthorized: account is locked",
      "Unauthorized: role has changed, please login again",
      "Unauthorized: user not found",
    ])
      expect(terminalSessionError(message)).toBe(true);
    expect(terminalSessionError("Unauthorized: invalid or expired token")).toBe(
      false,
    );
  });
  it("translates business conflicts without changing their cause", () => {
    expect(translateApiMessage("This class is full")).toContain("đủ số lượng");
    expect(
      translateApiMessage(
        "Cannot change role: COACH is assigned to upcoming classes.",
      ),
    ).toContain("lịch dạy");
    expect(
      translateApiMessage("Subscription belongs to a different member"),
    ).toContain("hội viên khác");
    expect(translateApiMessage("Duplicate value for: phone")).not.toContain(
      "Email",
    );
  });
});
