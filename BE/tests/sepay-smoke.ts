import "dotenv/config";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";

/**
 * SMOKE test luồng thanh toán SePay trên BE local — chạy: `npm run test:sepay:smoke`.
 *
 * Điều kiện tiên quyết (đã có trong seed):
 * - Tài khoản: sepay.test@example.com / Member@123 (MEMBER, FREE subscription).
 * - Gói:       plan-sepay-test-001 "SePay Test 5K" — price 5.000đ, 7 ngày.
 * - BE/.env:   ít nhất 1 phương thức chốt giao dịch:
 *   + `SEPAY_MOCK_MODE="true"`  → chốt bằng POST /payments/sepay/mock-confirm, HOẶC
 *   + `SEPAY_WEBHOOK_SECRET`    → chốt bằng webhook thật có chữ ký HMAC-SHA256, HOẶC
 *   + `SEPAY_WEBHOOK_API_KEY`   → chốt bằng webhook thật với header Authorization: Apikey.
 *
 * Luồng verify: login → checkout (201 hoặc tái sử dụng 409, amount=5000) → status PENDING →
 * chốt giao dịch → FE polling thấy SUCCESS → subscription ACTIVE với gói SePay Test 5K.
 */
async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as AddressInfo).port;
  (globalThis as any).__port = port;
  process.env.PORT = String(port);

  // Patch BASE sau khi biết port — dùng URL đầy đủ.
  const base = `http://127.0.0.1:${port}`;
  const call = async (
    method: string,
    path: string,
    opts: {
      token?: string;
      body?: unknown;
      headers?: Record<string, string>;
      /** Gửi đúng chuỗi bytes này (không stringify lại) — cần cho HMAC. */
      raw?: string;
    } = {}
  ) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.headers ?? {}),
      },
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
    return { status: res.status, body };
  };

  let passed = 0;
  let fails = 0;
  const ok = (label: string, cond: boolean, extra?: unknown) => {
    if (cond) passed++;
    else fails++;
    console.log(`${cond ? "  [OK]  " : "  [FAIL]"} ${label}`);
    if (!cond && extra !== undefined) console.log("    ", JSON.stringify(extra));
  };

  // 1. Login tài khoản SePay test
  const login = await call("POST", "/api/v1/auth/login", {
    body: { email: "sepay.test@example.com", password: "Member@123" },
  });
  ok("Login sepay.test@example.com", login.status === 200, login.body);
  const token = login.body?.data?.accessToken;
  if (!token) throw new Error("No access token");

  const me = await call("GET", "/api/v1/auth/me", { token });
  const memberId = me.body?.data?.id;
  ok("GET /auth/me có memberId", Boolean(memberId), me.body);

  // 2. Checkout gói 5.000đ — nếu còn đơn PENDING (lần chạy trước/chưa chốt) thì tái sử dụng.
  let paymentId: string | undefined;
  let orderCode: string | undefined;
  let amount = 5000;
  const checkout = await call("POST", "/api/v1/payments/sepay/checkout", {
    token,
    body: { planId: "plan-sepay-test-001" },
  });
  if (checkout.status === 409 && checkout.body?.errors?.code === "SEPAY_PAYMENT_PENDING") {
    paymentId = checkout.body.errors.paymentId;
    orderCode = checkout.body.errors.orderCode;
    amount = checkout.body.errors.amount;
    ok(
      "Checkout tái sử dụng đơn PENDING (409 SEPAY_PAYMENT_PENDING) — amount = 5000",
      amount === 5000,
      checkout.body.errors
    );
  } else {
    amount = checkout.body?.data?.amount;
    ok(
      "Checkout gói SePay Test 5K → 201, amount = 5000",
      checkout.status === 201 && amount === 5000,
      checkout.body
    );
    paymentId = checkout.body?.data?.paymentId;
    orderCode = checkout.body?.data?.orderCode;
  }
  console.log("    paymentId:", paymentId, "| orderCode:", orderCode);
  if (!paymentId) throw new Error("No paymentId");

  // 3. Trạng thái ban đầu = PENDING
  const before = await call("GET", `/api/v1/payments/sepay/${paymentId}`, {
    token,
  });
  ok(
    "GET status trước xác nhận → PENDING",
    before.status === 200 && before.body?.data?.status === "PENDING",
    before.body
  );

  // 4. Chốt giao dịch — chọn phương thức khả dụng trong .env (mock → HMAC → API key).
  const mockMode = (process.env.SEPAY_MOCK_MODE ?? "").trim() === "true";
  const webhookSecret = (process.env.SEPAY_WEBHOOK_SECRET ?? "").trim();
  const webhookApiKey = (process.env.SEPAY_WEBHOOK_API_KEY ?? "").trim();

  if (mockMode) {
    const confirm = await call("POST", "/api/v1/payments/sepay/mock-confirm", {
      token,
      body: { paymentId },
    });
    ok(
      "Mock-confirm (SEPAY_MOCK_MODE=true) → 200, processed=true, paymentStatus=SUCCESS",
      confirm.status === 200 &&
        confirm.body?.data?.processed === true &&
        confirm.body?.data?.paymentStatus === "SUCCESS" &&
        Boolean(confirm.body?.data?.subscriptionId),
      confirm.body
    );
  } else if (webhookSecret || webhookApiKey) {
    // Gọi webhook đúng như SePay gọi thật (cùng payload + xác thực).
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const payload = {
      // sepayId là int4 (max 2.147.483.647) — dùng block theo giây như e2e, offset 500 để không đụng e2e.
      id: 1_000_000_000 + (Math.floor(Date.now() / 1000) % 1_000_000) * 1000 + 500,
      gateway: (process.env.VIETQR_BANK_ID ?? "SACOMBANK").toUpperCase(),
      transactionDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      accountNumber: process.env.VIETQR_ACCOUNT_NO ?? "",
      subAccount: "",
      code: orderCode,
      content: `${orderCode} chuyen tien`,
      transferType: "in",
      description: "SePay smoke test transfer",
      transferAmount: amount,
      accumulated: 0,
      referenceCode: `SMOKE${now.getTime()}`,
    };
    const raw = JSON.stringify(payload);
    const headers: Record<string, string> = webhookSecret
      ? (() => {
          const ts = String(Math.floor(Date.now() / 1000));
          return {
            "X-SePay-Signature":
              "sha256=" +
              createHmac("sha256", webhookSecret).update(`${ts}.${raw}`).digest("hex"),
            "X-SePay-Timestamp": ts,
          };
        })()
      : { Authorization: `Apikey ${webhookApiKey}` };
    const method = webhookSecret ? "HMAC-SHA256 (SEPAY_WEBHOOK_SECRET)" : "API Key";
    const confirm = await call("POST", "/api/v1/payments/sepay/webhook", { raw, headers });
    ok(
      `Webhook thật với ${method} → 200 { success: true }`,
      confirm.status === 200 && confirm.body?.success === true,
      confirm.body
    );
  } else {
    ok(
      "Không có phương thức chốt giao dịch — bật SEPAY_MOCK_MODE / SEPAY_WEBHOOK_SECRET / SEPAY_WEBHOOK_API_KEY trong BE/.env",
      false
    );
  }

  // 5. FE polling thấy SUCCESS
  const after = await call("GET", `/api/v1/payments/sepay/${paymentId}`, {
    token,
  });
  ok(
    "GET status sau xác nhận → SUCCESS (FE polling)",
    after.status === 200 && after.body?.data?.status === "SUCCESS",
    after.body
  );

  // 6. Subscription ACTIVE cho member (member tự xem qua /subscriptions/member/{id})
  const subs = await call(
    "GET",
    `/api/v1/subscriptions/member/${memberId}`,
    { token }
  );
  const subList: any[] = Array.isArray(subs.body?.data)
    ? subs.body.data
    : subs.body?.data?.subscriptions ?? [];
  ok(
    "GET /subscriptions/member/{id} → 200, có subscription ACTIVE SePay Test 5K",
    subs.status === 200 &&
      subList.some(
        (s: any) =>
          s?.status === "ACTIVE" && s?.plan?.id === "plan-sepay-test-001"
      ),
    subs.body
  );

  console.log(`\n=== KẾT QUẢ: PASS ${passed} | FAIL ${fails} ===`);
  server.close();
  // Thoát ngay: Prisma connection giữ event loop mở.
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
