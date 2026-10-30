import { sepayConfig } from "../../config/sepay.js";

/**
 * Client tối giản cho SePay API v2 (docs: developer.sepay.vn → SePay API / v2 / Giao dịch).
 *
 * Dùng cho ĐỐI SOÁT CHỦ ĐỘNG khi webhook không tới được BE:
 *   GET {apiBaseUrl}/transactions?q=<mã đơn>&transfer_type=in
 *       &transaction_date_from=<YYYY-MM-DD HH:mm:ss>&transaction_date_to=…
 *   Authorization: Bearer <SEPAY_API_TOKEN>
 *
 * Lưu ý:
 * - `id` của API là **UUID** (khác `id` số nguyên trong payload webhook) ⇒ chống trùng khi
 *   chốt đơn dựa trên `Payment.status` + advisory lock ở sepay-payments.service.ts.
 * - Token tạo ở my.sepay.vn → Cấu hình Công ty → API Access. Token của **Test mode** chỉ chạy
 *   với `SEPAY_API_BASE_URL="https://userapi-sandbox.sepay.vn/v2"`.
 * - SePay giới hạn 3 request/giây ⇒ caller phải throttle (xem `reconcileMinSeconds`).
 */
export interface SepayApiTransaction {
  /** UUID giao dịch phía SePay. */
  id: string;
  transaction_date?: string | null;
  account_number?: string | null;
  /** Số tài khoản ảo (nếu giao dịch qua VA). */
  va?: string | null;
  transfer_type?: string | null;
  amount_in?: number | null;
  amount_out?: number | null;
  accumulated?: number | null;
  transaction_content?: string | null;
  reference_number?: string | null;
  /** Mã thanh toán SePay bóc tách được (VD SEVQR12345678). */
  code?: string | null;
  bank_brand_name?: string | null;
}

/** Timeout HTTP tới SePay API — không để request polling của FE bị treo lâu. */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Tìm giao dịch tiền vào có chứa `code` trong reference_number/transaction_content/code.
 * Ném lỗi khi HTTP không OK hoặc body không phải JSON — caller tự quyết định bỏ qua.
 */
export async function fetchSepayTransactionsByCode(params: {
  code: string;
  /** Định dạng `YYYY-MM-DD HH:mm:ss` theo giờ Việt Nam (UTC+7) — giống payload SePay. */
  fromVnDateTime: string;
  toVnDateTime: string;
  limit?: number;
}): Promise<SepayApiTransaction[]> {
  const cfg = sepayConfig();
  if (!cfg.apiToken) return [];

  const url = new URL(`${cfg.apiBaseUrl}/transactions`);
  url.searchParams.set("q", params.code);
  url.searchParams.set("transfer_type", "in");
  url.searchParams.set("transaction_date_from", params.fromVnDateTime);
  url.searchParams.set("transaction_date_to", params.toVnDateTime);
  url.searchParams.set("per_page", String(params.limit ?? 50));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`SePay API ${res.status}: ${text.slice(0, 300)}`);
    const payload = text ? (JSON.parse(text) as { data?: unknown }) : {};
    return Array.isArray(payload.data) ? (payload.data as SepayApiTransaction[]) : [];
  } finally {
    clearTimeout(timer);
  }
}
