import { expect, it } from "vitest";
import {
  PASS_LEVEL,
  TERM_STATE,
  deliverySummary,
  extractPassToken,
  percent,
  registrationSummary,
  termState,
} from "../src/features/manage/termsView";

it("maps every BE term state to a Vietnamese label and tone", () => {
  expect(termState("COMPLIANT")).toEqual(["Đạt", "ok"]);
  expect(termState("NON_COMPLIANT")).toEqual(["Chưa đạt", "bad"]);
  expect(termState("PENDING")[1]).toBe("warn");
  expect(termState("EXEMPT")[0]).toBe("Được miễn");
  expect(Object.keys(TERM_STATE).sort()).toEqual(["COMPLIANT", "EXEMPT", "NON_COMPLIANT", "PENDING"]);
  expect(termState("LẠ")).toEqual(["LẠ", "info"]);
});

it("formats rates as whole percentages and keeps missing data as a dash", () => {
  expect(percent(0.857)).toBe("86%");
  expect(percent(0)).toBe("0%");
  expect(percent(null)).toBe("—");
  expect(percent(undefined)).toBe("—");
});

it("summarises the registration column for each situation", () => {
  expect(registrationSummary({ state: "COMPLIANT", registration: { ok: true, qualifyingClassName: "Gym A", mainSessions: 9 } })).toBe("Gym A · 9 buổi");
  expect(registrationSummary({ state: "COMPLIANT", registration: { ok: true, qualifyingClassName: "Gym A", mainSessions: 9, pendingApproval: true } })).toContain("chờ duyệt");
  expect(registrationSummary({ state: "PENDING", daysToDeadline: 4, registration: { ok: false } })).toBe("Chưa có khóa hợp lệ · còn 4 ngày");
  expect(registrationSummary({ state: "PENDING", daysToDeadline: 0, registration: { ok: false } })).toContain("còn 1 ngày");
  expect(registrationSummary({ state: "NON_COMPLIANT", registration: { ok: false } })).toBe("Quá hạn — chưa có khóa hợp lệ");
  expect(registrationSummary({ state: "PENDING" })).toBe("—");
});

it("summarises delivery without noise for zero counts", () => {
  expect(deliverySummary({ state: "COMPLIANT", delivery: { completed: 8, cancelled: 0, awaitingComplete: 0 } })).toBe("8 đã dạy");
  expect(deliverySummary({ state: "COMPLIANT", delivery: { completed: 5, cancelled: 2, awaitingComplete: 1 } })).toBe("5 đã dạy · 2 hủy · 1 chưa hoàn tất");
});

it("extracts the JWT from raw text, links or surrounding whitespace", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoiQ09BQ0hfUEFTUyJ9.c2lnbmF0dXJlLXRleHQtMTIz";
  expect(extractPassToken(`  ${jwt}\n`)).toBe(jwt);
  expect(extractPassToken(`pulse://coach-pass?token=${jwt}`)).toBe(jwt);
  expect(extractPassToken("khong-co-token")).toBe("khong-co-token");
});

it("labels every pass level", () => {
  expect(PASS_LEVEL.OK.tone).toBe("ok");
  expect(PASS_LEVEL.WARN.tone).toBe("warn");
  expect(PASS_LEVEL.DENY.label).toBe("Không hợp lệ");
});
