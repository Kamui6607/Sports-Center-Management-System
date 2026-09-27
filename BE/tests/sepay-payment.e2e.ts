/**
 * E2E THẬT (HTTP + PostgreSQL) cho thanh toán ONLINE qua SePay (chuyển khoản VietQR):
 * - `POST /payments/sepay/checkout`     → Member tạo đơn PENDING + mã thanh toán + ảnh QR.
 * - `POST /payments/sepay/webhook`      → SePay xác nhận giao dịch (API key) ⇒ kích hoạt gói + invoice.
 * - `GET  /payments/sepay/{id}`         → FE polling trạng thái (PENDING → SUCCESS).
 * - `POST /payments/sepay/mock-confirm` → DEV/DEMO (SEPAY_MOCK_MODE=true).
 *
 * Chạy: cd BE && npm run test:e2e:sepay   (hoặc: npx tsx tests/sepay-payment.e2e.ts)
 *
 * Điểm đáng chú ý: SePay KHÔNG có API outbound (BE chỉ dựng URL ảnh VietQR + nhận webhook),
 * nên suite test trực tiếp các nhánh webhook: sai API key / mã đơn lạ / tiền ra / lệch tài khoản /
 * lệch số tiền / hợp lệ / webhook lặp / tiền về muộn / mock-confirm.
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";
import { ensureActiveFreeSubscription } from "../src/modules/subscriptions/free-subscription.service.js";
import {
  enqueueNotification,
  flushNotificationOutbox,
} from "../src/modules/notifications/outbox.service.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eSepay!2026";
const DAY = 24 * 60 * 60 * 1000;
const SEPAY_PENDING_CODE = "SEPAY_PAYMENT_PENDING";

const E2E_SEPAY = {
  bankId: "Sacombank",
  accountNo: "0703339186",
  accountHolder: "NGUYEN TRAN TU",
  apiKey: "e2e_sepay_api_key_1234567890",
  /** Secret key cho phương thức HMAC-SHA256 (SEPAY_WEBHOOK_SECRET). */
  hmacSecret: "whsec_e2e_sepay_hmac_secret_1234567890",
  prefix: "SEVQR",
  suffixLength: 8,
};

let baseUrl = "";

type HttpResult = { status: number; body: any; text: string };

async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    // raw: gửi đúng chuỗi bytes đã ký HMAC (không JSON.stringify lại — sẽ lệch chữ ký).
    body:
      opts.raw !== undefined
        ? opts.raw
        : opts.body === undefined
          ? undefined
          : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Report helpers ───────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function safe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function check(name: string, condition: boolean, detail?: unknown): boolean {
  if (condition) {
    passed++;
    console.log(`  [OK]   ${name}`);
  } else {
    const msg = `${name}${detail === undefined ? "" : ` — ${safe(detail)}`}`;
    failures.push(msg);
    console.log(`  [FAIL] ${msg}`);
  }
  return condition;
}

/**
 * Đặt biến môi trường SePay cho từng kịch bản (config đọc env động).
 * `configured: false` ⇒ bỏ cấu hình tài khoản nhận tiền để test nhánh 503.
 * `apiToken` mặc định rỗng ⇒ tắt đối soát chủ động, tránh gọi ra SePay API thật khi chạy test.
 */
function setSepayEnv(opts: {
  configured?: boolean;
  webhookKey?: string;
  webhookSecret?: string;
  mock?: boolean;
  ttlMinutes?: number;
  apiToken?: string;
  apiBaseUrl?: string;
}): void {
  const {
    configured = true,
    webhookKey = E2E_SEPAY.apiKey,
    // Mặc định XÓA secret để test API Key không phụ thuộc SEPAY_WEBHOOK_SECRET ngoài .env.
    webhookSecret = "",
    mock = false,
    ttlMinutes,
    apiToken = "",
    apiBaseUrl = "https://userapi.sepay.vn/v2",
  } = opts;
  process.env.VIETQR_BANK_ID = configured ? E2E_SEPAY.bankId : "";
  process.env.VIETQR_ACCOUNT_NO = configured ? E2E_SEPAY.accountNo : "";
  process.env.VIETQR_ACCOUNT_NAME = E2E_SEPAY.accountHolder;
  process.env.SEPAY_WEBHOOK_API_KEY = webhookKey;
  process.env.SEPAY_WEBHOOK_SECRET = webhookSecret;
  process.env.SEPAY_CODE_PREFIX = E2E_SEPAY.prefix;
  process.env.SEPAY_CODE_SUFFIX_LENGTH = String(E2E_SEPAY.suffixLength);
  process.env.SEPAY_MOCK_MODE = mock ? "true" : "false";
  process.env.SEPAY_QR_TEMPLATE = "compact";
  process.env.VIETQR_PAYMENT_TTL_MINUTES = String(ttlMinutes ?? 15);
  process.env.SEPAY_API_TOKEN = apiToken;
  process.env.SEPAY_API_BASE_URL = apiBaseUrl;
  process.env.SEPAY_RECONCILE_MIN_SECONDS = "5";
}

// ─── Fixtures ─────────────────────────────────────────────────────────────
const created = {
  userIds: [] as string[],
  memberProfileIds: [] as string[],
  planIds: [] as string[],
};

type FixtureUser = { id: string; email: string; token: string; memberProfileId: string };

async function createUser(
  role: "MEMBER" | "COACH" | "STAFF" | "MANAGER",
  tag: string,
  hashedPassword: string
): Promise<FixtureUser> {
  const email = `e2e-sepay-${RUN}-${tag.toLowerCase()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: `E2E SePay ${tag} ${RUN}`,
      role,
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : {}),
      ...(role === "COACH" ? { coachProfile: { create: {} } } : {}),
      ...(role === "MANAGER" ? { managerProfile: { create: {} } } : {}),
    },
    include: { memberProfile: true },
  });
  created.userIds.push(user.id);
  const memberProfileId = user.memberProfile?.id ?? "";
  if (memberProfileId) created.memberProfileIds.push(memberProfileId);

  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const token = login.body?.data?.accessToken as string | undefined;
  if (login.status !== 200 || !token) {
    throw new Error(`Login failed for fixture ${email}: ${safe(login)}`);
  }
  return { id: user.id, email, token, memberProfileId };
}

async function createPlan(managerToken: string, payload: Record<string, unknown>): Promise<any> {
  const res = await http("POST", "/membership-plans", { token: managerToken, body: payload });
  if (res.status !== 201) throw new Error(`createPlan failed: ${safe(res)}`);
  created.planIds.push(res.body.data.id);
  return res.body.data;
}

// ─── SePay webhook helpers ────────────────────────────────────────────────
/** Block 1000 sepayId riêng cho mỗi lần chạy — tránh đụng dữ liệu của lần chạy trước. */
const SEPAY_ID_BASE = 1_000_000_000 + (Math.floor(Date.now() / 1000) % 1_000_000) * 1000;
let sepayIdCounter = SEPAY_ID_BASE;
const sentSepayIds: number[] = [];

function nextSepayId(): number {
  sepayIdCounter += 1;
  sentSepayIds.push(sepayIdCounter);
  return sepayIdCounter;
}

/** Payload webhook đúng chuẩn SePay cho một Payment trong DB. */
function webhookBody(
  payment: { transactionCode: string | null; amount: unknown },
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const id = (overrides.id as number | undefined) ?? nextSepayId();
  return {
    id,
    gateway: E2E_SEPAY.bankId.toUpperCase(),
    transactionDate: "2026-09-25 11:08:33",
    accountNumber: E2E_SEPAY.accountNo,
    subAccount: "",
    code: payment.transactionCode,
    content: `${payment.transactionCode} chuyen tien`,
    transferType: "in",
    description: "NGUYEN VAN A chuyen tien",
    transferAmount: Number(payment.amount),
    accumulated: 105000000,
    referenceCode: `FT${id}`,
    ...overrides,
  };
}

const sepayWebhook = (body: Record<string, unknown>, apiKey: string | null = E2E_SEPAY.apiKey) =>
  http("POST", "/payments/sepay/webhook", {
    body,
    headers: apiKey === null ? {} : { Authorization: `Apikey ${apiKey}` },
  });

/**
 * Header HMAC-SHA256 đúng chuẩn SePay: `X-SePay-Signature: sha256={hex}` ký trên
 * `{timestamp}.{rawBody}` bằng secret (docs: developer.sepay.vn → Xác thực webhook).
 */
function hmacHeaders(
  raw: string,
  secret: string,
  timestamp: string = String(Math.floor(Date.now() / 1000))
): Record<string, string> {
  const signature =
    "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return { "X-SePay-Signature": signature, "X-SePay-Timestamp": timestamp };
}

/** Gọi webhook với chữ ký HMAC hợp lệ (gửi đúng raw bytes đã ký). */
const sepayWebhookHmac = (body: Record<string, unknown>, secret: string) => {
  const raw = JSON.stringify(body);
  return http("POST", "/payments/sepay/webhook", {
    raw,
    headers: hmacHeaders(raw, secret),
  });
};

// ─── API helpers ──────────────────────────────────────────────────────────
const checkout = (token: string, planId: string) =>
  http("POST", "/payments/sepay/checkout", { token, body: { planId } });
const getCheckout = (token: string, paymentId: string) =>
  http("GET", `/payments/sepay/${paymentId}`, { token });
const mockConfirm = (token: string, paymentId: string) =>
  http("POST", "/payments/sepay/mock-confirm", { token, body: { paymentId } });
const membershipStatus = (token: string, memberId: string) =>
  http("GET", `/members/${memberId}/membership-status`, { token });

const activeSubscriptions = (memberProfileId: string) =>
  prisma.membershipSubscription.findMany({
    where: { memberId: memberProfileId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

const sepayEvent = (sepayId: number) =>
  prisma.sepayWebhookEvent.findUnique({ where: { sepayId } });

type Ctx = {
  manager: FixtureUser;
  plans: { membership30: any; membership7: any; premium90: any };
};

/** A) Chưa cấu hình SePay (thiếu TK nhận tiền / thiếu API key webhook) → 503. */
async function scenarioNotConfigured(member: FixtureUser, plan: any): Promise<void> {
  section("A) Chưa cấu hình SePay → checkout 503, webhook 503");

  setSepayEnv({ configured: false });
  const blocked = await checkout(member.token, plan.id);
  check("checkout khi chưa cấu hình TK nhận tiền → 503", blocked.status === 503, blocked.body);
  check(
    "errors.code = SEPAY_NOT_CONFIGURED",
    blocked.body?.errors?.code === "SEPAY_NOT_CONFIGURED",
    blocked.body?.errors
  );

  const noBankWebhook = await sepayWebhook(webhookBody({ transactionCode: "SEVQR00000000", amount: 1000 }));
  check(
    "webhook khi chưa cấu hình TK nhận tiền → 503",
    noBankWebhook.status === 503 && noBankWebhook.body?.errors?.code === "SEPAY_NOT_CONFIGURED",
    noBankWebhook.body
  );

  setSepayEnv({ webhookKey: "" });
  const noKey = await sepayWebhook(webhookBody({ transactionCode: "SEVQR00000000", amount: 1000 }));
  check(
    "webhook khi chưa cấu hình SEPAY_WEBHOOK_API_KEY → 503",
    noKey.status === 503 && noKey.body?.errors?.code === "SEPAY_NOT_CONFIGURED",
    noKey.body
  );

  setSepayEnv({});
}

/** B) Luồng chính: checkout → QR → các nhánh webhook → kích hoạt gói + hóa đơn + thông báo. */
async function scenarioCheckoutAndWebhookCore(
  ctx: Ctx,
  member: FixtureUser,
  other: FixtureUser,
  coach: FixtureUser,
  plan: any
): Promise<string> {
  section("B) Checkout → QR → webhook (sai key / mã lạ / tiền ra / lệch TK / lệch tiền / thành công / lặp)");
  setSepayEnv({});

  const res = await checkout(member.token, plan.id);
  check("checkout → 201", res.status === 201, res.body);
  const data = res.body?.data ?? {};
  check(
    "orderCode đúng định dạng SEVQR + 8 số",
    /^SEVQR\d{8}$/.test(String(data.orderCode)),
    data.orderCode
  );
  check(
    "amount = 300000, currency VND, status PENDING, gateway SEPAY",
    data.amount === 300000 &&
      data.currency === "VND" &&
      data.status === "PENDING" &&
      data.gateway === "SEPAY",
    data
  );
  check(
    "qrUrl là ảnh VietQR kèm acc/bank/amount/des",
    String(data.qrUrl).startsWith("https://qr.sepay.vn/img?") &&
      String(data.qrUrl).includes(`acc=${E2E_SEPAY.accountNo}`) &&
      String(data.qrUrl).includes(`bank=${E2E_SEPAY.bankId}`) &&
      String(data.qrUrl).includes("amount=300000") &&
      String(data.qrUrl).includes(`des=${data.orderCode}`),
    data.qrUrl
  );
  check(
    "transferContent = orderCode và bank info đúng cấu hình",
    data.transferContent === data.orderCode &&
      data.bank?.accountNumber === E2E_SEPAY.accountNo &&
      data.bank?.id === E2E_SEPAY.bankId &&
      data.bank?.accountHolder === E2E_SEPAY.accountHolder,
    data.bank
  );
  check("response có expiresAt (TTL 15 phút)", Boolean(data.expiresAt), data.expiresAt);

  const paymentId = data.paymentId as string;
  const dbPending = await prisma.payment.findUnique({ where: { id: paymentId } });
  check(
    "DB: PENDING + method/gateway SEPAY + planId + transactionCode = orderCode",
    dbPending?.status === "PENDING" &&
      dbPending?.method === "SEPAY" &&
      dbPending?.gateway === "SEPAY" &&
      dbPending?.planId === plan.id &&
      dbPending?.transactionCode === data.orderCode,
    dbPending
  );
  check(
    "DB: CHƯA có subscriptionId/paidAt (chưa kích hoạt gói)",
    dbPending?.subscriptionId === null && dbPending?.paidAt === null
  );

  const poll = await getCheckout(member.token, paymentId);
  check(
    "GET /payments/sepay/:id (chủ đơn) → 200 PENDING + qrUrl",
    poll.status === 200 && poll.body?.data?.status === "PENDING" && Boolean(poll.body?.data?.qrUrl),
    poll.body?.data
  );
  const foreignGet = await getCheckout(other.token, paymentId);
  check("MEMBER khác xem đơn → 403", foreignGet.status === 403, foreignGet.body);
  const coachGet = await getCheckout(coach.token, paymentId);
  check("COACH xem đơn → 403", coachGet.status === 403, coachGet.body);

  const second = await checkout(member.token, plan.id);
  check("checkout lần 2 khi còn PENDING → 409", second.status === 409, second.body);
  check(
    `errors.code = ${SEPAY_PENDING_CODE}`,
    second.body?.errors?.code === SEPAY_PENDING_CODE,
    second.body?.errors
  );
  check(
    "409 trả kèm paymentId/orderCode/qrUrl/expiresAt để FE tiếp tục thanh toán",
    Boolean(second.body?.errors?.paymentId) &&
      Boolean(second.body?.errors?.orderCode) &&
      Boolean(second.body?.errors?.qrUrl) &&
      Boolean(second.body?.errors?.expiresAt),
    second.body?.errors
  );

  // ── Webhook: sai/thiếu API key ─────────────────────────────────────────
  const noAuth = await sepayWebhook(webhookBody(dbPending!), null);
  check(
    "webhook thiếu Authorization → 401 SEPAY_INVALID_API_KEY",
    noAuth.status === 401 && noAuth.body?.errors?.code === "SEPAY_INVALID_API_KEY",
    noAuth.body
  );
  const badKey = await sepayWebhook(webhookBody(dbPending!), "sai_api_key");
  check(
    "webhook sai API key → 401",
    badKey.status === 401 && badKey.body?.errors?.code === "SEPAY_INVALID_API_KEY",
    badKey.body
  );
  const payloadInvalid = await sepayWebhook({ transferType: "in" });
  check("webhook payload thiếu id → 400 (validate zod)", payloadInvalid.status === 400, payloadInvalid.body);

  // ── Webhook: mã đơn lạ → ack & ghi log IGNORED ─────────────────────────
  const unknown = webhookBody({ transactionCode: "SEVQR99999999", amount: 300000 });
  const unknownRes = await sepayWebhook(unknown);
  check(
    "webhook mã đơn lạ → 200 { success: true } (ack, không retry)",
    unknownRes.status === 200 && unknownRes.body?.success === true,
    unknownRes.body
  );
  const unknownEvent = await sepayEvent(unknown.id as number);
  check(
    "SepayWebhookEvent: IGNORED / ORDER_NOT_FOUND",
    unknownEvent?.status === "IGNORED" && unknownEvent?.reason === "ORDER_NOT_FOUND",
    unknownEvent
  );
  check("Payment vẫn PENDING (không xử lý gì)", (await prisma.payment.findUnique({ where: { id: paymentId } }))?.status === "PENDING");

  // ── Webhook: tiền RA → bỏ qua ──────────────────────────────────────────
  const outBody = webhookBody(dbPending!, { transferType: "out" });
  const outRes = await sepayWebhook(outBody);
  check("webhook transferType = out → 200 ack", outRes.status === 200 && outRes.body?.success === true, outRes.body);
  const outEvent = await sepayEvent(outBody.id as number);
  check(
    "SepayWebhookEvent: IGNORED / OUT_TRANSFER",
    outEvent?.status === "IGNORED" && outEvent?.reason === "OUT_TRANSFER",
    outEvent
  );

  // ── Webhook: LỆCH TÀI KHOẢN nhận tiền → không kích hoạt ────────────────
  const wrongAccBody = webhookBody(dbPending!, { accountNumber: "9999999999" });
  const wrongAcc = await sepayWebhook(wrongAccBody);
  check("webhook lệch số tài khoản → 200 ack", wrongAcc.status === 200 && wrongAcc.body?.success === true, wrongAcc.body);
  const accEvent = await sepayEvent(wrongAccBody.id as number);
  check(
    "SepayWebhookEvent: MISMATCH / ACCOUNT_MISMATCH",
    accEvent?.status === "MISMATCH" && accEvent?.reason === "ACCOUNT_MISMATCH",
    accEvent
  );

  // ── Webhook: LỆCH SỐ TIỀN → không kích hoạt ────────────────────────────
  const wrongAmountBody = webhookBody(dbPending!, { transferAmount: Number(dbPending!.amount) + 5000 });
  const wrongAmount = await sepayWebhook(wrongAmountBody);
  check("webhook lệch số tiền → 200 ack", wrongAmount.status === 200 && wrongAmount.body?.success === true, wrongAmount.body);
  const amountEvent = await sepayEvent(wrongAmountBody.id as number);
  check(
    "SepayWebhookEvent: MISMATCH / AMOUNT_MISMATCH",
    amountEvent?.status === "MISMATCH" && amountEvent?.reason === "AMOUNT_MISMATCH",
    amountEvent
  );
  const stillPending = await prisma.payment.findUnique({ where: { id: paymentId } });
  check(
    "Sau các webhook lệch: Payment vẫn PENDING + note đối soát",
    stillPending?.status === "PENDING" && String(stillPending?.note ?? "").includes("lệch số tiền"),
    stillPending?.note
  );
  await sleep(200);
  const mismatchNotify = await prisma.notification.findFirst({
    where: { userId: member.id, title: "Giao dịch chuyển khoản cần đối soát" },
    orderBy: { createdAt: "desc" },
  });
  check("Notification GENERAL nhắc hội viên đối soát khi tiền không khớp", Boolean(mismatchNotify), mismatchNotify?.body);

  // ── Webhook HỢP LỆ → kích hoạt gói + invoice + thông báo ───────────────
  const okBody = webhookBody(dbPending!);
  const okRes = await sepayWebhook(okBody);
  check(
    "webhook hợp lệ → 200 { success: true } (SePay không cần retry)",
    okRes.status === 200 && okRes.body?.success === true,
    okRes
  );
  const okEvent = await sepayEvent(okBody.id as number);
  check(
    "SepayWebhookEvent: PROCESSED + gắn đúng paymentId",
    okEvent?.status === "PROCESSED" && okEvent?.paymentId === paymentId,
    okEvent
  );

  const paid = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: true, subscription: { include: { plan: true } } },
  });
  check(
    "DB: Payment SUCCESS + paidAt + gatewayTransId = referenceCode + gatewayPayload là payload webhook",
    paid?.status === "SUCCESS" &&
      Boolean(paid?.paidAt) &&
      paid?.gatewayTransId === okBody.referenceCode &&
      (paid?.gatewayPayload as Record<string, unknown>)?.id === okBody.id,
    { status: paid?.status, gatewayTransId: paid?.gatewayTransId }
  );
  check(
    "DB: Invoice ISSUED + snapshot planName/planTier (BR-25)",
    paid?.invoice?.status === "ISSUED" &&
      paid?.invoice?.planName === plan.name &&
      paid?.invoice?.planTier === plan.tier,
    paid?.invoice
  );

  // Giao dịch online KHÔNG được đổi trạng thái thủ công: phải qua webhook/đối soát.
  const manualOverride = await http("PATCH", `/payments/${paymentId}/status`, {
    token: ctx.manager.token,
    body: { status: "REFUNDED" },
  });
  check(
    "MANAGER PATCH /payments/:id/status trên giao dịch SePay → 400 (không bypass settlement)",
    manualOverride.status === 400,
    manualOverride.body
  );
  const sub = paid?.subscription;
  const days = sub ? Math.round((sub.endDate.getTime() - sub.startDate.getTime()) / DAY) : 0;
  check(
    `DB: Subscription ACTIVE tier ${plan.tier} đúng ${plan.durationDays} ngày`,
    sub?.status === "ACTIVE" && sub?.tier === plan.tier && days === plan.durationDays,
    { status: sub?.status, tier: sub?.tier, days }
  );
  await sleep(200);
  const successNotify = await prisma.notification.findFirst({
    where: { userId: member.id, type: "PAYMENT_SUCCESS" },
    orderBy: { createdAt: "desc" },
  });
  check("Notification PAYMENT_SUCCESS sau khi gói được kích hoạt", Boolean(successNotify), successNotify?.title);

  const statusRes = await getCheckout(member.token, paymentId);
  check(
    "GET /payments/sepay/:id → SUCCESS + paidAt + subscriptionId",
    statusRes.status === 200 &&
      statusRes.body?.data?.status === "SUCCESS" &&
      Boolean(statusRes.body?.data?.paidAt) &&
      statusRes.body?.data?.subscriptionId === paid?.subscriptionId,
    statusRes.body?.data
  );
  const mStatus = await membershipStatus(ctx.manager.token, member.memberProfileId);
  check(
    "membership-status: effectiveTier = MEMBERSHIP sau khi thanh toán",
    mStatus.body?.data?.effectiveTier === "MEMBERSHIP",
    mStatus.body?.data
  );

  // ── Chống webhook trùng: cùng sepayId (SePay retry) ─────────────────────
  const dup = await sepayWebhook(okBody);
  check("webhook lặp CÙNG sepayId → 200 ack", dup.status === 200 && dup.body?.success === true, dup.body);
  const dupEventRows = await prisma.sepayWebhookEvent.count({ where: { sepayId: okBody.id as number } });
  check("Chỉ có ĐÚNG 1 bản ghi SepayWebhookEvent cho sepayId đó", dupEventRows === 1, dupEventRows);
  check(
    "DB: KHÔNG tạo subscription thứ 2 cho cùng giao dịch",
    (await activeSubscriptions(member.memberProfileId)).length === 1
  );

  // ── Chống webhook trùng: sepayId MỚI nhưng đơn đã SUCCESS ──────────────
  const secondTransfer = webhookBody(dbPending!);
  const dupDifferentId = await sepayWebhook(secondTransfer);
  check("webhook sepayId mới cho đơn đã SUCCESS → 200 ack", dupDifferentId.status === 200, dupDifferentId.body);
  const dupDifferentEvent = await sepayEvent(secondTransfer.id as number);
  check(
    "SepayWebhookEvent: DUPLICATE / PAYMENT_ALREADY_PAID",
    dupDifferentEvent?.status === "DUPLICATE" && dupDifferentEvent?.reason === "PAYMENT_ALREADY_PAID",
    dupDifferentEvent
  );
  check(
    "DB: vẫn chỉ 1 subscription ACTIVE",
    (await activeSubscriptions(member.memberProfileId)).length === 1
  );

  // ── webhook viết thường "apikey ..." vẫn được chấp nhận (docs SePay) ───
  const lowerHeader = await http("POST", "/payments/sepay/webhook", {
    body: webhookBody(dbPending!),
    headers: { Authorization: `apikey ${E2E_SEPAY.apiKey}` },
  });
  check(
    "header `apikey` (chữ thường) vẫn xác thực được → 200",
    lowerHeader.status === 200 && lowerHeader.body?.success === true,
    lowerHeader.body
  );

  return paymentId;
}

/** C) DEV/DEMO: SEPAY_MOCK_MODE điều khiển endpoint mock-confirm + quyền xác nhận hộ. */
async function scenarioMockMode(
  ctx: Ctx,
  member: FixtureUser,
  other: FixtureUser,
  coach: FixtureUser,
  manager: FixtureUser,
  plan: any
): Promise<void> {
  section("C) Mock-confirm (SEPAY_MOCK_MODE) + quyền xác nhận");

  setSepayEnv({ mock: false });
  const res0 = await checkout(member.token, plan.id);
  check("checkout (mock tắt) → 201", res0.status === 201, res0.body);
  const paymentId = res0.body?.data?.paymentId as string;

  const disabled = await mockConfirm(member.token, paymentId);
  check(
    "mock-confirm khi SEPAY_MOCK_MODE=false → 403 SEPAY_MOCK_DISABLED",
    disabled.status === 403 && disabled.body?.errors?.code === "SEPAY_MOCK_DISABLED",
    disabled.body
  );

  setSepayEnv({ mock: true });
  const foreign = await mockConfirm(other.token, paymentId);
  check("MEMBER khác mock-confirm → 403", foreign.status === 403, foreign.body);
  const coachRes = await mockConfirm(coach.token, paymentId);
  check("COACH mock-confirm → 403", coachRes.status === 403, coachRes.body);

  const ok = await mockConfirm(member.token, paymentId);
  check(
    "mock-confirm (chủ đơn) → processed=true, PROCESSED, paymentStatus SUCCESS, có subscriptionId",
    ok.status === 200 &&
      ok.body?.data?.processed === true &&
      ok.body?.data?.status === "PROCESSED" &&
      ok.body?.data?.paymentStatus === "SUCCESS" &&
      Boolean(ok.body?.data?.subscriptionId),
    ok.body?.data
  );
  const again = await mockConfirm(member.token, paymentId);
  check(
    "mock-confirm lặp lại → processed=false, status DUPLICATE",
    again.body?.data?.processed === false && again.body?.data?.status === "DUPLICATE",
    again.body?.data
  );

  // Chốt cứng: production KHÔNG bao giờ được mock, kể cả khi SEPAY_MOCK_MODE=true.
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const prodBlocked = await mockConfirm(member.token, paymentId);
    check(
      "mock-confirm khi NODE_ENV=production → 403 (chặn cứng, không phụ thuộc SEPAY_MOCK_MODE)",
      prodBlocked.status === 403 && prodBlocked.body?.errors?.code === "SEPAY_MOCK_DISABLED",
      prodBlocked.body
    );
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
  }
  check(
    "DB: chỉ 1 subscription ACTIVE",
    (await activeSubscriptions(member.memberProfileId)).length === 1
  );

  const otherCheckout = await checkout(other.token, plan.id);
  const managerRes = await mockConfirm(manager.token, otherCheckout.body?.data?.paymentId as string);
  check(
    "MANAGER mock-confirm hộ (demo) → 200 paymentStatus SUCCESS",
    managerRes.status === 200 && managerRes.body?.data?.paymentStatus === "SUCCESS",
    managerRes.body?.data
  );

  setSepayEnv({ mock: false });
}

/** D) Đơn hết hạn được đóng khi checkout lại + tiền về MUỘN (LATE) không kích hoạt. */
async function scenarioExpiredPendingAndLate(member: FixtureUser, plan: any): Promise<void> {
  section("D) Đơn hết hạn (TTL) + tiền về MUỘN không kích hoạt gói");

  setSepayEnv({ ttlMinutes: 15 });
  const first = await checkout(member.token, plan.id);
  check("checkout → 201", first.status === 201, first.body);
  const firstId = first.body?.data?.paymentId as string;
  const firstCode = first.body?.data?.orderCode as string;

  // Giả lập quá TTL: đẩy createdAt lùi 30 phút rồi checkout lại.
  await prisma.payment.update({
    where: { id: firstId },
    data: { createdAt: new Date(Date.now() - 30 * 60 * 1000) },
  });
  const second = await checkout(member.token, plan.id);
  check(
    "checkout lại sau TTL → 201 + mã thanh toán MỚI",
    second.status === 201 && second.body?.data?.orderCode !== firstCode,
    second.body?.data?.orderCode
  );
  const oldRow = await prisma.payment.findUnique({ where: { id: firstId } });
  check(
    "Đơn cũ bị đóng → FAILED + note hết hạn",
    oldRow?.status === "FAILED" && String(oldRow?.note ?? "").includes("Hết hạn"),
    oldRow?.note
  );

  // Tiền về muộn cho đơn cũ → ack, ghi LATE, KHÔNG kích hoạt.
  const lateBody = webhookBody({ transactionCode: firstCode, amount: oldRow!.amount });
  const late = await sepayWebhook(lateBody);
  check("webhook tiền về muộn → 200 ack", late.status === 200 && late.body?.success === true, late.body);
  const lateEvent = await sepayEvent(lateBody.id as number);
  check(
    "SepayWebhookEvent: LATE / LATE_RESULT",
    lateEvent?.status === "LATE" && lateEvent?.reason === "LATE_RESULT",
    lateEvent
  );
  const afterLate = await prisma.payment.findUnique({ where: { id: firstId } });
  check(
    "Đơn cũ vẫn FAILED + note 'cần đối soát'",
    afterLate?.status === "FAILED" && String(afterLate?.note ?? "").includes("cần đối soát"),
    afterLate?.note
  );
  check(
    "KHÔNG kích hoạt gói từ giao dịch muộn",
    (await activeSubscriptions(member.memberProfileId)).length === 0
  );

  // Đơn mới được thanh toán → kích hoạt bình thường.
  const newBody = webhookBody({
    transactionCode: second.body?.data?.orderCode,
    amount: second.body?.data?.amount,
  });
  const ok = await sepayWebhook(newBody);
  check(
    "webhook cho đơn mới → PROCESSED + kích hoạt gói",
    ok.status === 200 && (await sepayEvent(newBody.id as number))?.status === "PROCESSED",
    ok.body
  );
  check(
    "DB: Subscription ACTIVE sau khi đơn mới được thanh toán",
    (await activeSubscriptions(member.memberProfileId)).length === 1
  );
}

/** E) Chặn gói FREE / hạ hạng + nâng cấp PREMIUM (cộng ngày dư của gói cũ). */
async function scenarioGuardsAndUpgrade(
  ctx: Ctx,
  member: FixtureUser,
  freePlanId: string
): Promise<void> {
  section("E) Chặn gói FREE / hạ hạng + nâng cấp PREMIUM (cộng ngày dư)");
  setSepayEnv({});

  const free = await checkout(member.token, freePlanId);
  check("checkout gói FREE → 400", free.status === 400, free.body);
  const notFound = await checkout(member.token, "00000000-0000-0000-0000-000000000000");
  check("checkout gói không tồn tại → 404", notFound.status === 404, notFound.body);
  const downgrade = await checkout(member.token, ctx.plans.membership7.id);
  check("checkout cùng hạng ít ngày hơn (30 ngày → 7 ngày) → 400", downgrade.status === 400, downgrade.body);

  const beforeSubs = await prisma.membershipSubscription.findMany({
    where: { memberId: member.memberProfileId },
  });
  const activeBefore = beforeSubs.filter((s) => s.status === "ACTIVE");
  check("Trước nâng cấp: đang có 1 gói MEMBERSHIP ACTIVE", activeBefore.length === 1 && activeBefore[0].tier === "MEMBERSHIP", activeBefore.map((s) => s.tier));

  const upgrade = await checkout(member.token, ctx.plans.premium90.id);
  check("checkout nâng cấp PREMIUM 90 ngày → 201", upgrade.status === 201, upgrade.body);
  const upBody = webhookBody({
    transactionCode: upgrade.body?.data?.orderCode,
    amount: upgrade.body?.data?.amount,
  });
  const paid = await sepayWebhook(upBody);
  check("webhook nâng cấp → 200 ack", paid.status === 200 && paid.body?.success === true, paid.body);
  check(
    "SepayWebhookEvent nâng cấp: PROCESSED",
    (await sepayEvent(upBody.id as number))?.status === "PROCESSED"
  );

  const subs = await prisma.membershipSubscription.findMany({
    where: { memberId: member.memberProfileId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  const active = subs.filter((s) => s.status === "ACTIVE");
  const suspended = subs.filter((s) => s.status === "SUSPENDED");
  check(
    "Gói cũ bị SUSPENDED, gói mới ACTIVE PREMIUM",
    active.length === 1 && active[0].tier === "PREMIUM" && suspended.length >= 1,
    { active: active.map((s) => s.tier), suspended: suspended.length }
  );
  const upDays = active[0]
    ? Math.round((active[0].endDate.getTime() - active[0].startDate.getTime()) / DAY)
    : 0;
  const remaining = activeBefore[0]
    ? Math.ceil((activeBefore[0].endDate.getTime() - Date.now()) / DAY)
    : 0;
  check(
    `Thời hạn gói mới = 90 ngày + ngày dư (${upDays} ngày, dư ≈ ${remaining})`,
    upDays >= 90 && Math.abs(upDays - (90 + remaining)) <= 1,
    { upDays, remaining }
  );
  await sleep(200);
  const upgradeNotify = await prisma.notification.findFirst({
    where: { userId: member.id, type: "PAYMENT_SUCCESS", title: { contains: "Nâng cấp" } },
    orderBy: { createdAt: "desc" },
  });
  check("Notification 'Nâng cấp gói thành công!' cho hội viên", Boolean(upgradeNotify), upgradeNotify?.body);
}

/**
 * H) Hồi quy lỗi nghiệp vụ: tài khoản mới được cấp gói FREE 3650 ngày — khi mua gói trả phí
 * TUYỆT ĐỐI không cộng 3650 ngày dư của FREE vào gói mới (trước đây mua 30 ngày nhận ~10 năm).
 * Kiểm tra cả 2 kênh vào chung một luồng: SePay online (checkout → webhook) và tại quầy (POST /subscriptions).
 */
async function scenarioFreePlanNoCarryOver(
  ctx: Ctx,
  sepayMember: FixtureUser,
  counterMember: FixtureUser,
  renewMember: FixtureUser
): Promise<void> {
  section("H) Mua gói trả phí khi đang có gói FREE → KHÔNG cộng ngày dư FREE");
  setSepayEnv({});

  const spanDays = (start: Date, end: Date) =>
    Math.round((end.getTime() - start.getTime()) / DAY);

  // Mô phỏng provisioning lúc register: member mới nhận subscription FREE ACTIVE (~3650 ngày).
  const provision = await prisma.$transaction((tx) =>
    ensureActiveFreeSubscription(tx, sepayMember.memberProfileId)
  );
  check(
    "Member mới được cấp subscription FREE ACTIVE ~3650 ngày",
    provision.created &&
      provision.subscription.tier === "FREE" &&
      Math.abs(spanDays(provision.subscription.startDate, provision.subscription.endDate) - 3650) <= 1,
    {
      created: provision.created,
      tier: provision.subscription.tier,
      days: spanDays(provision.subscription.startDate, provision.subscription.endDate),
    }
  );

  // ── Kênh 1: SePay online (checkout → webhook) ───────────────────────────
  const co = await checkout(sepayMember.token, ctx.plans.membership30.id);
  check("SePay: checkout MEMBERSHIP 30 ngày khi đang có FREE → 201", co.status === 201, co.body);
  const body = webhookBody({
    transactionCode: co.body?.data?.orderCode,
    amount: co.body?.data?.amount,
  });
  const paid = await sepayWebhook(body);
  check(
    "SePay: webhook → 200 ack + PROCESSED",
    paid.status === 200 &&
      paid.body?.success === true &&
      (await sepayEvent(body.id as number))?.status === "PROCESSED",
    paid.body
  );

  const sepaySubs = await prisma.membershipSubscription.findMany({
    where: { memberId: sepayMember.memberProfileId },
    orderBy: { createdAt: "desc" },
  });
  const sepayActive = sepaySubs.filter((s) => s.status === "ACTIVE");
  const sepayPaid = sepayActive.find((s) => s.tier === "MEMBERSHIP");
  const sepayPaidDays = sepayPaid ? spanDays(sepayPaid.startDate, sepayPaid.endDate) : 0;
  check(
    `SePay: gói mới ~30 ngày, KHÔNG phải ~3680 ngày (${sepayPaidDays} ngày)`,
    Boolean(sepayPaid) && sepayPaidDays >= 30 && sepayPaidDays <= 31,
    { sepayPaidDays, endDate: sepayPaid?.endDate }
  );
  check(
    "SePay: gói FREE cũ SUSPENDED, chỉ còn đúng 1 gói ACTIVE (MEMBERSHIP)",
    sepayActive.length === 1 &&
      sepayActive[0].tier === "MEMBERSHIP" &&
      sepaySubs.some((s) => s.tier === "FREE" && s.status === "SUSPENDED"),
    sepaySubs.map((s) => `${s.tier}:${s.status}`)
  );

  // ── Kênh 2: quầy (POST /subscriptions) ─────────────────────────────────
  await prisma.$transaction((tx) =>
    ensureActiveFreeSubscription(tx, counterMember.memberProfileId)
  );
  const counter = await http("POST", "/subscriptions", {
    token: ctx.manager.token,
    body: {
      memberId: counterMember.memberProfileId,
      planId: ctx.plans.membership30.id,
      paymentMethod: "CASH",
    },
  });
  check("Quầy: POST /subscriptions khi đang có FREE → 201", counter.status === 201, counter.body);
  const counterSub = counter.body?.data?.subscription;
  const counterDays = counterSub
    ? spanDays(new Date(counterSub.startDate), new Date(counterSub.endDate))
    : 0;
  check(
    `Quầy: gói mới ~30 ngày, KHÔNG phải ~3680 ngày (${counterDays} ngày)`,
    counter.status === 201 && counterDays >= 30 && counterDays <= 31,
    { counterDays, endDate: counterSub?.endDate }
  );
  const counterFree = await prisma.membershipSubscription.findFirst({
    where: { memberId: counterMember.memberProfileId, tier: "FREE" },
    orderBy: { createdAt: "desc" },
  });
  check("Quầy: gói FREE cũ SUSPENDED", counterFree?.status === "SUSPENDED", counterFree?.status);

  // ── Kênh 3: GIA HẠN (renew) từ gói FREE đang ACTIVE ─────────────────────
  const renewProvision = await prisma.$transaction((tx) =>
    ensureActiveFreeSubscription(tx, renewMember.memberProfileId)
  );
  check(
    "Renew: member có gói FREE ACTIVE trước khi gia hạn",
    renewProvision.created && renewProvision.subscription.status === "ACTIVE",
    renewProvision.subscription.status
  );

  const beforeRenew = Date.now();
  const renew = await http("POST", `/subscriptions/${renewProvision.subscription.id}/renew`, {
    token: ctx.manager.token,
    body: { planId: ctx.plans.membership30.id, paymentMethod: "CASH" },
  });
  check("Renew từ gói FREE → 201", renew.status === 201, renew.body);
  const renewedSub = renew.body?.data?.subscription;
  const renewStart = renewedSub ? new Date(renewedSub.startDate).getTime() : 0;
  const renewDays = renewedSub
    ? spanDays(new Date(renewedSub.startDate), new Date(renewedSub.endDate))
    : 0;
  check(
    `Renew từ FREE bắt đầu NGAY (không đợi ~3650 ngày), thời hạn ~30 ngày (${renewDays} ngày)`,
    Boolean(renewedSub) &&
      renewStart >= beforeRenew - 60_000 &&
      renewStart <= Date.now() + 60_000 &&
      renewDays >= 30 &&
      renewDays <= 31,
    { startDate: renewedSub?.startDate, renewDays }
  );

  const renewSubs = await prisma.membershipSubscription.findMany({
    where: { memberId: renewMember.memberProfileId },
  });
  const renewActive = renewSubs.filter((s) => s.status === "ACTIVE");
  const renewFree = renewSubs.find((s) => s.id === renewProvision.subscription.id);
  check(
    "Renew từ FREE: gói FREE cũ SUSPENDED, chỉ còn đúng 1 gói ACTIVE (MEMBERSHIP)",
    renewActive.length === 1 &&
      renewActive[0].tier === "MEMBERSHIP" &&
      renewFree?.status === "SUSPENDED",
    renewSubs.map((s) => `${s.tier}:${s.status}`)
  );

  // ── Kênh 4: đổi mật khẩu phải thu hồi refresh token cũ (D05) ─────────────
  const relogin = await http("POST", "/auth/login", {
    body: { email: renewMember.email, password: PASSWORD },
  });
  const oldRefresh = relogin.body?.data?.refreshToken as string | undefined;
  const changed = await http("PATCH", "/auth/me/change-password", {
    token: renewMember.token,
    body: { currentPassword: PASSWORD, newPassword: "E2eSepay!2026-NEW" },
  });
  const refreshAfter = oldRefresh
    ? await http("POST", "/auth/refresh-token", { body: { refreshToken: oldRefresh } })
    : { status: 0, body: null };
  check(
    "Đổi mật khẩu → mọi refresh token cũ bị thu hồi (refresh 401)",
    changed.status === 200 && Boolean(oldRefresh) && refreshAfter.status === 401,
    { changed: changed.status, refresh: refreshAfter.status }
  );
}

/** F) Phân quyền: chỉ MEMBER được checkout; endpoint webhook là công khai (API key); GET cần auth. */
async function scenarioAuthorization(ctx: Ctx, staff: FixtureUser, coach: FixtureUser): Promise<void> {
  section("F) Phân quyền checkout / GET status");
  setSepayEnv({});
  const planId = ctx.plans.membership30.id;

  const asManager = await checkout(ctx.manager.token, planId);
  check("MANAGER checkout → 403 (chỉ MEMBER tự mua)", asManager.status === 403, asManager.body);
  const asStaff = await checkout(staff.token, planId);
  check("STAFF checkout → 403", asStaff.status === 403, asStaff.body);
  const asCoach = await checkout(coach.token, planId);
  check("COACH checkout → 403", asCoach.status === 403, asCoach.body);
  const anonymous = await http("POST", "/payments/sepay/checkout", { body: { planId } });
  check("checkout không token → 401", anonymous.status === 401, anonymous.body);
  const anonGet = await http("GET", "/payments/sepay/00000000-0000-0000-0000-000000000000");
  check("GET /payments/sepay/:id không token → 401", anonGet.status === 401, anonGet.body);
}

/** G) Xác thực HMAC-SHA256 (SEPAY_WEBHOOK_SECRET) — song song & đối chiếu với API Key. */
async function scenarioHmacAuth(member: FixtureUser, plan: any): Promise<void> {
  section("G) HMAC-SHA256: chữ ký đúng / sai secret / body sửa / timestamp lệch / thiếu credentials");
  const secret = E2E_SEPAY.hmacSecret;
  const unknown = () => webhookBody({ transactionCode: "SEVQR99999999", amount: 1 });

  // 1) Chữ ký hợp lệ → auth PASSED (200 ack; mã đơn lạ bị bỏ qua ở bước nghiệp vụ).
  setSepayEnv({ webhookSecret: secret });
  const good = await sepayWebhookHmac(unknown(), secret);
  check("HMAC đúng → 200 ack (không 401)", good.status === 200 && good.body?.success === true, good.body);

  // 2) Sai secret → 401 SEPAY_INVALID_SIGNATURE.
  const badSecret = await sepayWebhookHmac(unknown(), "whsec_wrong_secret");
  check(
    "HMAC sai secret → 401 SEPAY_INVALID_SIGNATURE",
    badSecret.status === 401 && badSecret.body?.errors?.code === "SEPAY_INVALID_SIGNATURE",
    badSecret.body
  );

  // 3) Ký raw A nhưng gửi body B (đổi số tiền sau khi ký) → 401.
  const bodyA = unknown();
  const sigForA = hmacHeaders(JSON.stringify(bodyA), secret);
  const tamperRes = await http("POST", "/payments/sepay/webhook", {
    body: { ...bodyA, transferAmount: 999999 },
    headers: sigForA,
  });
  check(
    "Body bị sửa sau khi ký → 401 SEPAY_INVALID_SIGNATURE",
    tamperRes.status === 401 && tamperRes.body?.errors?.code === "SEPAY_INVALID_SIGNATURE",
    tamperRes.body
  );

  // 4) Timestamp gửi khác timestamp đã ký → 401.
  const tsBody = unknown();
  const tsRaw = JSON.stringify(tsBody);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "sha256=" + createHmac("sha256", secret).update(`${ts}.${tsRaw}`).digest("hex");
  const tsMismatch = await http("POST", "/payments/sepay/webhook", {
    raw: tsRaw,
    headers: { "X-SePay-Signature": sig, "X-SePay-Timestamp": String(Number(ts) + 1) },
  });
  check("Timestamp lệch giá trị đã ký → 401", tsMismatch.status === 401, tsMismatch.body);

  // 4b) D07 — timestamp QUÁ CŨ (ngoài cửa sổ cho phép) → 401 dù chữ ký ĐÚNG (chống replay).
  const staleTs = String(Math.floor(Date.now() / 1000) - 2 * 3600);
  const staleRaw = JSON.stringify(unknown());
  const staleSig =
    "sha256=" + createHmac("sha256", secret).update(`${staleTs}.${staleRaw}`).digest("hex");
  const stale = await http("POST", "/payments/sepay/webhook", {
    raw: staleRaw,
    headers: { "X-SePay-Signature": staleSig, "X-SePay-Timestamp": staleTs },
  });
  check(
    "D07: chữ ký đúng nhưng timestamp quá cũ (2h) → 401",
    stale.status === 401 && stale.body?.errors?.code === "SEPAY_INVALID_SIGNATURE",
    stale.body
  );

  // 4c) D07 — trong cửa sổ retry của SePay (5 phút trước) vẫn được chấp nhận → 200 ack.
  const freshTs = String(Math.floor(Date.now() / 1000) - 5 * 60);
  const freshRaw = JSON.stringify(unknown());
  const freshSig =
    "sha256=" + createHmac("sha256", secret).update(`${freshTs}.${freshRaw}`).digest("hex");
  const inWindow = await http("POST", "/payments/sepay/webhook", {
    raw: freshRaw,
    headers: { "X-SePay-Signature": freshSig, "X-SePay-Timestamp": freshTs },
  });
  check(
    "D07: timestamp trong cửa sổ (5 phút trước) vẫn 200 ack",
    inWindow.status === 200 && inWindow.body?.success === true,
    inWindow.body
  );

  // 5) Chữ ký sai định dạng (không phải sha256={64 hex}) → 401.
  const malformed = await http("POST", "/payments/sepay/webhook", {
    body: unknown(),
    headers: { "X-SePay-Signature": "deadbeef", "X-SePay-Timestamp": ts },
  });
  check("Chữ ký sai định dạng sha256={hex} → 401", malformed.status === 401, malformed.body);

  // 6) Chỉ cấu hình secret, request không gửi chữ ký → rơi vào nhánh API Key (rỗng) → 401.
  setSepayEnv({ webhookKey: "", webhookSecret: secret });
  const noCreds = await http("POST", "/payments/sepay/webhook", { body: unknown() });
  check(
    "Không chữ ký + không API key → 401 SEPAY_INVALID_API_KEY",
    noCreds.status === 401 && noCreds.body?.errors?.code === "SEPAY_INVALID_API_KEY",
    noCreds.body
  );

  // 7) Không cấu hình credentials nào → 503.
  setSepayEnv({ webhookKey: "", webhookSecret: "" });
  const none = await http("POST", "/payments/sepay/webhook", { body: unknown() });
  check(
    "Không cấu hình API key/secret → 503 SEPAY_NOT_CONFIGURED",
    none.status === 503 && none.body?.errors?.code === "SEPAY_NOT_CONFIGURED",
    none.body
  );

  // 8) Full flow qua HMAC: checkout → webhook hợp lệ → SUCCESS + subscription ACTIVE.
  setSepayEnv({ webhookSecret: secret });
  const res = await checkout(member.token, plan.id);
  check("checkout → 201", res.status === 201, res.body);
  const paymentId = res.body?.data?.paymentId as string;
  const flowBody = webhookBody({
    transactionCode: res.body?.data?.orderCode,
    amount: res.body?.data?.amount,
  });
  const flow = await sepayWebhookHmac(flowBody, secret);
  check(
    "webhook HMAC hợp lệ → 200 ack",
    flow.status === 200 && flow.body?.success === true,
    flow.body
  );
  check(
    "SepayWebhookEvent: PROCESSED",
    (await sepayEvent(flowBody.id as number))?.status === "PROCESSED",
    await sepayEvent(flowBody.id as number)
  );
  const status = await getCheckout(member.token, paymentId);
  check(
    "GET status → SUCCESS (thanh toán chốt qua HMAC)",
    status.status === 200 && status.body?.data?.status === "SUCCESS",
    status.body?.data
  );
  check(
    "DB: đúng 1 subscription ACTIVE của member",
    (await activeSubscriptions(member.memberProfileId)).length === 1
  );

  setSepayEnv({});
}

// ─── Đối soát chủ động qua SePay API (fake server) ──────────────────────────

/**
 * Fake SePay API v2 (`GET {baseUrl}/transactions?…`): trả đúng envelope `{ status, data, meta }`
 * của userapi.sepay.vn để test luồng đối soát mà không gọi ra Internet.
 */
async function startFakeSepayApi(): Promise<{
  baseUrl: string;
  requests: { url: string; authorization: string | undefined }[];
  respond: (transactions: Record<string, unknown>[]) => void;
  close: () => Promise<void>;
}> {
  const requests: { url: string; authorization: string | undefined }[] = [];
  let transactions: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url ?? "", authorization: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "success",
        data: transactions,
        meta: {
          pagination: {
            total: transactions.length,
            per_page: 50,
            current_page: 1,
            last_page: 1,
            has_more: false,
          },
        },
      })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v2`,
    requests,
    respond: (rows) => {
      transactions = rows;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

/**
 * H) ĐỐI SOÁT CHỦ ĐỘNG: tiền vào đã có trên SePay nhưng webhook KHÔNG tới được BE
 * (localhost/downtime) ⇒ FE polling `GET /payments/sepay/{id}` tự chốt đơn thành SUCCESS.
 */
async function scenarioReconcileViaApi(plan: any, upgradePlan: any): Promise<void> {
  section("H) Đối soát chủ động qua SePay API khi webhook không tới BE");

  setSepayEnv({});
  const fake = await startFakeSepayApi();
  const member = await createUser("MEMBER", "reconcile", await hashPassword(PASSWORD));
  const apiToken = "e2e_sepay_api_token_1234567890";

  try {
    const res = await checkout(member.token, plan.id);
    check("checkout → 201", res.status === 201, res.body);
    const paymentId = res.body?.data?.paymentId as string;
    const orderCode = res.body?.data?.orderCode as string;
    const amount = res.body?.data?.amount as number;

    // Chưa cấu hình token ⇒ đơn vẫn PENDING và KHÔNG gọi ra API ngoài.
    const before = await getCheckout(member.token, paymentId);
    check(
      "chưa có SEPAY_API_TOKEN → giữ PENDING, không gọi SePay API",
      before.status === 200 && before.body?.data?.status === "PENDING" && fake.requests.length === 0,
      { status: before.body?.data?.status, requests: fake.requests }
    );

    // SePay đã ghi nhận tiền vào (đúng mã đơn + số tiền + tài khoản nhận) nhưng webhook bị mất.
    const txId = "11111111-2222-3333-4444-555555555555";
    const reference = `FT-RECON-${RUN}`;
    fake.respond([
      {
        id: txId,
        transaction_date: "2026-09-26 08:05:49",
        account_number: E2E_SEPAY.accountNo,
        va: "",
        transfer_type: "in",
        amount_in: amount,
        amount_out: 0,
        accumulated: 105000000,
        transaction_content: `${orderCode} chuyen tien`,
        reference_number: reference,
        code: orderCode,
        bank_brand_name: E2E_SEPAY.bankId.toUpperCase(),
      },
    ]);
    setSepayEnv({ apiToken, apiBaseUrl: fake.baseUrl });

    const after = await getCheckout(member.token, paymentId);
    check(
      "GET status sau khi đối soát → SUCCESS (không cần webhook)",
      after.status === 200 && after.body?.data?.status === "SUCCESS",
      after.body?.data
    );
    check(
      "gọi đúng SePay API 1 lần với Bearer token",
      fake.requests.length === 1 &&
        fake.requests[0].authorization === `Bearer ${apiToken}` &&
        fake.requests[0].url.includes("/transactions?") &&
        fake.requests[0].url.includes("transfer_type=in"),
      fake.requests
    );

    const row = await prisma.payment.findUnique({ where: { id: paymentId } });
    check(
      "DB: Payment SUCCESS + gatewayTransId = reference_number của SePay",
      row?.status === "SUCCESS" && row?.gatewayTransId === reference,
      { status: row?.status, gatewayTransId: row?.gatewayTransId }
    );
    check(
      "DB: gatewayPayload lưu UUID giao dịch SePay API + note nêu rõ nguồn chốt",
      (row?.gatewayPayload as any)?.apiTransactionId === txId &&
        String(row?.note ?? "").includes("đối soát SePay API"),
      { payload: row?.gatewayPayload, note: row?.note }
    );
    check(
      "DB: đơn có subscriptionId + đúng 1 subscription ACTIVE",
      Boolean(row?.subscriptionId) &&
        (await activeSubscriptions(member.memberProfileId)).length === 1,
      row?.subscriptionId
    );
    check(
      "webhook không hề tới ⇒ KHÔNG tạo SepayWebhookEvent giả",
      (await prisma.sepayWebhookEvent.count({ where: { paymentId } })) === 0
    );

    // Polling tiếp: đơn đã SUCCESS nên không gọi API nữa và không kích hoạt lần 2.
    const again = await getCheckout(member.token, paymentId);
    check(
      "poll tiếp → SUCCESS, không gọi thêm SePay API",
      again.body?.data?.status === "SUCCESS" && fake.requests.length === 1,
      fake.requests
    );
    check(
      "DB: vẫn đúng 1 subscription ACTIVE",
      (await activeSubscriptions(member.memberProfileId)).length === 1
    );

    // Lệch số tiền ⇒ KHÔNG chốt tự động (để webhook ghi MISMATCH cho đối soát thủ công).
    const upgrade = await checkout(member.token, upgradePlan.id);
    const upgradeId = upgrade.body?.data?.paymentId as string;
    const upgradeCode = upgrade.body?.data?.orderCode as string;
    fake.respond([
      {
        id: "99999999-8888-7777-6666-555555555555",
        transaction_date: "2026-09-26 08:20:00",
        account_number: E2E_SEPAY.accountNo,
        va: "",
        transfer_type: "in",
        amount_in: Number(upgrade.body?.data?.amount) - 1000,
        amount_out: 0,
        accumulated: 105000000,
        transaction_content: `${upgradeCode} chuyen thieu`,
        reference_number: `FT-SHORT-${RUN}`,
        code: upgradeCode,
        bank_brand_name: E2E_SEPAY.bankId.toUpperCase(),
      },
    ]);
    const short = await getCheckout(member.token, upgradeId);
    const upgradeRow = await prisma.payment.findUnique({ where: { id: upgradeId } });
    check(
      "chuyển THIẾU tiền → không chốt (giữ PENDING, chưa có subscription)",
      short.body?.data?.status === "PENDING" &&
        upgradeRow?.subscriptionId === null &&
        upgradeRow?.gatewayTransId === null,
      { status: short.body?.data?.status, row: upgradeRow }
    );
  } finally {
    await fake.close();
    setSepayEnv({});
  }
}


/**
 * K) A07 — snapshot offer tại thời điểm tạo đơn; A06 — tiền đã thu nhưng chưa cấp được gói
 * (`activationStatus = REQUIRES_REVIEW`) + luồng manager kích hoạt bù.
 */
async function scenarioOfferSnapshotAndReview(
  ctx: Ctx,
  snapshotMember: FixtureUser,
  reviewMember: FixtureUser
): Promise<void> {
  section("K) A07 snapshot offer + A06 REQUIRES_REVIEW & retry-activation");
  setSepayEnv({});

  // ── A07: Manager sửa giá/duration/quota khi QR đang chờ → chốt theo ĐÚNG offer lúc tạo đơn ──
  const snapPlan = await createPlan(ctx.manager.token, {
    name: `E2E SEPAY SNAP ${RUN}`,
    price: 123000,
    durationDays: 30,
    tier: "MEMBERSHIP",
    maxConcurrentClasses: 3,
  });
  const co = await checkout(snapshotMember.token, snapPlan.id);
  check("A07: checkout plan snapshot → 201", co.status === 201, co.body);

  const edited = await http("PATCH", `/membership-plans/${snapPlan.id}`, {
    token: ctx.manager.token,
    body: {
      name: `E2E SEPAY SNAP EDITED ${RUN}`,
      price: 999999,
      durationDays: 60,
      maxConcurrentClasses: 1,
    },
  });
  check(
    "A07: manager sửa plan (999999 / 60 ngày / quota 1) → 200",
    edited.status === 200,
    edited.body
  );

  const payBody = webhookBody({
    transactionCode: co.body?.data?.orderCode,
    amount: co.body?.data?.amount, // = 123000: số tiền đã báo cho member lúc checkout
  });
  const paid = await sepayWebhook(payBody);
  check(
    "A07: webhook thanh toán đúng số tiền của offer cũ → PROCESSED",
    paid.status === 200 && (await sepayEvent(payBody.id as number))?.status === "PROCESSED",
    paid.body
  );

  const snapSub = await prisma.membershipSubscription.findFirst({
    where: { memberId: snapshotMember.memberProfileId, status: "ACTIVE" },
    include: { payments: { include: { invoice: true } } },
    orderBy: { createdAt: "desc" },
  });
  const snapDays = snapSub
    ? Math.round((snapSub.endDate.getTime() - snapSub.startDate.getTime()) / DAY)
    : 0;
  check(
    `A07: gói mới giữ đúng 30 ngày của offer cũ (${snapDays} ngày)`,
    snapDays >= 30 && snapDays <= 31,
    { start: snapSub?.startDate, end: snapSub?.endDate }
  );
  check(
    "A07: subscription giữ quota snapshot = 3 (không theo quota mới = 1)",
    snapSub?.maxConcurrentClassesSnapshot === 3,
    snapSub?.maxConcurrentClassesSnapshot
  );
  const snapInvoice = snapSub?.payments?.[0]?.invoice;
  check(
    `A07: hóa đơn = 123000 (tiền đã thu) & tên gói snapshot (total=${String(snapInvoice?.total)})`,
    Number(snapInvoice?.total) === 123000 && snapInvoice?.planName === `E2E SEPAY SNAP ${RUN}`,
    { total: snapInvoice?.total, planName: snapInvoice?.planName }
  );

  // ── A06: tiền về nhưng không thể kích hoạt (bị chặn hạ hạng) → REQUIRES_REVIEW ──
  const revCo = await checkout(reviewMember.token, ctx.plans.membership7.id);
  check("A06: checkout membership 7 ngày → 201", revCo.status === 201, revCo.body);
  const counterBuy = await http("POST", "/subscriptions", {
    token: ctx.manager.token,
    body: {
      memberId: reviewMember.memberProfileId,
      planId: ctx.plans.membership30.id,
      paymentMethod: "CASH",
    },
  });
  check("A06: manager bán gói MEMBERSHIP 30 ngày (quầy) → 201", counterBuy.status === 201, counterBuy.body);

  const revBody = webhookBody({
    transactionCode: revCo.body?.data?.orderCode,
    amount: revCo.body?.data?.amount,
  });
  const revPaid = await sepayWebhook(revBody);
  check(
    "A06: webhook tiền về nhưng chặn hạ hạng → PROCESSED / ACTIVATION_REJECTED",
    revPaid.status === 200 &&
      (await sepayEvent(revBody.id as number))?.reason === "ACTIVATION_REJECTED",
    revPaid.body
  );
  const revPayment = await prisma.payment.findFirst({
    where: { transactionCode: revCo.body?.data?.orderCode as string },
  });
  check(
    "A06: Payment = SUCCESS (tiền đã thu) + activationStatus = REQUIRES_REVIEW",
    revPayment?.status === "SUCCESS" && revPayment?.activationStatus === "REQUIRES_REVIEW",
    {
      status: revPayment?.status,
      activationStatus: revPayment?.activationStatus,
      reason: revPayment?.reviewReason,
    }
  );

  const revView = await getCheckout(reviewMember.token, revPayment!.id);
  check(
    "A06: FE thấy requiresReview = true (không báo 'đã kích hoạt')",
    revView.body?.data?.status === "SUCCESS" && revView.body?.data?.requiresReview === true,
    revView.body?.data
  );

  // Xử lý: manager suspend gói đang chặn hạ hạng → retry kích hoạt.
  const counterSubId = counterBuy.body?.data?.subscription?.id as string | undefined;
  const suspend = await http("PATCH", `/subscriptions/${counterSubId}/status`, {
    token: ctx.manager.token,
    body: { status: "SUSPENDED" },
  });
  check("A06: manager suspend gói chặn hạ hạng → 200", suspend.status === 200, suspend.body);

  const retry = await http("POST", `/payments/${revPayment!.id}/retry-activation`, {
    token: ctx.manager.token,
  });
  check("A06: retry-activation → 200", retry.status === 200, retry.body);

  const afterRetry = await prisma.payment.findUnique({ where: { id: revPayment!.id } });
  const retrySub = afterRetry?.subscriptionId
    ? await prisma.membershipSubscription.findUnique({ where: { id: afterRetry.subscriptionId } })
    : null;
  const retryDays = retrySub
    ? Math.round((retrySub.endDate.getTime() - retrySub.startDate.getTime()) / DAY)
    : 0;
  check(
    `A06: retry cấp gói đúng offer 7 ngày (${retryDays} ngày) + ACTIVATED + có người duyệt`,
    afterRetry?.activationStatus === "ACTIVATED" &&
      afterRetry?.reviewReason === null &&
      Boolean(afterRetry?.reviewedById) &&
      retryDays >= 7 &&
      retryDays <= 8,
    {
      activationStatus: afterRetry?.activationStatus,
      reviewReason: afterRetry?.reviewReason,
      retryDays,
    }
  );
}

/**
 * L) A14 — ledger ngân hàng (1 movement = 1 lần cấp gói, nội dung mơ hồ bị từ chối)
 *    + F01 — notification đi qua outbox (rollback không gửi, commit thì SENT).
 */
async function scenarioBankLedgerAndOutbox(
  ctx: Ctx,
  memberA: FixtureUser,
  memberB: FixtureUser,
  outboxMember: FixtureUser
): Promise<void> {
  section("L) A14 bank ledger + F01 notification outbox");
  setSepayEnv({});

  // ── L1) Cùng MỘT movement (referenceCode) không thể cấp gói cho hai payment ──────────
  const coA = await checkout(memberA.token, ctx.plans.membership30.id);
  const coB = await checkout(memberB.token, ctx.plans.membership30.id);
  check(
    "A14: 2 checkout PENDING khác member → 201",
    coA.status === 201 && coB.status === 201,
    { a: coA.status, b: coB.status }
  );

  const sharedRef = `FT-E2E-SHARED-${RUN}`;
  const firstBody = webhookBody(
    { transactionCode: coA.body?.data?.orderCode, amount: coA.body?.data?.amount },
    { referenceCode: sharedRef }
  );
  const firstRes = await sepayWebhook(firstBody);
  check(
    "A14: webhook đầu (movement M) → PROCESSED, đơn A được cấp gói",
    firstRes.status === 200 && (await sepayEvent(firstBody.id as number))?.status === "PROCESSED",
    firstRes.body
  );

  const secondBody = webhookBody(
    { transactionCode: coB.body?.data?.orderCode, amount: coB.body?.data?.amount },
    { referenceCode: sharedRef }
  );
  const secondRes = await sepayWebhook(secondBody);
  const secondEvent = await sepayEvent(secondBody.id as number);
  check(
    "A14: cùng movement M cho đơn B → MISMATCH / BANK_TX_ALREADY_ALLOCATED",
    secondRes.status === 200 &&
      secondEvent?.status === "MISMATCH" &&
      secondEvent?.reason === "BANK_TX_ALREADY_ALLOCATED",
    secondEvent
  );

  const payA = await prisma.payment.findFirst({
    where: { transactionCode: coA.body?.data?.orderCode as string },
  });
  const payB = await prisma.payment.findFirst({
    where: { transactionCode: coB.body?.data?.orderCode as string },
  });
  check(
    "A14: đơn B vẫn PENDING & KHÔNG có subscription (không cấp gói lần hai)",
    payB?.status === "PENDING" && payB?.subscriptionId === null,
    { status: payB?.status, subscriptionId: payB?.subscriptionId }
  );
  const ledgerShared = await prisma.sepayBankTransaction.findMany({ where: { referenceCode: sharedRef } });
  check(
    "A14: ledger có ĐÚNG 1 movement cho reference đó và đã phân bổ cho đơn A",
    ledgerShared.length === 1 && ledgerShared[0].paymentId === payA?.id,
    { count: ledgerShared.length, paymentId: ledgerShared[0]?.paymentId }
  );

  // ── L2) Nội dung chứa HAI mã đơn khác nhau → từ chối, không đoán ────────────────────
  const coC = await checkout(memberB.token, ctx.plans.membership7.id);
  check("A14: checkout thứ hai (cùng member, plan khác) → 201", coC.status === 201, coC.body);

  const ambBody = webhookBody(
    { transactionCode: null, amount: coC.body?.data?.amount },
    {
      code: null,
      referenceCode: `FT-E2E-AMB-${RUN}`,
      content: `${coB.body?.data?.orderCode} va ${coC.body?.data?.orderCode} chuyen tien`,
    }
  );
  const ambRes = await sepayWebhook(ambBody);
  const ambEvent = await sepayEvent(ambBody.id as number);
  check(
    "A14: nội dung chứa 2 mã đơn → MISMATCH / CONTENT_AMBIGUOUS",
    ambRes.status === 200 &&
      ambEvent?.status === "MISMATCH" &&
      ambEvent?.reason === "CONTENT_AMBIGUOUS",
    ambEvent
  );
  const payBAfter = await prisma.payment.findUnique({ where: { id: payB!.id } });
  const payC = await prisma.payment.findFirst({
    where: { transactionCode: coC.body?.data?.orderCode as string },
  });
  check(
    "A14: cả hai đơn trong nội dung mơ hồ vẫn PENDING",
    payBAfter?.status === "PENDING" && payC?.status === "PENDING",
    { b: payBAfter?.status, c: payC?.status }
  );
  const ledgerAmb = await prisma.sepayBankTransaction.findFirst({
    where: { referenceCode: `FT-E2E-AMB-${RUN}` },
  });
  check(
    "A14: movement mơ hồ được ghi ledger nhưng KHÔNG phân bổ",
    ledgerAmb !== null && ledgerAmb.paymentId === null,
    { paymentId: ledgerAmb?.paymentId }
  );

  // ── L3) F01 — outbox: rollback không gửi, commit thì SENT ───────────────────────────
  const markerRollback = `F01-ROLLBACK-${RUN}`;
  let rolledBack = false;
  try {
    await prisma.$transaction(async (tx) => {
      await enqueueNotification(tx, {
        userId: outboxMember.id,
        type: "GENERAL",
        title: markerRollback,
        body: markerRollback,
      });
      throw new Error("force-rollback");
    });
  } catch {
    rolledBack = true;
  }
  check(
    "F01: transaction rollback → KHÔNG có outbox row & KHÔNG có notification",
    rolledBack &&
      (await prisma.notificationOutbox.count({ where: { title: markerRollback } })) === 0 &&
      (await prisma.notification.count({
        where: { userId: outboxMember.id, title: markerRollback },
      })) === 0
  );

  const markerCommit = `F01-COMMIT-${RUN}`;
  await prisma.$transaction(async (tx) => {
    await enqueueNotification(tx, {
      userId: outboxMember.id,
      type: "GENERAL",
      title: markerCommit,
      body: markerCommit,
    });
  });
  const flushed = await flushNotificationOutbox();
  const outboxRow = await prisma.notificationOutbox.findFirst({ where: { title: markerCommit } });
  const notifRow = await prisma.notification.findFirst({
    where: { userId: outboxMember.id, title: markerCommit },
  });
  check(
    "F01: commit + flush → outbox SENT và notification đã được gửi",
    flushed >= 1 && outboxRow?.status === "SENT" && Boolean(notifRow),
    { flushed, status: outboxRow?.status, hasNotification: Boolean(notifRow) }
  );

  // Notification của giao dịch SePay vừa chốt cũng đi qua outbox (đã SENT).
  const paymentOutbox = await prisma.notificationOutbox.findFirst({
    where: { userId: memberA.id, type: "PAYMENT_SUCCESS", status: "SENT" },
  });
  check(
    "F01: PAYMENT_SUCCESS của activation đi qua outbox (SENT)",
    Boolean(paymentOutbox),
    paymentOutbox ? { status: paymentOutbox.status, attempts: paymentOutbox.attempts } : null
  );
}

// ─── Cleanup + runner ─────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  const memberIds = created.memberProfileIds;
  const payments = memberIds.length
    ? await prisma.payment.findMany({
        where: { memberId: { in: memberIds } },
        select: { id: true },
      })
    : [];
  const paymentIds = payments.map((p) => p.id);

  if (created.userIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } });
    // F01: outbox cũng dọn theo user fixture.
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: created.userIds } } });
  }
  // A14: ledger ngân hàng (FK paymentId SetNull nên phải xoá trước Payment).
  if (sentSepayIds.length > 0 || paymentIds.length > 0) {
    await prisma.sepayBankTransaction.deleteMany({
      where: { OR: [{ sepayId: { in: sentSepayIds } }, { paymentId: { in: paymentIds } }] },
    });
  }
  // SepayWebhookEvent: xoá theo sepayId đã gửi (kể cả webhook mã đơn lạ không có paymentId)
  // và theo paymentId (webhook của fixture) — FK onDelete SetNull nên phải xoá tường minh.
  if (sentSepayIds.length > 0 || paymentIds.length > 0) {
    await prisma.sepayWebhookEvent.deleteMany({
      where: { OR: [{ sepayId: { in: sentSepayIds } }, { paymentId: { in: paymentIds } }] },
    });
  }
  if (memberIds.length > 0) {
    // FK: Invoice → Payment → MembershipSubscription → MemberProfile.
    await prisma.invoice.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.membershipSubscription.deleteMany({ where: { memberId: { in: memberIds } } });
  }
  if (created.planIds.length > 0) {
    await prisma.membershipPlan.deleteMany({ where: { id: { in: created.planIds } } });
  }
  if (created.userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
}

async function main(): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`E2E sepay-payment suite — run=${RUN} | api=${baseUrl}/api/v1`);

  const hashed = await hashPassword(PASSWORD);

  try {
    const manager = await createUser("MANAGER", "manager", hashed);
    const coach = await createUser("COACH", "coach", hashed);
    const staff = await createUser("STAFF", "staff", hashed);
    const members: FixtureUser[] = [];
    for (let i = 1; i <= 12; i++) members.push(await createUser("MEMBER", `member${i}`, hashed));

    const membership30 = await createPlan(manager.token, {
      name: `E2E SEPAY M30 ${RUN}`,
      price: 300000,
      durationDays: 30,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 3,
    });
    const membership7 = await createPlan(manager.token, {
      name: `E2E SEPAY M7 ${RUN}`,
      price: 100000,
      durationDays: 7,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 3,
    });
    const premium90 = await createPlan(manager.token, {
      name: `E2E SEPAY P90 ${RUN}`,
      price: 900000,
      durationDays: 90,
      tier: "PREMIUM",
      maxConcurrentClasses: 6,
    });

    const freePlan = await prisma.membershipPlan.findFirst({
      where: { tier: "FREE", isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!freePlan) throw new Error("Không tìm thấy FREE plan trong DB");

    const ctx: Ctx = { manager, plans: { membership30, membership7, premium90 } };

    await scenarioNotConfigured(members[3], membership30);
    await scenarioCheckoutAndWebhookCore(ctx, members[0], members[1], coach, membership30);
    await scenarioMockMode(ctx, members[1], members[0], coach, manager, membership30);
    await scenarioExpiredPendingAndLate(members[2], membership30);
    await scenarioGuardsAndUpgrade(ctx, members[0], freePlan.id);
    await scenarioFreePlanNoCarryOver(ctx, members[4], members[5], members[6]);
    await scenarioAuthorization(ctx, staff, coach);
    await scenarioHmacAuth(members[3], membership30);
    await scenarioReconcileViaApi(membership30, premium90);
    await scenarioOfferSnapshotAndReview(ctx, members[7], members[8]);
    await scenarioBankLedgerAndOutbox(ctx, members[9], members[10], members[11]);
  } catch (err) {
    failures.push(`Lỗi không mong đợi: ${(err as Error).message}`);
    console.error("\nUNEXPECTED ERROR:", err);
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      await cleanup();
      console.log("  Đã dọn sạch fixture E2E.");
    } catch (err) {
      failures.push(`Cleanup thất bại: ${(err as Error).message}`);
      console.error("  Cleanup thất bại:", err);
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log("\n=== KẾT QUẢ ===");
  console.log(`PASS: ${passed} | FAIL: ${failures.length}`);
  if (failures.length > 0) {
    console.log("\nDanh sách FAIL:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});








