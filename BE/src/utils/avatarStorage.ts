import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

import { AppError } from "../middlewares/errorHandler.js";
import {
  avatarStorageDriver,
  cloudinaryConfig,
  type AvatarStorageDriver,
} from "../config/avatar-storage.js";

/** Thư mục lưu avatar khi dùng driver `local` (phục vụ tĩnh qua app.ts: `/uploads/...`). */
export const AVATAR_DIR = path.join("uploads", "avatars");
const AVATAR_URL_MARKER = "/uploads/avatars/";

/** Phần mở rộng suy từ MIME (KHÔNG lấy từ tên file client gửi lên — tránh lưu đuôi lạ vào static dir). */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// Log driver ngay khi khởi động để dễ đối chiếu trên server (Render logs).
try {
  const driver = avatarStorageDriver();
  console.log(
    `[avatarStorage] driver = ${driver}` +
      (driver === "cloudinary" ? ` (folder: ${cloudinaryConfig().folder})` : " (uploads/avatars)")
  );
} catch (err) {
  console.warn(`[avatarStorage] ${(err as Error).message}`);
}

function resolveDriver(): AvatarStorageDriver {
  try {
    return avatarStorageDriver();
  } catch (err) {
    // Lỗi cấu hình (VD AVATAR_STORAGE=cloudinary nhưng thiếu credentials) => trả message rõ thay vì 500 chung chung.
    throw new AppError((err as Error).message, 500);
  }
}

/** Driver đang hoạt động — dùng cho log/test. */
export function currentAvatarStorageDriver(): AvatarStorageDriver {
  return resolveDriver();
}

/**
 * Lưu ảnh avatar (buffer từ multer memoryStorage) và trả URL công khai.
 * - `cloudinary`: upload lên Cloudinary, resize 512x512 (crop fill, gravity auto), nén q_auto/f_auto.
 *   `public_id = <userId>` cố định ⇒ upload lại GHI ĐÈ ảnh cũ (không rác, không cần xoá).
 * - `local`: ghi `uploads/avatars/avatar-<timestamp>-<rand>.<ext>` và trả URL tuyệt đối theo host của request.
 */
export async function storeAvatarImage(
  file: Express.Multer.File,
  options: { ownerId: string; publicBaseUrl: string }
): Promise<string> {
  return resolveDriver() === "cloudinary"
    ? uploadToCloudinary(file, options.ownerId)
    : saveLocalAvatar(file, options.publicBaseUrl);
}

/** Cloudinary SDK có thể reject bằng object `{ error: { message } }` / lỗi mạng — luôn trích ra được message. */
export function cloudinaryErrorDetail(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  const anyErr = err as any;
  const message = anyErr?.error?.message ?? anyErr?.message ?? anyErr?.error ?? anyErr?.statusText;
  if (typeof message === "string" && message) return message;

  try {
    const json = JSON.stringify(err);
    if (json && json !== "{}") return json;
  } catch {
    /* ignore */
  }
  return String(err);
}

async function uploadToCloudinary(file: Express.Multer.File, ownerId: string): Promise<string> {
  const cfg = cloudinaryConfig();
  cloudinary.config({
    cloud_name: cfg.cloudName,
    api_key: cfg.apiKey,
    api_secret: cfg.apiSecret,
    secure: true,
  });

  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: cfg.folder,
      public_id: ownerId,
      overwrite: true,
      invalidate: true, // xoá cache CDN để avatar mới hiển thị ngay
      resource_type: "image",
      transformation: [{ width: 512, height: 512, crop: "fill", gravity: "auto" }],
      quality: "auto",
      fetch_format: "auto",
    });
    if (!result.secure_url) throw new Error("Cloudinary response is missing secure_url");
    return result.secure_url;
  } catch (err) {
    const detail = cloudinaryErrorDetail(err);
    // "Invalid Signature" = api_secret không khớp api_key/cloud_name ⇒ gợi ý kiểm tra credentials.
    const hint = /invalid signature/i.test(detail)
      ? " — kiểm tra CLOUDINARY_API_SECRET có khớp CLOUDINARY_API_KEY / CLOUDINARY_CLOUD_NAME không" +
        " (copy lại từ Cloudinary Console → Settings → API Keys)"
      : /cloud_name/i.test(detail)
        ? " — CLOUDINARY_CLOUD_NAME sai: copy đúng \"Cloud name\" tại Cloudinary Console → Settings → API Keys" +
          " (chuỗi chữ thường/số, KHÁC display name hiển thị ở góc trên Console)"
        : "";
    throw new AppError(`Avatar upload to Cloudinary failed: ${detail}${hint}`, 502);
  }
}

async function saveLocalAvatar(file: Express.Multer.File, publicBaseUrl: string): Promise<string> {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });

  const ext = MIME_EXT[file.mimetype] ?? ".img";
  const filename = `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, filename), file.buffer);

  return `${publicBaseUrl}${AVATAR_URL_MARKER}${filename}`;
}

/**
 * Xoá avatar CŨ sau khi user đổi ảnh mới (best-effort, không throw).
 * Chỉ xoá file local trong `uploads/avatars/` — URL Cloudinary giữ nguyên vì `public_id` cố định
 * theo user (lần upload mới đã ghi đè chính asset đó, xoá sẽ làm mất ảnh vừa đổi).
 */
export function removeStoredAvatar(avatarUrl: string | null): void {
  if (!avatarUrl) return;

  const markerIndex = avatarUrl.indexOf(AVATAR_URL_MARKER);
  if (markerIndex === -1) return;

  const filename = path.basename(avatarUrl.slice(markerIndex + AVATAR_URL_MARKER.length));
  if (!filename) return;

  fs.promises.unlink(path.join(AVATAR_DIR, filename)).catch(() => {});
}
