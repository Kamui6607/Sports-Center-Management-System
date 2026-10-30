/**
 * Cấu hình nơi lưu ảnh avatar (profile): local disk hoặc Cloudinary.
 *
 * - Không cấu hình gì => `local` (lưu `uploads/avatars/`, phục vụ qua `/uploads/...`) — dev chạy được ngay.
 * - Điền đủ 3 biến `CLOUDINARY_*` => tự động dùng `cloudinary` (ảnh resize 512x512, nén q_auto/f_auto;
 *   `public_id = userId` nên upload lại chỉ GHI ĐÈ, không sinh rác, không cần xoá ảnh cũ).
 * - `AVATAR_STORAGE="local" | "cloudinary"` để chỉ định tường minh (bỏ qua auto-detect).
 *
 * Đọc env ĐỘNG (mỗi lần gọi) giống `sepayConfig()` để app vẫn boot được khi chưa cấu hình cloud.
 */
export type AvatarStorageDriver = "local" | "cloudinary";

/** Đọc env an toàn: trim + bỏ dấu ngoặc kép bao quanh (hay bị dán kèm khi set env trên Render/Uptime). */
function readEnv(name: string): string {
  return (process.env[name] ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

export function cloudinaryConfig() {
  const fromUrl = cloudinaryUrlConfig();
  return {
    cloudName: readEnv("CLOUDINARY_CLOUD_NAME") || fromUrl?.cloudName || "",
    apiKey: readEnv("CLOUDINARY_API_KEY") || fromUrl?.apiKey || "",
    apiSecret: readEnv("CLOUDINARY_API_SECRET") || fromUrl?.apiSecret || "",
    /** Thư mục chứa avatar trên Cloudinary. */
    folder: readEnv("CLOUDINARY_FOLDER") || "sports-center/avatars",
  };
}

/**
 * Hỗ trợ cách nhập NHANH của Cloudinary: dán nguyên 1 dòng "API environment variable" trên Dashboard
 * (dạng `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`) — dùng khi các biến rời chưa điền.
 */
export function cloudinaryUrlConfig(): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const raw = readEnv("CLOUDINARY_URL");
  if (!raw) return null;

  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(raw);
  if (!match) return null;

  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3].replace(/\/+$/, "") };
}

export function isCloudinaryConfigured(cfg = cloudinaryConfig()): boolean {
  return Boolean(cfg.cloudName && cfg.apiKey && cfg.apiSecret);
}

/**
 * Chặn trước lỗi "dán nhầm" phổ biến để trả message dễ hiểu thay vì lỗi `Invalid Signature` khó đoán của Cloudinary:
 * API Secret KHÔNG BAO GIỜ trùng API Key (Key = 15 chữ số; Secret = chuỗi ~27 ký tự chữ + số).
 */
export function assertCloudinaryCredentials(cfg = cloudinaryConfig()): void {
  if (cfg.apiKey === cfg.apiSecret) {
    throw new Error(
      "CLOUDINARY_API_SECRET is the same as CLOUDINARY_API_KEY — copy the real API Secret (~27 chars) from " +
        "Cloudinary Dashboard → Product Environment Credentials"
    );
  }
}

/** Driver đang dùng: theo `AVATAR_STORAGE` tường minh, hoặc auto (có đủ credentials Cloudinary => cloudinary). */
export function avatarStorageDriver(): AvatarStorageDriver {
  const explicit = (process.env.AVATAR_STORAGE ?? "").trim().toLowerCase();

  if (explicit === "local") return "local";
  if (explicit === "cloudinary") {
    if (!isCloudinaryConfigured()) {
      throw new Error(
        "AVATAR_STORAGE=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET"
      );
    }
    assertCloudinaryCredentials();
    return "cloudinary";
  }
  if (explicit) {
    throw new Error(`AVATAR_STORAGE không hợp lệ: "${explicit}" (chỉ nhận "local" hoặc "cloudinary")`);
  }

  if (!isCloudinaryConfigured()) return "local";
  assertCloudinaryCredentials();
  return "cloudinary";
}
