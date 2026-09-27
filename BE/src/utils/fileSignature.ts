import fs from "fs";

/**
 * D03 — Nhận diện MIME THẬT từ magic bytes (không tin `file.mimetype` do client khai báo).
 * Chỉ hỗ trợ allowlist hẹp dùng cho upload của hệ thống.
 */
export type AllowedFileMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

export const ALLOWED_CHAT_MIMES: readonly AllowedFileMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export const ALLOWED_AVATAR_MIMES: readonly AllowedFileMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** Đuôi file an toàn theo MIME đã xác thực (KHÔNG dùng tên/đuôi client gửi). */
export const EXT_BY_MIME: Record<AllowedFileMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Trả MIME theo signature thật của buffer, `null` nếu không thuộc allowlist. */
export function sniffMime(buf: Buffer): AllowedFileMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }
  return null;
}

/** Đọc 16 byte đầu của file trên disk để nhận diện signature thật. */
export function sniffMimeFromFile(filePath: string): AllowedFileMime | null {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(16);
      const read = fs.readSync(fd, buf, 0, 16, 0);
      return sniffMime(buf.subarray(0, read));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function isAllowedMime(mime: string | null): mime is AllowedFileMime {
  return Boolean(mime && (ALLOWED_CHAT_MIMES as readonly string[]).includes(mime));
}
