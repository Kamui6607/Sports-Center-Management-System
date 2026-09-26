import crypto from "node:crypto";

/**
 * Cấu hình thanh toán ONLINE qua SePay (ảnh VietQR + webhook xác nhận chuyển khoản).
 *
 * Đọc env ĐỘNG (mỗi lần gọi) thay vì chốt lúc import để:
 * - app vẫn boot được khi chưa cấu hình SePay (dev/test),
 * - e2e test có thể bật/tắt từng chế độ (mock, bank tài khoản test) giữa các kịch bản.
 *
 * `isSepayConfigured() = false` ⇒ endpoint checkout trả 503 (không tạo giao dịch).
 * `isSepayWebhookConfigured() = false` ⇒ endpoint webhook trả 503 (SePay sẽ retry khi cấu hình xong).
 * `mockMode = true` (chỉ DEV/DEMO/E2E) ⇒ cho phép `POST /payments/sepay/mock-confirm`
 * mô phỏng giao dịch chuyển khoản thành công mà không cần tiền thật.
 * `apiToken` (SEPAY_API_TOKEN) ⇒ bật ĐỐI SOÁT CHỦ ĐỘNG qua SePay API v2: khi FE polling
 * `GET /payments/sepay/{id}` mà đơn còn PENDING, BE tự tìm giao dịch khớp mã đơn để chốt.
 * Dùng cho môi trường webhook không tới được server (BE chạy localhost, server downtime,
 * SePay đã hết 7 lần retry trong ~33 phút) — xem sepay-api.client.ts.
 *
 * Lưu ý cấu hình trên my.sepay.vn (Cấu hình Công ty → Cấu trúc mã thanh toán):
 * - Tiền tố = `SEPAY_CODE_PREFIX` (mặc định SEVQR — cũng là chuỗi VietinBank yêu cầu trong nội dung),
 * - Hậu tố = `SEPAY_CODE_SUFFIX_LENGTH` ký tự, Loại ký tự = Số nguyên.
 * - Webhook: chọn 1 trong 4 phương thức xác thực (docs SePay):
 *   + API Key → header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`;
 *   + HMAC-SHA256 (khuyến nghị) → header `X-SePay-Signature: sha256={hex}` +
 *     `X-SePay-Timestamp`, ký trên `{timestamp}.{rawBody}` bằng `SEPAY_WEBHOOK_SECRET`;
 *   + (None / OAuth 2.0 chưa hỗ trợ trong BE này).
 *   Cả 2 biến cùng cấu hình ⇒ request có chữ ký HMAC thì verify HMAC, không có thì verify API Key.
 */
export function sepayConfig() {
  return {
    /** Ngân hàng nhận tiền — short_name / alias / code / BIN trong banks.json của SePay (VD "Sacombank"). */
    bankId: (process.env.VIETQR_BANK_ID ?? "").trim(),
    /** Số tài khoản nhận tiền (hoặc số VA) dùng để tạo QR và đối chiếu webhook. */
    accountNo: (process.env.VIETQR_ACCOUNT_NO ?? "").trim(),
    /** Tên chủ tài khoản hiển thị trên ảnh QR (viết không dấu). */
    accountHolder: (process.env.VIETQR_ACCOUNT_NAME ?? "").trim(),
    /** API key (phương thức API Key) đã cấu hình ở webhook trên my.sepay.vn. */
    webhookApiKey: (process.env.SEPAY_WEBHOOK_API_KEY ?? "").trim(),
    /** Secret key (phương thức HMAC-SHA256) đã cấu hình ở webhook trên my.sepay.vn. */
    webhookSecret: (process.env.SEPAY_WEBHOOK_SECRET ?? "").trim(),
    /** Dịch vụ tạo ảnh QR động của SePay. */
    qrBaseUrl: process.env.SEPAY_QR_BASE_URL?.trim() || "https://qr.sepay.vn/img",
    /** Kiểu hiển thị ảnh QR: compact | qronly | standee | (trống = QR chuẩn kèm logo VietQR). */
    qrTemplate: (process.env.SEPAY_QR_TEMPLATE ?? "compact").trim(),
    /** Tiền tố mã thanh toán — phải khớp "Cấu trúc mã thanh toán" trên my.sepay.vn (2-5 ký tự). */
    codePrefix: ((process.env.SEPAY_CODE_PREFIX ?? "").trim() || "SEVQR").toUpperCase(),
    /** Độ dài phần hậu tố số của mã thanh toán (SePay khuyến nghị 6-8). */
    codeSuffixLength: clamp(Number(process.env.SEPAY_CODE_SUFFIX_LENGTH ?? 8) || 8, 4, 20),
    /** Thời gian sống của một giao dịch chờ thanh toán (phút). */
    ttlMinutes: Math.max(1, Number(process.env.VIETQR_PAYMENT_TTL_MINUTES ?? 15) || 15),
    /** Chỉ DEV/DEMO/E2E: cho phép mô phỏng giao dịch qua `/payments/sepay/mock-confirm`. */
    mockMode: (process.env.SEPAY_MOCK_MODE ?? "false").trim() === "true",
    /**
     * Token Bearer của SePay API v2 (my.sepay.vn → Cấu hình Công ty → API Access).
     * Có token ⇒ BE đối soát chủ động khi đơn còn PENDING mà webhook không tới được.
     */
    apiToken: (process.env.SEPAY_API_TOKEN ?? "").trim(),
    /** Base URL SePay API v2; Test mode dùng `https://userapi-sandbox.sepay.vn/v2` với token riêng. */
    apiBaseUrl:
      (process.env.SEPAY_API_BASE_URL ?? "").trim().replace(/\/+$/, "") ||
      "https://userapi.sepay.vn/v2",
    /** Khoảng cách tối thiểu (giây) giữa 2 lần đối soát cho CÙNG một đơn — tránh spam API (SePay giới hạn 3 req/s). */
    reconcileMinSeconds: clamp(Number(process.env.SEPAY_RECONCILE_MIN_SECONDS ?? 5) || 5, 1, 300),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Checkout cần tài khoản nhận tiền để dựng ảnh VietQR. */
export function isSepayConfigured(): boolean {
  const cfg = sepayConfig();
  return Boolean(cfg.bankId && cfg.accountNo);
}

/** Webhook cần ít nhất 1 credentials (API Key hoặc HMAC secret) để xác thực request từ SePay. */
export function isSepayWebhookConfigured(): boolean {
  const cfg = sepayConfig();
  return Boolean(cfg.webhookApiKey || cfg.webhookSecret);
}

/**
 * Có API token ⇒ FE polling `GET /payments/sepay/{id}` sẽ kích hoạt đối soát chủ động
 * (tìm giao dịch khớp mã đơn qua SePay API v2 để chốt đơn khi webhook không tới được server).
 */
export function isSepayApiConfigured(): boolean {
  return Boolean(sepayConfig().apiToken);
}

/** Bỏ dấu tiếng Việt (một số ảnh QR/ngân hàng không nhận ký tự có dấu). */
export function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Chuẩn hoá số tài khoản/VA để so khớp webhook (bỏ khoảng trắng, dấu chấm, gạch ngang…). */
export function normalizeBankAccount(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

/**
 * Sinh mã thanh toán riêng cho một đơn: `<tiền tố><hậu tố số>` (VD SEVQR12345678).
 * Phần hậu tố dùng số để khớp cấu hình mặc định "Loại ký tự = Số nguyên" của SePay.
 * Tính duy nhất được bảo đảm bởi UNIQUE `Payment.transactionCode` (caller retry khi trùng).
 */
export function buildSepayPaymentCode(cfg = sepayConfig()): string {
  let suffix = "";
  for (let i = 0; i < cfg.codeSuffixLength; i++) {
    suffix += crypto.randomInt(0, 10).toString();
  }
  return `${cfg.codePrefix}${suffix}`;
}

/** Link ảnh VietQR động (số tài khoản + số tiền + nội dung CK) do SePay cung cấp. */
export function buildVietQrUrl(params: { amount: number; content: string }): string {
  const cfg = sepayConfig();
  const url = new URL(cfg.qrBaseUrl);
  url.searchParams.set("acc", cfg.accountNo);
  url.searchParams.set("bank", cfg.bankId);
  url.searchParams.set("amount", String(params.amount));
  url.searchParams.set("des", params.content);
  if (cfg.qrTemplate) url.searchParams.set("template", cfg.qrTemplate);
  if (cfg.accountHolder) url.searchParams.set("holder", stripDiacritics(cfg.accountHolder));
  return url.toString();
}

/**
 * Khi webhook KHÔNG có `code` (SePay chưa bóc tách được), tự tìm mã thanh toán trong
 * nội dung chuyển khoản theo tiền tố đã cấu hình.
 */
export function extractPaymentCodeFromContent(
  content: string | null | undefined,
  cfg = sepayConfig()
): string | null {
  if (!content) return null;
  const escaped = cfg.codePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}[0-9A-Za-z]{4,32}`, "i").exec(content);
  return match ? match[0].toUpperCase() : null;
}

/** So khớp API key webhook theo kiểu timing-safe (header chuẩn: `Authorization: Apikey <key>`). */
export function verifySepayApiKey(authHeader: string | undefined, expected: string): boolean {
  if (!authHeader || !expected) return false;
  const match = /^apikey\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;
  const received = match[1].trim();
  const bufA = Buffer.from(received, "utf8");
  const bufB = Buffer.from(expected, "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Xác thực chữ ký HMAC-SHA256 theo docs SePay:
 * - Header `X-SePay-Signature: sha256={hex_hash}` (hex, không phân biệt hoa thường).
 * - Header `X-SePay-Timestamp` = unix seconds khi ký.
 * - HMAC-SHA256(secret, `{timestamp}.{rawBody}`) — ký trên **raw bytes** của body,
 *   KHÔNG phải JSON đã parse rồi stringify lại (key order/whitespace/unicode khác sẽ lệch).
 * - So khớp timing-safe.
 */
export function verifySepayHmacSignature(params: {
  secret: string;
  rawBody: Buffer | string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
}): boolean {
  const { secret, rawBody, signature, timestamp } = params;
  if (!secret || rawBody === undefined || !signature || !timestamp) return false;
  if (!/^\d+$/.test(timestamp.trim())) return false;
  const cleanSignature = signature.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(cleanSignature)) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp.trim()}.`)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(cleanSignature.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
