import crypto from "node:crypto";
import { env } from "../../config/env.js";

/**
 * Mã nhận hàng tại quầy (Doc/SHOP_FLOW_DESIGN.md §5, D6).
 *
 * - Mã 8 ký tự từ bảng 32 ký tự dễ đọc (bỏ 0/O/1/I) ≈ 40 bit, sinh từ HMAC(secret, `pickup:<orderId>:<nonce>`)
 *   với `nonce` ngẫu nhiên (crypto) ⇒ không đoán được, mỗi lần "sẵn sàng nhận" là một mã mới.
 * - DB chỉ lưu `SHA-256(mã)` (`Order.pickupCodeHash`, UNIQUE) + `nonce`; chủ đơn xem lại mã bằng cách tính lại HMAC
 *   ⇒ lộ DB không lộ mã (cần thêm secret của server).
 * - QR chứa `SCMS-PICKUP:<mã đơn>:<mã nhận hàng>`; Manager có thể nhập tay riêng mã nhận hàng.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 ký tự ⇒ byte % 32 không lệch phân phối.
export const PICKUP_QR_PREFIX = "SCMS-PICKUP";

function secret(): string {
  return process.env.SHOP_PICKUP_SECRET?.trim() || env.JWT_ACCESS_SECRET;
}

export function newPickupNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function pickupCodeFor(orderId: string, nonce: string): string {
  const digest = crypto.createHmac("sha256", secret()).update(`pickup:${orderId}:${nonce}`).digest();
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[digest[i] % 32];
  return code;
}

/** Chuẩn hoá mã nhập tay (bỏ khoảng trắng/gạch, in hoa). */
export function normalizePickupCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function hashPickupCode(code: string): string {
  return crypto.createHash("sha256").update(normalizePickupCode(code)).digest("hex");
}

export function pickupQrPayload(orderCode: string, code: string): string {
  return `${PICKUP_QR_PREFIX}:${orderCode}:${code}`;
}

/** Tách nội dung quét/nhập: QR đầy đủ hoặc chỉ mã nhận hàng. */
export function parsePickupInput(raw: string): { orderCode: string | null; code: string } {
  const trimmed = raw.trim();
  const parts = trimmed.split(":");
  if (parts.length === 3 && parts[0].toUpperCase() === PICKUP_QR_PREFIX) {
    return { orderCode: parts[1].trim().toUpperCase(), code: normalizePickupCode(parts[2]) };
  }
  return { orderCode: null, code: normalizePickupCode(trimmed) };
}

/** Che SĐT để đối chiếu: 0901234567 ⇒ ******4567. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? digits : `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function phoneLast4(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-4);
}
