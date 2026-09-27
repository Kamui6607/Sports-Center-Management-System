/**
 * Kiểm tra cấu hình Cloudinary dùng cho upload avatar (chạy tay, KHÔNG cần BE đang chạy):
 *
 *   npm run test:cloudinary:check
 *
 * - In cấu hình đang đọc từ .env/env (che bớt key/secret) để phát hiện các lỗi "dán nhầm" phổ biến:
 *   dán API Key vào ô Secret, dán kèm dấu ngoặc kép khi set env trên Render, sai cloud name...
 * - Gọi `api.usage()` (request CÓ KÝ) => xác thực credentials thật với Cloudinary.
 * - Upload thử 1 ảnh PNG 1x1 vào đúng folder avatar rồi xoá — mô phỏng luồng POST /auth/me/avatar.
 */
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfig, isCloudinaryConfigured } from "../src/config/avatar-storage.js";
import { cloudinaryErrorDetail } from "../src/utils/avatarStorage.js";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function mask(value: string): string {
  if (!value) return "(trống)";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)} (dài ${value.length})`;
}

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

async function main() {
  const cfg = cloudinaryConfig();

  console.log("── Cấu hình Cloudinary đang đọc ──");
  console.log("CLOUDINARY_CLOUD_NAME :", cfg.cloudName || "(trống)");
  console.log("CLOUDINARY_API_KEY    :", mask(cfg.apiKey));
  console.log("CLOUDINARY_API_SECRET :", mask(cfg.apiSecret));
  console.log("CLOUDINARY_FOLDER     :", cfg.folder);

  if (!isCloudinaryConfigured()) {
    console.log("\nℹ️  Chưa đủ 3 biến CLOUDINARY_* ⇒ avatar sẽ lưu LOCAL (uploads/avatars). Không có gì để kiểm tra.");
    return;
  }

  // Kiểm tra các lỗi "dán nhầm" trước khi gọi API để báo rõ nguyên nhân.
  if (cfg.apiKey === cfg.apiSecret) {
    fail(
      "CLOUDINARY_API_SECRET đang TRÙNG CLOUDINARY_API_KEY.\n" +
        "   API Secret là chuỗi ~27 ký tự chữ + số, KHÁC API Key (15 chữ số).\n" +
        "   Lấy lại tại Cloudinary Dashboard → Product Environment Credentials → API Secret (bấm reveal/copy)."
    );
  }
  if (!/^\d{15}$/.test(cfg.apiKey)) {
    console.warn("⚠️  CLOUDINARY_API_KEY thường là 15 chữ số — kiểm tra lại.");
  }
  if (cfg.apiSecret.length < 20) {
    console.warn("⚠️  CLOUDINARY_API_SECRET thường dài ~27 ký tự — kiểm tra lại.");
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(cfg.cloudName)) {
    console.warn(
      `⚠️  Cloud name "${cfg.cloudName}" không đúng dạng thường thấy (chữ thường/số/-/_) —` +
        " copy đúng \"Cloud name\" tại Cloudinary Console → Settings → API Keys."
    );
  }

  cloudinary.config({
    cloud_name: cfg.cloudName,
    api_key: cfg.apiKey,
    api_secret: cfg.apiSecret,
    secure: true,
  });

  console.log("\n── 1) Gọi API có ký (api.usage) để xác thực credentials ──");
  try {
    const usage: any = await cloudinary.api.usage();
    console.log("✅ Credentials hợp lệ. Plan:", usage?.plan ?? "?");
    if (usage?.storage) {
      console.log("   Storage đang dùng:", usage.storage.usage ?? "?", "/ hạn mức:", usage.storage.limit ?? "?");
    }
  } catch (err) {
    const detail = cloudinaryErrorDetail(err);
    const hint = /cloud_name/i.test(detail)
      ? "\n   ⇒ CLOUDINARY_CLOUD_NAME đang SAI. Mở Cloudinary Console → Settings (bánh răng) → API Keys" +
        "\n     để copy đúng \"Cloud name\" (chuỗi chữ thường/số, KHÁC display name như \"Root\" hiển thị góc trên Console)."
      : /invalid signature/i.test(detail)
        ? "\n   ⇒ API Secret không khớp API Key / Cloud name. Copy lại cả 3 giá trị từ Console → Settings → API Keys."
        : "";
    fail(`api.usage() thất bại: ${detail}${hint}`);
  }

  console.log("\n── 2) Upload thử 1 ảnh 1x1 rồi xoá ──");
  const publicId = `connectivity-check-${Date.now()}`;
  try {
    const uploaded = await cloudinary.uploader.upload(`data:image/png;base64,${PNG_1x1}`, {
      folder: cfg.folder,
      public_id: publicId,
      resource_type: "image",
      overwrite: true,
    });
    console.log("✅ Upload OK:", uploaded.secure_url);

    const removed = await cloudinary.uploader.destroy(`${cfg.folder}/${publicId}`);
    console.log("✅ Đã xoá ảnh test:", removed.result);
    console.log("\n🎉 Cloudinary sẵn sàng cho POST /api/v1/auth/me/avatar");
  } catch (err) {
    fail(`Upload test thất bại: ${cloudinaryErrorDetail(err)}`);
  }
}

main().catch((err) => fail(cloudinaryErrorDetail(err)));
