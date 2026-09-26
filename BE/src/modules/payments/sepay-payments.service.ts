import { randomUUID } from "node:crypto";
import { MembershipPlan, Payment, Prisma, SepayWebhookStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import {
  buildSepayPaymentCode,
  buildVietQrUrl,
  extractPaymentCodeFromContent,
  isSepayApiConfigured,
  isSepayConfigured,
  isSepayWebhookConfigured,
  normalizeBankAccount,
  sepayConfig,
  verifySepayApiKey,
  verifySepayHmacSignature,
} from "../../config/sepay.js";
import { fetchSepayTransactionsByCode } from "./sepay-api.client.js";
import { lockPaymentWebhook } from "../../utils/dbLocks.js";
import { createNotification } from "../notifications/notifications.service.js";
import {
  activateSubscriptionForPayment,
  inspectPlanPurchase,
  planAmount,
} from "../subscriptions/subscription-purchase.service.js";
import type { SepayWebhookBody } from "./payments.schema.js";

export const SEPAY_GATEWAY = "SEPAY";
/** Error code 409 khi hội viên còn giao dịch SePay đang chờ cho cùng gói. */
export const SEPAY_PENDING_CODE = "SEPAY_PAYMENT_PENDING";

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

function sepayExpiresAt(payment: Payment, ttlMinutes: number): Date {
  return new Date(payment.createdAt.getTime() + ttlMinutes * 60 * 1000);
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/** Số tiền VND (số nguyên) — Decimal của Prisma trả về string. */
function money(value: unknown): number {
  return Math.round(Number(value));
}

export interface SepayCheckoutView {
  paymentId: string;
  /** Mã đơn = mã thanh toán SePay bóc tách từ nội dung CK (VD SEVQR12345678). */
  orderCode: string;
  amount: number;
  currency: "VND";
  status: string;
  gateway: typeof SEPAY_GATEWAY;
  expiresAt: Date;
  /** Ảnh VietQR động: đã kèm số tài khoản, số tiền và nội dung chuyển khoản. */
  qrUrl: string;
  /** Nội dung chuyển khoản hội viên phải giữ nguyên (= orderCode). */
  transferContent: string;
  bank: {
    /** short_name/alias/code/BIN theo banks.json của SePay. */
    id: string;
    accountNumber: string;
    accountHolder: string;
  };
  plan?: { id: string; name: string; tier: string; durationDays: number };
}

function buildSepayCheckoutView(payment: Payment, plan: MembershipPlan | null): SepayCheckoutView {
  const cfg = sepayConfig();
  const orderCode = payment.transactionCode ?? "";
  const amount = money(payment.amount);
  return {
    paymentId: payment.id,
    orderCode,
    amount,
    currency: "VND",
    status: payment.status,
    gateway: SEPAY_GATEWAY,
    expiresAt: sepayExpiresAt(payment, cfg.ttlMinutes),
    qrUrl: buildVietQrUrl({ amount, content: orderCode }),
    transferContent: orderCode,
    bank: {
      id: cfg.bankId,
      accountNumber: cfg.accountNo,
      accountHolder: cfg.accountHolder,
    },
    ...(plan
      ? { plan: { id: plan.id, name: plan.name, tier: plan.tier, durationDays: plan.durationDays } }
      : {}),
  };
}

/**
 * MEMBER tự tạo giao dịch mua gói bằng chuyển khoản VietQR (SePay).
 *
 * Luồng: kiểm tra gói + luật đổi gói (fail fast) → tạo `Payment` PENDING (method SEPAY,
 * gateway SEPAY, `planId` = gói muốn mua, `transactionCode` = mã thanh toán riêng) →
 * trả ảnh QR + số tài khoản + số tiền + nội dung CK cho FE hiển thị.
 * Gói CHỈ được kích hoạt khi SePay gửi webhook xác nhận ĐÃ THU TIỀN.
 *
 * - 400: gói FREE / hội viên không hợp lệ / hạ hạng hoặc giảm số ngày cùng hạng.
 * - 403/404: không phải MEMBER đang hoạt động / không thấy gói.
 * - 409 `SEPAY_PAYMENT_PENDING`: còn giao dịch PENDING cùng gói chưa quá TTL (trả kèm QR để FE tiếp tục).
 * - 503: chưa cấu hình tài khoản nhận tiền (VIETQR_BANK_ID / VIETQR_ACCOUNT_NO).
 */
export async function createSepayCheckout(userId: string, planId: string) {
  const cfg = sepayConfig();

  if (!isSepayConfigured()) {
    throw new AppError(
      "Cổng thanh toán SePay chưa được cấu hình. Vui lòng thanh toán tại quầy hoặc liên hệ quản lý.",
      503,
      { code: "SEPAY_NOT_CONFIGURED", gateway: SEPAY_GATEWAY }
    );
  }

  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
    include: { user: { select: { id: true, fullName: true, isActive: true, role: true } } },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot checkout: user is not an active MEMBER", 400);
  }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new AppError("Membership plan not found or inactive", 404);
  if (plan.tier === "FREE" || planAmount(plan) <= 0) {
    throw new AppError(
      "Gói FREE không cần thanh toán. Vui lòng chọn gói MEMBERSHIP hoặc PREMIUM.",
      400
    );
  }

  // Fail fast: chặn hạ hạng / cùng hạng ít ngày hơn TRƯỚC khi tạo giao dịch.
  await inspectPlanPurchase(prisma, memberProfile.id, plan);

  const now = new Date();

  // Mỗi (member, gói) chỉ có 1 giao dịch SePay đang chờ → tránh chuyển tiền 2 lần cho cùng mục đích.
  const pending = await prisma.payment.findFirst({
    where: {
      memberId: memberProfile.id,
      planId: plan.id,
      method: "SEPAY",
      gateway: SEPAY_GATEWAY,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    const expiresAt = sepayExpiresAt(pending, cfg.ttlMinutes);
    if (expiresAt.getTime() > now.getTime()) {
      throw new AppError(
        `Bạn đang có giao dịch chuyển khoản chờ thanh toán cho gói "${plan.name}". ` +
          `Vui lòng hoàn tất hoặc thử lại sau ${Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 60000))} phút.`,
        409,
        {
          code: SEPAY_PENDING_CODE,
          ...buildSepayCheckoutView(pending, plan),
        }
      );
    }
    // Quá TTL: đóng giao dịch cũ để mở giao dịch mới (tiền về muộn sẽ được ghi nhận đối soát).
    await prisma.payment.update({
      where: { id: pending.id },
      data: {
        status: "FAILED",
        note: "Hết hạn chờ thanh toán chuyển khoản — giao dịch bị đóng để tạo giao dịch mới.",
      },
    });
  }

  const amount = planAmount(plan);

  // Mã thanh toán riêng: UNIQUE transactionCode bảo đảm không trùng; retry khi va chạm cực hiếm.
  let payment: Payment | null = null;
  for (let attempt = 0; attempt < 5 && !payment; attempt++) {
    const orderCode = buildSepayPaymentCode(cfg);
    const qrUrl = buildVietQrUrl({ amount, content: orderCode });
    try {
      payment = await prisma.payment.create({
        data: {
          memberId: memberProfile.id,
          planId: plan.id,
          amount,
          method: "SEPAY",
          status: "PENDING",
          transactionCode: orderCode,
          gateway: SEPAY_GATEWAY,
          note: `Thanh toán online gói ${plan.name} (chuyển khoản VietQR qua SePay)`,
          gatewayPayload: asJson({
            provider: SEPAY_GATEWAY,
            orderCode,
            qrUrl,
            transferContent: orderCode,
            bankId: cfg.bankId,
            accountNo: cfg.accountNo,
          }),
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (!payment) {
    throw new AppError("Không tạo được mã thanh toán (trùng mã). Vui lòng thử lại.", 500, {
      code: "SEPAY_CODE_COLLISION",
      gateway: SEPAY_GATEWAY,
    });
  }

  return buildSepayCheckoutView(payment, plan);
}

/**
 * FE polling trạng thái giao dịch (sau khi webhook về, gói được kích hoạt):
 * trả lại đúng thông tin QR để FE hiển thị lại + status/subscriptionId.
 * Quyền: chủ giao dịch (MEMBER) hoặc MANAGER/STAFF; COACH bị chặn.
 *
 * Nếu đơn còn PENDING và đã cấu hình `SEPAY_API_TOKEN`, BE đối soát chủ động qua SePay API
 * (webhook không tới được server: localhost, server downtime, hết retry ~33 phút) để đơn
 * chuyển SUCCESS ngay trong lần polling này — lỗi đối soát KHÔNG làm hỏng response.
 */
export async function getSepayCheckout(userId: string, role: string, paymentId: string) {
  let payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.gateway !== SEPAY_GATEWAY) {
    throw new AppError("SePay payment not found", 404);
  }
  await assertSepayPaymentOperator(userId, role, payment);

  if (payment.status === "PENDING" && isSepayApiConfigured()) {
    try {
      await reconcileSepayPayment(payment.id);
      payment = (await prisma.payment.findUnique({ where: { id: payment.id } })) ?? payment;
    } catch (err) {
      // Đối soát là kênh dự phòng — webhook vẫn là nguồn chính nên không được chặn FE polling.
      console.warn(
        `[SEPAY RECONCILE] Không đối soát được đơn ${payment.transactionCode ?? payment.id}: ${(err as Error).message}`
      );
    }
  }

  const plan = payment.planId
    ? await prisma.membershipPlan.findUnique({ where: { id: payment.planId } })
    : null;

  return {
    ...buildSepayCheckoutView(payment, plan),
    planId: payment.planId,
    paidAt: payment.paidAt,
    subscriptionId: payment.subscriptionId,
  };
}

/**
 * Chỉ chủ giao dịch (MEMBER) hoặc MANAGER/STAFF được thao tác trên một giao dịch SePay.
 * COACH bị chặn hoàn toàn (không liên quan nghiệp vụ thanh toán).
 */
async function assertSepayPaymentOperator(
  userId: string,
  role: string,
  payment: Payment
): Promise<void> {
  if (role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!memberProfile || memberProfile.id !== payment.memberId) {
      throw new AppError("Forbidden: You can only operate on your own SePay payment", 403);
    }
    return;
  }
  if (role === "MANAGER" || role === "STAFF") return;
  throw new AppError(
    "Forbidden: only the owning MEMBER or MANAGER/STAFF can operate on a SePay payment",
    403
  );
}

// ─── XỬ LÝ WEBHOOK ───────────────────────────────────────────────────────────

type Settlement = {
  status: SepayWebhookStatus;
  reason?: string;
  paymentId: string | null;
  memberId: string | null;
  paymentStatus: string | null;
  processed: boolean;
  subscriptionId?: string;
};

export interface SepayWebhookOutcome {
  /** `id` số nguyên của webhook SePay; `null` khi chốt qua đối soát API (API dùng UUID). */
  sepayId: number | null;
  orderCode: string | null;
  paymentId: string | null;
  processed: boolean;
  status: SepayWebhookStatus;
  reason?: string;
  paymentStatus?: string | null;
  subscriptionId?: string;
  mock?: boolean;
}

/** Nguồn của một khoản tiền vào: webhook SePay, mock DEV/CHỦ ĐÍCH hay đối soát chủ động qua API. */
type SettleSource = "WEBHOOK" | "MOCK" | "RECONCILE";

/**
 * Dữ liệu một khoản tiền vào đã được xác thực để chốt đơn.
 * `id` chỉ có ở webhook/mock (khoá chống trùng của bảng `SepayWebhookEvent`); giao dịch lấy từ
 * SePay API v2 dùng UUID nên chống trùng dựa trên `Payment.status` + advisory lock.
 */
type TransferInput = {
  gateway?: string;
  transactionDate?: string;
  accountNumber: string;
  subAccount: string;
  code?: string | null;
  content: string;
  transferType: string;
  description: string;
  transferAmount: number;
  accumulated: number;
  referenceCode: string;
  id?: number;
  /** UUID giao dịch SePay API v2 — lưu vào `gatewayPayload` để đối soát. */
  apiTransactionId?: string;
};

/**
 * WEBHOOK (server-to-server) do SePay gọi mỗi khi phát hiện giao dịch ngân hàng.
 *
 * Kiểm tra theo thứ tự:
 * 1. Xác thực (chọn 1 trong 2 theo cấu hình my.sepay.vn):
 *    a. HMAC-SHA256: request có `X-SePay-Signature` + `X-SePay-Timestamp` ⇒ verify
 *       `sha256=hex(HMAC(secret, "{timestamp}.{rawBody}"))` bằng `SEPAY_WEBHOOK_SECRET`.
 *    b. API Key: `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>` (fallback khi không có chữ ký).
 *    Sai/thiếu ⇒ 401 (SePay sẽ retry, cần sửa cấu hình).
 * 2. Là TIỀN VÀO (`transferType = in`) — tiền ra ⇒ ack & bỏ qua.
 * 3. Mã đơn: `payload.code` (SePay bóc tách) hoặc tự tìm trong `content` theo tiền tố ⇒ không khớp ⇒ ack & bỏ qua.
 * 4. Số tài khoản nhận tiền (hoặc VA) phải đúng tài khoản của trung tâm.
 * 5. Số tiền phải khớp CHÍNH XÁC số tiền của đơn.
 * 6. Chống trùng: `sepayId` UNIQUE (SePay retry/replay không xử lý lại) + giao dịch đã SUCCESS ⇒ duplicate.
 * 7. Hợp lệ ⇒ kích hoạt `MembershipSubscription` + `Invoice` + notification (cùng transaction với claim webhook).
 *
 * - 401 `SEPAY_INVALID_SIGNATURE` / `SEPAY_INVALID_API_KEY`: xác thực sai (không xử lý gì).
 * - 503 `SEPAY_NOT_CONFIGURED`: server chưa có API key/secret/tài khoản nhận tiền.
 * Mọi trường hợp khác (kể cả lệch tiền/lệch tài khoản) đều ACK 200 `{ success: true }`
 * để SePay không retry vô hạn — dữ liệu được lưu ở `SepayWebhookEvent` để đối soát thủ công.
 */
export async function handleSepayWebhook(input: {
  authHeader: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: Buffer | undefined;
  body: SepayWebhookBody;
}): Promise<SepayWebhookOutcome> {
  const { authHeader, signature, timestamp, rawBody, body } = input;
  const cfg = sepayConfig();
  if (!isSepayWebhookConfigured()) {
    throw new AppError(
      "Webhook SePay chưa được cấu hình (thiếu SEPAY_WEBHOOK_API_KEY / SEPAY_WEBHOOK_SECRET).",
      503,
      {
        code: "SEPAY_NOT_CONFIGURED",
        gateway: SEPAY_GATEWAY,
      }
    );
  }
  if (signature) {
    // Phương thức HMAC-SHA256 (SePay gửi chữ ký) — phải có secret thì mới verify được.
    if (
      !cfg.webhookSecret ||
      !verifySepayHmacSignature({ secret: cfg.webhookSecret, rawBody, signature, timestamp })
    ) {
      throw new AppError("Chữ ký webhook SePay không hợp lệ.", 401, {
        code: "SEPAY_INVALID_SIGNATURE",
        gateway: SEPAY_GATEWAY,
        sepayId: body.id,
      });
    }
  } else if (!verifySepayApiKey(authHeader, cfg.webhookApiKey)) {
    // Phương thức API Key (không có chữ ký HMAC) — verify Authorization như cũ.
    throw new AppError("API key webhook SePay không hợp lệ.", 401, {
      code: "SEPAY_INVALID_API_KEY",
      gateway: SEPAY_GATEWAY,
      sepayId: body.id,
    });
  }
  return settleSepayTransfer(body, "WEBHOOK");
}

/**
 * DEV/DEMO/E2E: mô phỏng SePay gửi webhook "đã thu tiền" mà không cần chuyển khoản thật.
 * Chỉ hoạt động khi `SEPAY_MOCK_MODE=true`; MEMBER chỉ xác nhận được giao dịch CỦA MÌNH,
 * MANAGER/STAFF được phép xác nhận hộ (VD demo tại lớp).
 */
export async function mockConfirmSepayPayment(
  userId: string,
  role: string,
  paymentId: string
): Promise<SepayWebhookOutcome> {
  const cfg = sepayConfig();
  if (!cfg.mockMode) {
    throw new AppError(
      "Chế độ mô phỏng SePay đang tắt (đặt SEPAY_MOCK_MODE=true ở môi trường dev).",
      403,
      { code: "SEPAY_MOCK_DISABLED", gateway: SEPAY_GATEWAY }
    );
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.gateway !== SEPAY_GATEWAY) {
    throw new AppError("SePay payment not found", 404);
  }
  await assertSepayPaymentOperator(userId, role, payment);

  const now = new Date();
  const body: SepayWebhookBody = {
    id: mockSepayId(),
    gateway: cfg.bankId || "MOCK",
    transactionDate: formatVnDateTime(now),
    accountNumber: cfg.accountNo || "MOCK_ACCOUNT",
    subAccount: "",
    code: payment.transactionCode,
    content: `${payment.transactionCode ?? payment.id} MOCK SEPAY`,
    transferType: "in",
    description: "Mock SePay transfer",
    transferAmount: money(payment.amount),
    accumulated: 0,
    referenceCode: `MOCK-${now.getTime()}`,
  };

  return settleSepayTransfer(body, "MOCK");
}

/** Random 32-bit dương cho `sepayId` giả lập (UNIQUE, không đụng dữ liệu thật của SePay). */
function mockSepayId(): number {
  return 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
}

/** Định dạng `YYYY-MM-DD HH:mm:ss` theo giờ Việt Nam (UTC+7) giống payload SePay. */
function formatVnDateTime(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} ` +
    `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}`
  );
}

// ─── ĐỐI SOÁT CHỦ ĐỘNG QUA SEPAY API ────────────────────────────────────────

/** Throttle theo đơn + gộp request song song (SePay giới hạn 3 request/giây). */
const lastReconcileAt = new Map<string, number>();
const inflightReconcile = new Map<string, Promise<SepayWebhookOutcome | null>>();

/**
 * ĐỐI SOÁT CHỦ ĐỘNG (fallback khi webhook không tới được BE): gọi SePay API v2 tìm giao dịch
 * tiền vào khớp mã đơn + số tiền + tài khoản nhận, thấy thì chốt đơn qua đúng luồng kích hoạt gói.
 *
 * Vì sao cần: SePay chỉ retry webhook 7 lần trong ~33 phút; BE chạy localhost, server downtime
 * hoặc URL webhook chưa cấu hình ⇒ webhook mất, đơn đứng PENDING mãi dù tiền đã vào. Hàm này được
 * gọi trong `getSepayCheckout` (FE polling mỗi 4s) nên đơn tự chuyển SUCCESS ngay khi tiền vào.
 *
 * - Chỉ chạy khi có `SEPAY_API_TOKEN`; throttle `reconcileMinSeconds` + gộp request song song.
 * - Khớp CHẶT: mã đơn xuất hiện trong `code`/nội dung CK/reference, `transfer_type = in`,
 *   số tiền khớp CHÍNH XÁC, tài khoản nhận (hoặc VA) khớp `VIETQR_ACCOUNT_NO`. Lệch tiền/tài khoản
 *   thì KHÔNG chốt ở đây — để webhook ghi nhận MISMATCH cho đối soát thủ công.
 * - Chống chốt trùng: `Payment.status` + advisory lock trong `settleSepayTransfer`; webhook thật
 *   về muộn sau đó được ghi `DUPLICATE / PAYMENT_ALREADY_PAID` để đối soát.
 */
export async function reconcileSepayPayment(
  paymentId: string
): Promise<SepayWebhookOutcome | null> {
  const cfg = sepayConfig();
  if (!cfg.apiToken) return null;

  const inflight = inflightReconcile.get(paymentId);
  if (inflight) return inflight; // nhiều request polling cùng lúc ⇒ dùng chung 1 lần gọi API.

  const lastAt = lastReconcileAt.get(paymentId) ?? 0;
  if (Date.now() - lastAt < cfg.reconcileMinSeconds * 1000) return null;

  lastReconcileAt.set(paymentId, Date.now());
  const task = runSepayReconcile(paymentId).finally(() => {
    inflightReconcile.delete(paymentId);
    if (lastReconcileAt.size > 1000) lastReconcileAt.clear(); // chống phình Map ở server chạy dài.
  });
  inflightReconcile.set(paymentId, task);
  return task;
}

/** Một lượt đối soát: tìm giao dịch khớp đơn trong cửa sổ thời gian của đơn rồi chốt. */
async function runSepayReconcile(paymentId: string): Promise<SepayWebhookOutcome | null> {
  const cfg = sepayConfig();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.gateway !== SEPAY_GATEWAY || payment.status !== "PENDING") return null;
  if (!payment.transactionCode) return null;

  // Cửa sổ tìm kiếm: từ lúc tạo đơn (trừ 10 phút cho lệch giờ) tới hiện tại (+10 phút).
  const transactions = await fetchSepayTransactionsByCode({
    code: payment.transactionCode,
    fromVnDateTime: formatVnDateTime(new Date(payment.createdAt.getTime() - 10 * 60 * 1000)),
    toVnDateTime: formatVnDateTime(new Date(Date.now() + 10 * 60 * 1000)),
  });

  const expectedAccount = normalizeBankAccount(cfg.accountNo);
  const orderCode = payment.transactionCode.toUpperCase();
  const match = transactions.find((tx) => {
    if (tx.transfer_type && tx.transfer_type !== "in") return false;
    const searchable =
      `${tx.code ?? ""} ${tx.transaction_content ?? ""} ${tx.reference_number ?? ""}`.toUpperCase();
    if (!searchable.includes(orderCode)) return false;
    if (money(tx.amount_in) !== money(payment.amount)) return false;
    return [tx.account_number, tx.va].some(
      (account) => normalizeBankAccount(account) === expectedAccount
    );
  });
  if (!match) return null;

  console.log(
    `[SEPAY RECONCILE] order=${payment.transactionCode} khớp giao dịch ` +
      `${match.reference_number ?? match.id} (${money(match.amount_in)}đ) → chốt đơn`
  );

  return settleSepayTransfer(
    {
      gateway: match.bank_brand_name ?? undefined,
      transactionDate: match.transaction_date ?? undefined,
      accountNumber: match.account_number ?? "",
      subAccount: match.va ?? "",
      code: match.code ?? payment.transactionCode,
      content: match.transaction_content ?? "",
      transferType: "in",
      description: match.transaction_content ?? "",
      transferAmount: money(match.amount_in),
      accumulated: money(match.accumulated ?? 0),
      referenceCode: match.reference_number ?? "",
      apiTransactionId: match.id,
    },
    "RECONCILE"
  );
}


/**
 * Chốt một giao dịch chuyển khoản đã được SePay xác nhận (webhook thật, mock, hoặc đối soát API).
 *
 * Toàn bộ nằm trong MỘT transaction:
 * - Claim `sepayId` bằng `INSERT … ON CONFLICT DO NOTHING` (chống trùng, an toàn khi 2 webhook
 *   cùng lúc: request thứ hai chờ request thứ nhất commit rồi nhận 0 dòng ⇒ DUPLICATE).
 *   Bỏ qua bước claim khi `source = "RECONCILE"` (giao dịch API dùng UUID, không có sepayId số).
 * - Advisory lock theo payment (2 webhook khác sepayId cho cùng một đơn phải xếp hàng).
 * - Claim + kiểm tra + kích hoạt gói cùng commit/rollback ⇒ SePay retry không bao giờ
 *   rơi vào trạng thái "đã đánh dấu xử lý nhưng chưa kích hoạt gói".
 */
async function settleSepayTransfer(
  body: TransferInput,
  source: SettleSource
): Promise<SepayWebhookOutcome> {
  const cfg = sepayConfig();
  if (!isSepayConfigured()) {
    throw new AppError(
      "Chưa cấu hình tài khoản nhận tiền SePay (VIETQR_BANK_ID / VIETQR_ACCOUNT_NO).",
      503,
      { code: "SEPAY_NOT_CONFIGURED", gateway: SEPAY_GATEWAY }
    );
  }

  const code =
    (body.code ?? "").trim().toUpperCase() || extractPaymentCodeFromContent(body.content, cfg);
  const drafted = code
    ? await prisma.payment.findFirst({
        where: { transactionCode: code, gateway: SEPAY_GATEWAY },
      })
    : null;

  const settlement = await prisma.$transaction(async (tx): Promise<Settlement> => {
    // (1) Claim sepayId — UNIQUE chống webhook trùng; 0 dòng = đã xử lý trước đó.
    // Chỉ webhook/mock mới có sepayId số; đối soát API dựa vào Payment.status + advisory lock bên dưới.
    if (source !== "RECONCILE") {
      if (body.id === undefined) {
        throw new AppError("Thiếu mã giao dịch SePay (id) để chốt đơn.", 400, {
          code: "SEPAY_ID_MISSING",
          gateway: SEPAY_GATEWAY,
        });
      }
      const claimed = await tx.$executeRaw`
        INSERT INTO "SepayWebhookEvent" ("id", "sepayId", "paymentId", "status", "payload", "createdAt")
        VALUES (${randomUUID()}, ${body.id}, ${drafted?.id ?? null}, 'PENDING', ${JSON.stringify(body)}::jsonb, NOW())
        ON CONFLICT ("sepayId") DO NOTHING
      `;
      if (claimed === 0) {
        return {
          status: "DUPLICATE",
          reason: "WEBHOOK_DUPLICATE",
          paymentId: drafted?.id ?? null,
          memberId: drafted?.memberId ?? null,
          paymentStatus: drafted?.status ?? null,
          processed: false,
        };
      }
    }

    /** Ghi trạng thái cuối của webhook rồi trả kết quả cho caller. */
    const finish = async (params: {
      status: SepayWebhookStatus;
      reason?: string;
      paymentId?: string | null;
      memberId?: string | null;
      paymentStatus?: string | null;
      processed?: boolean;
      subscriptionId?: string;
    }): Promise<Settlement> => {
      if (source !== "RECONCILE") {
        await tx.sepayWebhookEvent.updateMany({
          where: { sepayId: body.id },
          data: {
            status: params.status,
            reason: params.reason ?? null,
            ...(params.paymentId !== undefined ? { paymentId: params.paymentId } : {}),
          },
        });
      }
      return {
        status: params.status,
        reason: params.reason,
        paymentId: params.paymentId ?? null,
        memberId: params.memberId ?? null,
        paymentStatus: params.paymentStatus ?? null,
        processed: params.processed ?? false,
        subscriptionId: params.subscriptionId,
      };
    };

    // (2) Chỉ xử lý TIỀN VÀO; tiền ra ack & bỏ qua.
    if (body.transferType !== "in") {
      return finish({
        status: "IGNORED",
        reason: "OUT_TRANSFER",
        paymentId: drafted?.id ?? null,
        memberId: drafted?.memberId ?? null,
      });
    }

    // (3) Mã đơn phải thuộc hệ thống.
    if (!drafted) return finish({ status: "IGNORED", reason: "ORDER_NOT_FOUND" });

    // Serialize theo payment: nhiều webhook cho cùng một đơn phải xếp hàng.
    await lockPaymentWebhook(tx, drafted.id);
    const payment = await tx.payment.findUnique({ where: { id: drafted.id } });
    if (!payment) {
      return finish({ status: "IGNORED", reason: "ORDER_NOT_FOUND" });
    }

    // (4) Số tài khoản nhận tiền (hoặc VA) phải khớp cấu hình của trung tâm.
    const expectedAccount = normalizeBankAccount(cfg.accountNo);
    const receivedAccounts = [
      normalizeBankAccount(body.accountNumber),
      normalizeBankAccount(body.subAccount),
    ];
    if (!receivedAccounts.includes(expectedAccount)) {
      return finish({
        status: "MISMATCH",
        reason: "ACCOUNT_MISMATCH",
        paymentId: payment.id,
        memberId: payment.memberId,
        paymentStatus: payment.status,
      });
    }

    // (5) Số tiền phải khớp CHÍNH XÁC (chuyển thiếu/thừa đều cần đối soát thủ công).
    if (money(body.transferAmount) !== money(payment.amount)) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          note: `Chuyển khoản lệch số tiền (nhận ${money(body.transferAmount)} / cần ${money(payment.amount)}) — cần đối soát.`,
        },
      });
      return finish({
        status: "MISMATCH",
        reason: "AMOUNT_MISMATCH",
        paymentId: payment.id,
        memberId: payment.memberId,
        paymentStatus: payment.status,
      });
    }

    // (6) Giao dịch đã chốt trước đó (webhook khác sepayId) → không xử lý lại.
    if (payment.status === "SUCCESS") {
      return finish({
        status: "DUPLICATE",
        reason: "PAYMENT_ALREADY_PAID",
        paymentId: payment.id,
        memberId: payment.memberId,
        paymentStatus: "SUCCESS",
      });
    }

    const gatewayTransId = body.referenceCode?.trim() || String(body.id);
    const now = new Date();

    // (7) Tiền về khi giao dịch đã đóng (hết hạn/thất bại) → ghi nhận đối soát, KHÔNG kích hoạt.
    if (payment.status !== "PENDING") {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          gatewayTransId,
          gatewayPayload: asJson({
            ...((payment.gatewayPayload ?? {}) as Record<string, unknown>),
            lateResult: body,
          }),
          note: `SePay báo có tiền cho giao dịch đã ở trạng thái ${payment.status} — cần đối soát/hoàn tiền.`,
        },
      });
      return finish({
        status: "LATE",
        reason: "LATE_RESULT",
        paymentId: payment.id,
        memberId: payment.memberId,
        paymentStatus: payment.status,
      });
    }

    // (8) Đã thu tiền: lưu dấu vết cổng rồi kích hoạt gói qua luồng chung (sub + invoice + notification).
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        gatewayTransId,
        gatewayPayload: asJson(body),
        // Đối soát chủ động: ghi rõ nguồn chốt để đối chiếu khi webhook thật về sau (sẽ là DUPLICATE).
        ...(source === "RECONCILE"
          ? {
              note:
                `${payment.note ?? ""} | Chốt tự động qua đối soát SePay API ` +
                `(webhook không tới được server) — ref ${gatewayTransId}.`,
            }
          : {}),
      },
    });

    const plan = payment.planId
      ? await tx.membershipPlan.findUnique({ where: { id: payment.planId } })
      : null;
    if (!plan) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          paidAt: now,
          note: "Đã thu tiền nhưng KHÔNG tìm thấy gói để kích hoạt — cần xử lý thủ công.",
        },
      });
      return finish({
        status: "PROCESSED",
        reason: "PLAN_MISSING",
        paymentId: payment.id,
        memberId: payment.memberId,
        paymentStatus: "SUCCESS",
        processed: true,
      });
    }

    const member = await tx.memberProfile.findUnique({
      where: { id: payment.memberId },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!member) throw new AppError("Member not found", 500);

    let subscriptionId: string;
    try {
      const { subscription } = await activateSubscriptionForPayment(tx, {
        memberProfileId: member.id,
        memberUserId: member.userId,
        memberName: member.user.fullName,
        plan,
        paymentId: payment.id,
        now,
      });
      subscriptionId = subscription.id;
    } catch (err) {
      // VD: gói khác đã được kích hoạt trong lúc chờ chuyển khoản ⇒ hạ hạng. Tiền ĐÃ về
      // nhưng không thể kích hoạt tự động ⇒ giữ PENDING + ghi chú để đối soát thủ công.
      if (err instanceof AppError) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            note: `Đã thu tiền nhưng KHÔNG kích hoạt được gói: ${err.message} — cần đối soát thủ công.`,
          },
        });
        return finish({
          status: "PROCESSED",
          reason: "ACTIVATION_REJECTED",
          paymentId: payment.id,
          memberId: payment.memberId,
          paymentStatus: payment.status,
          processed: true,
        });
      }
      throw err;
    }

    return finish({
      status: "PROCESSED",
      paymentId: payment.id,
      memberId: payment.memberId,
      paymentStatus: "SUCCESS",
      processed: true,
      subscriptionId,
    });
  });

  // Thông báo ngoài transaction — không làm fail việc chốt giao dịch.
  if (
    settlement.paymentId &&
    (settlement.status === "MISMATCH" ||
      settlement.status === "LATE" ||
      settlement.reason === "ACTIVATION_REJECTED")
  ) {
    void notifyUnsettledTransfer(
      settlement.memberId,
      settlement.reason,
      drafted?.transactionCode ?? code ?? ""
    );
  }

  return {
    sepayId: body.id ?? null,
    orderCode: drafted?.transactionCode ?? code ?? null,
    paymentId: settlement.paymentId,
    processed: settlement.processed,
    status: settlement.status,
    reason: settlement.reason,
    paymentStatus: settlement.paymentStatus,
    subscriptionId: settlement.subscriptionId,
    ...(source === "MOCK" ? { mock: true } : {}),
  };
}

/** Nhắc hội viên khi tiền đã chuyển nhưng gói CHƯA được kích hoạt tự động (cần đối soát). */
async function notifyUnsettledTransfer(
  memberId: string | null,
  reason: string | undefined,
  orderCode: string
): Promise<void> {
  if (!memberId) return;
  try {
    const member = await prisma.memberProfile.findUnique({
      where: { id: memberId },
      select: { userId: true },
    });
    if (!member) return;

    const detailByReason: Record<string, string> = {
      ACCOUNT_MISMATCH:
        "Khoản chuyển khoản đến số tài khoản không khớp với tài khoản nhận tiền của trung tâm.",
      AMOUNT_MISMATCH: "Số tiền chuyển khoản không khớp với số tiền của đơn.",
      LATE_RESULT: "Tiền về sau khi giao dịch đã hết hạn/đã đóng.",
      ACTIVATION_REJECTED:
        "Gói không thể kích hoạt tự động (VD: gói hiện tại đã thay đổi trong lúc chờ chuyển khoản).",
    };

    await createNotification(
      member.userId,
      "GENERAL",
      "Giao dịch chuyển khoản cần đối soát",
      `Hệ thống ghi nhận giao dịch cho đơn ${orderCode} nhưng CHƯA kích hoạt được gói tập. ` +
        `${detailByReason[reason ?? ""] ?? ""} Vui lòng liên hệ quản lý để được hỗ trợ.`
    );
  } catch {
    // Notification là kênh phụ — lỗi không được ảnh hưởng tới kết quả webhook.
  }
}






