import type { Page } from "@playwright/test";
import fs from "node:fs";
const doc = JSON.parse(fs.readFileSync("docs/openapi.json", "utf8"));
export async function setup(page: Page, role = "STAFF", longText = false) {
  await page.addInitScript(() =>
    sessionStorage.setItem("pulse.access", "fixture-token"),
  );
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const template = Object.keys(doc.paths).find((p) =>
      new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(path),
    );
    const operation =
      template && doc.paths[template][route.request().method().toLowerCase()];
    if (!operation)
      return route.fulfill({
        status: 404,
        json: { success: false, message: "Missing fixture " + path },
      });
    const response: any = Object.entries(operation.responses).find(([code]) =>
      code.startsWith("2"),
    )?.[1];
    const payload = structuredClone(
      doc.components.responses[response.$ref.split("/").pop()].content[
        "application/json"
      ].schema.example,
    );
    if (path === "/auth/me") payload.data.role = role;
    if (path === "/class-schedules")
      payload.data.forEach((r: any) => {
        r.startTime = "2099-09-15T07:00:00Z";
        r.endTime = "2099-09-15T08:00:00Z";
      });
    if (longText) {
      const expand = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        for (const [key, entry] of Object.entries(value)) {
          if (["name", "fullName"].includes(key) && typeof entry === "string")
            (value as Record<string, unknown>)[key] =
              "Hội viên với thông tin và tên lớp rất dài ".repeat(4);
          else if (key === "email" && typeof entry === "string")
            (value as Record<string, unknown>)[key] =
              "long".repeat(30) + "@example.test";
          else expand(entry);
        }
      };
      expand(payload.data);
    }
    await route.fulfill({ json: payload });
  });
}
