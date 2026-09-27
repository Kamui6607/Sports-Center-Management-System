import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";
import {
  ALLOWED_AVATAR_MIMES,
  ALLOWED_CHAT_MIMES,
  EXT_BY_MIME,
  sniffMime,
  type AllowedFileMime,
} from "../utils/fileSignature.js";

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

/** D03: file chat lưu riêng trong `uploads/chat` và KHÔNG được phục vụ tĩnh (chỉ tải qua API có auth). */
export const CHAT_UPLOAD_DIR = path.join(uploadDir, "chat");
fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── D03: Chat attachment upload ────────────────────────────
// - Chỉ nhận jpeg/png/webp/gif/pdf (mimetype); chữ ký THẬT được kiểm tra sau khi ghi (controller).
// - Tên file do server sinh theo MIME (không dùng tên/đuôi client) ⇒ tránh path/extension injection.
export const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHAT_UPLOAD_DIR),
    filename: (_req, file, cb) =>
      cb(null, `${randomUUID()}${EXT_BY_MIME[file.mimetype as AllowedFileMime] ?? ""}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!(ALLOWED_CHAT_MIMES as readonly string[]).includes(file.mimetype)) {
      cb(new AppError("Tệp đính kèm phải là ảnh (jpeg/png/webp/gif) hoặc PDF.", 400));
      return;
    }
    cb(null, true);
  },
});

/** Middleware upload file chat — dịch lỗi Multer (quá lớn, sai field) thành AppError 400. */
export function chatUploadSingle(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    chatUpload.single(field)(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof AppError) return next(err);
      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "Tệp đính kèm tối đa 10MB."
            : `Tải tệp thất bại: ${err.message}`;
        return next(new AppError(message, 400));
      }
      return next(err as Error);
    });
  };
}

// ── Avatar upload (profile) ────────────────────────────────
// Giữ file trong RAM (<= 5MB) rồi để utils/avatarStorage quyết định đích:
//   - local      => ghi `uploads/avatars/`
//   - cloudinary => đẩy thẳng buffer lên Cloudinary (không ghi disk)
const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const avatarMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError("Avatar must be an image (jpeg, png, webp or gif)", 400));
      return;
    }
    cb(null, true);
  },
});

/**
 * Middleware upload avatar cho profile — multipart/form-data, field name: `avatar`.
 * Bọc `avatarMulter.single` để dịch lỗi Multer (file quá lớn, sai field, ...) thành
 * AppError 400 => errorHandler trả JSON thống nhất thay vì 500.
 */
export function avatarUpload(req: Request, res: Response, next: NextFunction) {
  avatarMulter.single("avatar")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof AppError) return next(err);
      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "Avatar image must be at most 5MB"
            : `Avatar upload failed: ${err.message}`;
        return next(new AppError(message, 400));
      }
      return next(err as Error);
    }
    // D03: kiểm tra chữ ký THẬT của ảnh (không tin mimetype/đuôi do client khai báo).
    const file = (req as Request & { file?: { buffer: Buffer } }).file;
    if (file) {
      const sniffed = sniffMime(file.buffer);
      if (!sniffed || !(ALLOWED_AVATAR_MIMES as readonly string[]).includes(sniffed)) {
        return next(new AppError("Avatar image content is invalid (jpeg, png, webp or gif)", 400));
      }
    }
    return next();
  });
}

export const CV_UPLOAD_DIR = path.join(uploadDir, "cvs");
if (!fs.existsSync(CV_UPLOAD_DIR)) {
  fs.mkdirSync(CV_UPLOAD_DIR, { recursive: true });
}

export const cvMulter = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CV_UPLOAD_DIR),
    filename: (_req, _file, cb) => {
      cb(null, `${randomUUID()}.pdf`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new AppError("CV must be a PDF file.", 400));
      return;
    }
    cb(null, true);
  },
});

export function cvUpload(req: Request, res: Response, next: NextFunction) {
  cvMulter.single("cv")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof AppError) return next(err);
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "CV must be at most 10MB." : `Upload failed: ${err.message}`;
      return next(new AppError(message, 400));
    }
    return next(err as Error);
  });
}