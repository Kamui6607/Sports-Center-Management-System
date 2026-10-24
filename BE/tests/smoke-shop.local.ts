/**
 * SMOKE TEST END-TO-END cửa hàng trên BE ĐANG CHẠY (PostgreSQL local) — Doc/SHOP_FLOW_DESIGN.md.
 *
 *   Terminal 1: npm run dev:local
 *   Terminal 2: npm run test:smoke:shop:local       (SMOKE_BASE_URL mặc định http://localhost:8081)
 *
 * Luồng 1 PICKUP  : thêm giỏ → xem trước → checkout → mock-confirm → Manager "sẵn sàng" → quét mã + 4 số SĐT → COMPLETED → đánh giá.
 * Luồng 2 DELIVERY: thêm địa chỉ → mua ngay → mock-confirm → PROCESSING → SHIPPING (vận đơn) → DELIVERED → khách xác nhận → đánh giá.
 * Luồng 3 HẾT HẠN : checkout → (đẩy hạn về quá khứ) → chờ job của server (≤ 60s) → EXPIRED + nhả hàng.
 *
 * Tạo người mua mới (tiền tố `smoke-shop-<RUN>`) + sản phẩm riêng; Manager dùng tài khoản seed manager@sportscenter.com.
 */
import crypto from "node:crypto";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";
import { connectRole } from "../src/utils/roles.js";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error("[smoke-shop] TỪ CHỐI: DATABASE_URL không phải PostgreSQL local.");
  process.exit(1);
}

const BASE = (process.env.SMOKE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8081}`).replace(/\/$/, "");
const RUN = `smoke-shop-${Date.now().toString(36)}`;
const PASSWORD = "Smoke!2026";
const PHONE = "0987654321";
let passed = 0;
const failures: string[] = [];

function step(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 500)}`}`);
  }
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(email: string, password = PASSWORD): Promise<string> {
  const res = await api("POST", "/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Đăng nhập ${email} thất bại: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function buyer(role: "MEMBER" | "COACH", n: number) {
  const email = `${RUN}-${role.toLowerCase()}${n}@example.test`;
  await prisma.user.create({
    data: {
      email,
      password: await hashPassword(PASSWORD),
      fullName: `Smoke Shop ${role} ${n}`,
      role: connectRole(role),
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : { coachProfile: { create: { specialization: "Gym", certification: { create: { status: "APPROVED", fileUrl: "uploads/cvs/smoke.pdf" } } } } }),
    },
  });
  return login(email);
}

async function checkout(token: string, body: Record<string, unknown>) {
  const preview = await api("POST", "/shop/checkout/preview", { token, body });
  const res = await api("POST", "/shop/checkout", {
    token,
    body: { ...body, expectedTotal: preview.body.data?.total },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  return { preview: preview.body.data, res };
}

async function main() {
  const health = await api("GET", "/health");
  if (health.status !== 200) throw new Error(`BE chưa chạy ở ${BASE} — chạy \`npm run dev:local\` trước.`);
  const manager = await login("manager@sportscenter.com", "Manager@123");
  const member = await buyer("MEMBER", 1);
  const coach = await buyer("COACH", 2);
  const managerUser = await prisma.user.findFirstOrThrow({ where: { email: "manager@sportscenter.com" } });
  const [pGloves, pMat] = await Promise.all([
    prisma.product.create({ data: { name: `${RUN}-Găng`, description: "Smoke", price: 150_000, stockQuantity: 20, createdById: managerUser.id } }),
    prisma.product.create({ data: { name: `${RUN}-Thảm`, description: "Smoke", price: 250_000, stockQuantity: 10, createdById: managerUser.id } }),
  ]);

  console.log("\n▶ Luồng 1 — PICKUP (giỏ hàng)");
  let r = await api("POST", "/shop/cart/items", { token: member, body: { productId: pGloves.id, quantity: 2 } });
  step("thêm giỏ", r.status === 200 && r.body.data.count === 1, r.body);
  const pickup = await checkout(member, { mode: "CART", fulfillmentType: "PICKUP", recipientPhone: PHONE });
  step("xem trước 300.000, không phí ship", pickup.preview?.total === 300_000 && pickup.preview.shippingFee === 0, pickup.preview);
  step("checkout ⇒ 201 PENDING_PAYMENT", pickup.res.status === 201 && pickup.res.body.data.order.status === "PENDING_PAYMENT", pickup.res.body);
  const o1 = pickup.res.body.data.order;
  r = await api("POST", "/payments/sepay/mock-confirm", { token: member, body: { paymentId: pickup.res.body.data.checkout.paymentId } });
  step("mock-confirm ⇒ PAID", (await api("GET", `/shop/orders/${o1.id}`, { token: member })).body.data.status === "PAID", r.body);
  r = await api("POST", `/shop/manage/orders/${o1.id}/status`, { token: manager, body: { status: "READY_FOR_PICKUP" } });
  step("Manager: sẵn sàng nhận", r.body.data?.status === "READY_FOR_PICKUP", r.body);
  const detail = (await api("GET", `/shop/orders/${o1.id}`, { token: member })).body.data;
  step("khách có QR + mã nhận hàng", !!detail.pickup?.qrPayload, detail.pickup);
  r = await api("POST", "/shop/manage/pickup/verify", { token: manager, body: { code: detail.pickup.qrPayload } });
  step("Manager quét QR ⇒ đúng đơn", r.body.data?.id === o1.id, r.body);
  r = await api("POST", `/shop/manage/orders/${o1.id}/pickup`, { token: manager, body: { code: detail.pickup.code, phoneLast4: PHONE.slice(-4) } });
  step("xác nhận giao tại quầy ⇒ COMPLETED", r.body.data?.status === "COMPLETED", r.body);
  const item1 = (await api("GET", `/shop/orders/${o1.id}`, { token: member })).body.data.items[0];
  r = await api("POST", `/shop/order-items/${item1.id}/review`, { token: member, body: { rating: 5, comment: "Găng tốt" } });
  step("đánh giá ⇒ 201", r.status === 201, r.body);
  r = await api("GET", `/products/${pGloves.id}`);
  step("sản phẩm: 1 đánh giá, tồn 18", r.body.data.reviewCount === 1 && r.body.data.stockQuantity === 18 && r.body.data.availableStock === 18, r.body.data);

  console.log("\n▶ Luồng 2 — DELIVERY (HLV mua ngay)");
  r = await api("POST", "/shop/addresses", { token: coach, body: { recipientName: "HLV Smoke", phone: PHONE, province: "Hồ Chí Minh", district: "Quận 3", street: "99 Võ Văn Tần" } });
  step("thêm địa chỉ", r.status === 201, r.body);
  const delivery = await checkout(coach, { mode: "BUY_NOW", items: [{ productId: pMat.id, quantity: 1 }], fulfillmentType: "DELIVERY", addressId: r.body.data.id });
  step("xem trước 250.000 + ship 30.000", delivery.preview?.total === 280_000, delivery.preview);
  step("checkout ⇒ 201", delivery.res.status === 201, delivery.res.body);
  const o2 = delivery.res.body.data.order;
  await api("POST", "/payments/sepay/mock-confirm", { token: coach, body: { paymentId: delivery.res.body.data.checkout.paymentId } });
  for (const [status, extra] of [["PROCESSING", {}], ["SHIPPING", { trackingCode: "GHN-SMOKE-1", carrier: "GHN" }], ["DELIVERED", {}]] as const) {
    r = await api("POST", `/shop/manage/orders/${o2.id}/status`, { token: manager, body: { status, ...extra } });
    step(`Manager → ${status}`, r.body.data?.status === status, r.body);
  }
  r = await api("POST", `/shop/orders/${o2.id}/confirm-received`, { token: coach });
  step("khách xác nhận đã nhận ⇒ COMPLETED", r.body.data?.status === "COMPLETED", r.body);
  step("timeline 6 mốc", r.body.data.history.length === 6, r.body.data.history?.map((h: any) => h.toStatus));
  r = await api("POST", `/shop/order-items/${r.body.data.items[0].id}/review`, { token: coach, body: { rating: 4 } });
  step("đánh giá ⇒ 201", r.status === 201, r.body);

  console.log("\n▶ Luồng 3 — Hết hạn thanh toán, job của server nhả hàng");
  const exp = await checkout(member, { mode: "BUY_NOW", items: [{ productId: pMat.id, quantity: 3 }], fulfillmentType: "PICKUP", recipientPhone: PHONE });
  const o3 = exp.res.body.data.order;
  step("đặt 3 ⇒ đang giữ 3", (await prisma.product.findUniqueOrThrow({ where: { id: pMat.id } })).reservedStock === 3);
  await prisma.order.update({ where: { id: o3.id }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
  let status = "";
  for (let i = 0; i < 40 && status !== "EXPIRED"; i++) {
    await sleep(2000);
    status = (await api("GET", `/shop/orders/${o3.id}`, { token: member })).body.data?.status;
  }
  step("job server (≤ 60s) ⇒ EXPIRED", status === "EXPIRED", status);
  const after = await prisma.product.findUniqueOrThrow({ where: { id: pMat.id } });
  step("nhả hàng: reserved 0, tồn 9", after.reservedStock === 0 && after.stockQuantity === 9, after);
  r = await api("GET", "/notifications", { token: member });
  step("có thông báo ORDER_UPDATED", (r.body.data ?? []).some((n: any) => n.type === "ORDER_UPDATED"), r.body.data?.map((n: any) => n.type));
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.refund.deleteMany({ where: { order: { userId: { in: ids } } } });
  await prisma.sepayWebhookEvent.deleteMany({ where: { payment: { order: { userId: { in: ids } } } } });
  await prisma.sepayBankTransaction.deleteMany({ where: { payment: { order: { userId: { in: ids } } } } });
  await prisma.payment.deleteMany({ where: { order: { userId: { in: ids } } } });
  await prisma.productReview.deleteMany({ where: { userId: { in: ids } } });
  await prisma.order.deleteMany({ where: { userId: { in: ids } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notificationOutbox.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

main()
  .catch((err) => {
    failures.push(`lỗi không mong đợi: ${(err as Error).message}`);
    console.error(err);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("[smoke-shop] dọn dữ liệu lỗi:", e));
    console.log(`\nSmoke shop: ${passed} passed, ${failures.length} failed`);
    for (const f of failures) console.log(`  - ${f}`);
    await prisma.$disconnect();
    process.exit(failures.length === 0 ? 0 : 1);
  });
