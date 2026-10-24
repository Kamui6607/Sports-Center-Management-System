import { describe, expect, it } from "vitest";
import { localizeApiError } from "../src/shared/apiErrors";

describe("Vietnamese backend errors", () => {
  it.each(["email", "phone"])(
    "identifies the actual duplicate %s from the API contract",
    (field) => {
      const result = localizeApiError(
        `Duplicate value for: ${field}`,
        undefined,
        409,
      );
      expect(result.errors[0].field).toBe(field);
      expect(result.message).toContain(
        field === "phone" ? "Số điện thoại" : "Email",
      );
      if (field === "phone") expect(result.message).not.toContain("Email");
    },
  );
  it("never assumes that an unspecified conflict is an email duplicate", () => {
    const result = localizeApiError(undefined, null, 409);
    expect(result.message).toContain("xung đột");
    expect(result.message).not.toContain("Email");
    expect(result.errors).toEqual([]);
  });
  it("preserves unrecognized business errors and existing Vietnamese", () => {
    for (const message of [
      "Booking conflicts with another class",
      "Số điện thoại này đã tồn tại.",
    ]) {
      expect(localizeApiError(message, [], 409).message).toBe(message);
    }
  });
  it("localizes validation fields and safely ignores malformed entries", () => {
    expect(
      localizeApiError(
        "Validation failed",
        [
          null,
          { field: "email", message: "Invalid email address" },
          { field: "phone" },
        ],
        400,
      ),
    ).toEqual({
      message: "Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường bên dưới.",
      errors: [{ field: "email", message: "Email không hợp lệ." }],
    });
  });
  it("handles multiple duplicate fields without losing either error", () => {
    expect(
      localizeApiError("Duplicate value for: email, phone", [], 409).errors.map(
        (e) => e.field,
      ),
    ).toEqual(["email", "phone"]);
  });
  it("uses backend field details when there is no top-level message", () => {
    const result = localizeApiError(
      null,
      [{ field: "phone", message: "Already exists" }],
      409,
    );
    expect(result.message).toBe("Số điện thoại này đã được sử dụng.");
  });
});
