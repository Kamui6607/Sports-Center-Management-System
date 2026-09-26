import { test, expect } from "@playwright/test";
import { setup } from "./fixtures";

for (const width of [390, 1440]) {
  test(`chat composer and attachment remain accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await setup(page, "MEMBER");
      await page.route("**/uploads/photo.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7X8AAAAASUVORK5CYII=", "base64") }));
    const messages: object[] = [];
    await page.route("**/api/v1/chat/contacts", (route) =>
      route.fulfill({ json: { success: true, data: [] } }),
    );
    await page.route("**/api/v1/chat/conversations", (route) =>
      route.fulfill({ json: { success: true, data: [] } }),
    );
    await page.route("**/api/v1/chat/messages", async (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().headers()["content-type"]).toContain(
          "multipart/form-data",
        );
        messages.push({
          id: "file-1",
          senderId: "member",
          sender: { fullName: "Hội viên" },
          fileUrl: "/uploads/photo.png",
          createdAt: new Date().toISOString(),
        });
      }
      await route.fulfill({
        json: {
          success: true,
          data: route.request().method() === "POST" ? messages[0] : messages,
        },
      });
    });
    await page.goto("/member/membership");
    await page.getByRole("button", { name: "Mở điểm danh nhanh" }).click();
    await expect(page.getByText("Sẵn sàng cho buổi tập?")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Mở tin nhắn", exact: true })
      .click();
    const input = page.getByRole("textbox", { name: "Nội dung", exact: true });
    await expect(input).toBeInViewport();
    await page
      .getByLabel("Tệp đính kèm · tối đa 10 MB", { exact: true })
      .setInputFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from("test-image"),
      });
    await page
      .getByRole("button", { name: "Gửi tin nhắn", exact: true })
      .click();
    await expect(page.getByRole("img", { name: "Ảnh đính kèm" })).toBeVisible();
    await expect(input).toBeInViewport();
  });
}
