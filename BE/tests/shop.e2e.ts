/**
 * E2E cửa hàng (Doc/SHOP_FLOW_DESIGN.md) trên PostgreSQL local — HTTP thật + job chạy trực tiếp:
 * giỏ & xem trước, giá đổi, idempotency, PICKUP (mã nhận hàng) & DELIVERY (vận đơn) end-to-end, máy trạng thái,
 * giữ/nhả hàng, 2 người tranh món cuối, job hết hạn + khóa đặt hàng, webhook lệch tiền / về muộn,
 * giới hạn (đơn chờ, mỗi đơn, mỗi ngày), hoàn tiền (duyệt/từ chối), quá hạn nhận, IDOR, quyền đánh giá, rate limit.
 *
 * Chạy: npm run test:local -- shop
 */
import crypto from "node:crypto";
import { prisma } from "../src/config/prisma.js";
import { runShopMaintenance } from "../src/modules/shop/orders.service.js";
import { check, group, http, RUN, runSuite, type HttpResult } from "./helpers/e2e.js";
import { cleanupRun, createUser, login, type TestUser } from "./helpers/fixtures.js";

const PHONE = "0901234567";
let keySeq = 0;
const key = () => `${RUN}-key-${++keySeq}-${crypto.randomUUID().slice(0, 8)}`;

async function product(name: string, price: number, stock: number, extra: Record<string, number> = {}) {
  const manager = await prisma.user.findFirstOrThrow({ where: { role: { name: "MANAGER" } } });
  return prisma.product.create({
    data: { name: `${RUN}-${name}`, description: "Sản phẩm e2e cửa hàng", price, stockQuantity: stock, createdById: manager.id, ...extra },
  });
}

const stockOf = (id: string) => prisma.product.findUniqueOrThrow({ where: { id }, select: { stockQuantity: true, reservedStock: true } });

function checkout(user: TestUser, body: Record<string, unknown>, idem: string | null = key()): Promise<HttpResult> {
  return http("POST", "/shop/checkout", { token: user.token, body, headers: idem ? { "Idempotency-Key": idem } : {} });
}

async function buyNow(user: TestUser, productId: string, quantity: number, extra: Record<string, unknown> = {}) {
  const body = { mode: "BUY_NOW", items: [{ productId, quantity }], fulfillmentType: "PICKUP", recipientPhone: PHONE, ...extra };
  const preview = await http("POST", "/shop/checkout/preview", { token: user.token, body });
  return checkout(user, { ...body, expectedTotal: preview.body.data?.total ?? 0 });
}

const pay = (user: TestUser, paymentId: string) => http("POST", "/payments/sepay/mock-confirm", { token: user.token, body: { paymentId } });
const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
const setStatus = (manager: TestUser, id: string, body: Record<string, unknown>) =>
  http("POST", `/shop/manage/orders/${id}/status`, { token: manager.token, body });

/** Gửi webhook SePay có chữ ký HMAC (SEPAY_WEBHOOK_SECRET của .env.local). */
async function webhook(code: string, amount: number) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET ?? "";
  const body = JSON.stringify({
    id: 1_500_000_000 + Math.floor(Math.random() * 400_000_000),
    gateway: process.env.VIETQR_BANK_ID ?? "MBBank",
    transactionDate: "2026-10-11 10:00:00",
    accountNumber: process.env.VIETQR_ACCOUNT_NO ?? "",
    subAccount: "",
    code,
    content: `${code} thanh toan don hang`,
    transferType: "in",
    description: "e2e",
    transferAmount: amount,
    accumulated: 0,
    referenceCode: `E2E-${crypto.randomUUID()}`,
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");
  return http("POST", "/payments/sepay/webhook", { rawBody: body, headers: { "X-SePay-Signature": `sha256=${sig}`, "X-SePay-Timestamp": ts } });
}

async function main() {
  const manager = await login(await createUser("MANAGER"));
  const m1 = await login(await createUser("MEMBER"));
  const m2 = await login(await createUser("MEMBER"));
  const m3 = await login(await createUser("MEMBER"));
  const m4 = await login(await createUser("MEMBER"));
  const m5 = await login(await createUser("MEMBER"));
  const m6 = await login(await createUser("MEMBER"));
  const m7 = await login(await createUser("MEMBER"));
  const coach = await login(await createUser("COACH"));

  const pA = await product("Găng", 100_000, 10, { maxPerOrder: 3, maxPerDay: 5 });
  const pB = await product("Nước", 50_000, 50);
  const pLast = await product("Món cuối", 70_000, 1);
  const pShip = await product("Thảm", 600_000, 5);

  group("Giỏ hàng: thêm, giới hạn mỗi đơn, cảnh báo giá đổi");
  let res = await http("POST", "/shop/cart/items", { token: m1.token, body: { productId: pA.id, quantity: 2 } });
  check("thêm 2 ⇒ 200, count = 1", res.status === 200 && res.body.data.count === 1, res.body);
  res = await http("POST", "/shop/cart/items", { token: m1.token, body: { productId: pA.id, quantity: 2 } });
  check("cộng dồn vượt maxPerOrder (4 > 3) ⇒ 400 MAX_PER_ORDER_EXCEEDED", res.status === 400 && res.body.errors?.code === "MAX_PER_ORDER_EXCEEDED", res.body);
  res = await http("POST", "/shop/cart/items", { token: m1.token, body: { productId: pB.id, quantity: 1 } });
  check("thêm sản phẩm thứ 2 ⇒ count = 2", res.body.data?.count === 2, res.body.data);
  res = await http("POST", "/shop/cart/items", { token: m1.token, body: { productId: pLast.id, quantity: 5 } });
  check("thêm quá tồn ⇒ 409 INSUFFICIENT_STOCK", res.status === 409 && res.body.errors?.code === "INSUFFICIENT_STOCK", res.body);
  await prisma.product.update({ where: { id: pB.id }, data: { price: 55_000 } });
  res = await http("GET", "/shop/cart", { token: m1.token });
  const lineB = res.body.data.items.find((i: any) => i.productId === pB.id);
  check("giá đổi ⇒ cảnh báo PRICE_CHANGED (50.000 → 55.000)", lineB?.warnings?.some((w: any) => w.code === "PRICE_CHANGED" && w.newPrice === 55_000), lineB);

  group("Checkout từ giỏ (PICKUP): xem trước, PRICE_CHANGED, idempotency");
  const cartBody = { mode: "CART", fulfillmentType: "PICKUP", recipientPhone: PHONE };
  const preview = await http("POST", "/shop/checkout/preview", { token: m1.token, body: cartBody });
  check("xem trước: server tính 2×100.000 + 55.000 = 255.000, ship 0", preview.body.data?.total === 255_000 && preview.body.data.shippingFee === 0 && preview.body.data.canCheckout === true, preview.body.data);
  res = await checkout(m1, { ...cartBody, expectedTotal: 250_000 });
  check("expectedTotal cũ (250.000) ⇒ 409 PRICE_CHANGED kèm preview mới", res.status === 409 && res.body.errors?.code === "PRICE_CHANGED" && res.body.errors.preview?.total === 255_000, res.body);
  res = await checkout(m1, { ...cartBody, expectedTotal: 255_000 }, null);
  check("thiếu Idempotency-Key ⇒ 400 IDEMPOTENCY_KEY_REQUIRED", res.status === 400 && res.body.errors?.code === "IDEMPOTENCY_KEY_REQUIRED", res.body);
  const k1 = key();
  res = await checkout(m1, { ...cartBody, expectedTotal: 255_000 }, k1);
  check("đặt ⇒ 201, PENDING_PAYMENT, có QR", res.status === 201 && res.body.data.order.status === "PENDING_PAYMENT" && !!res.body.data.checkout.qrUrl, res.body);
  const o1 = res.body.data.order;
  const pay1 = res.body.data.checkout.paymentId;
  check("mã đơn dạng DHyyMMdd-XXXXXX", /^DH\d{6}-[2-9A-Z]{6}$/.test(o1.code), o1.code);
  check("giữ hàng: pA reserved = 2, stock = 10", JSON.stringify(await stockOf(pA.id)) === JSON.stringify({ stockQuantity: 10, reservedStock: 2 }));
  res = await http("GET", "/shop/cart", { token: m1.token });
  check("đặt từ giỏ ⇒ dòng đã đặt bị xóa khỏi giỏ", res.body.data.count === 0, res.body.data);
  res = await checkout(m1, { ...cartBody, expectedTotal: 255_000 }, k1);
  check("gửi lại cùng khóa ⇒ 200, cùng đơn (replayed)", res.status === 200 && res.body.data.replayed === true && res.body.data.order.id === o1.id, res.body);
  res = await checkout(m1, { mode: "BUY_NOW", items: [{ productId: pB.id, quantity: 1 }], fulfillmentType: "PICKUP", recipientPhone: PHONE, expectedTotal: 55_000 }, k1);
  check("cùng khóa, nội dung khác ⇒ 409 IDEMPOTENCY_KEY_REUSED", res.status === 409 && res.body.errors?.code === "IDEMPOTENCY_KEY_REUSED", res.body);

  group("Thanh toán & máy trạng thái PICKUP + mã nhận hàng");
  res = await pay(m1, pay1);
  check("mock-confirm ⇒ PROCESSED", res.status === 200 && res.body.data?.status === "PROCESSED", res.body);
  check("đơn → PAID", (await orderOf(o1.id)).status === "PAID");
  check("SALE: pA stock 8, reserved 0", JSON.stringify(await stockOf(pA.id)) === JSON.stringify({ stockQuantity: 8, reservedStock: 0 }));
  res = await http("POST", `/shop/orders/${o1.id}/cancel`, { token: m1.token, body: {} });
  check("hủy đơn đã thanh toán ⇒ 409 ORDER_PAID_USE_REFUND", res.status === 409 && res.body.errors?.code === "ORDER_PAID_USE_REFUND", res.body);
  res = await setStatus(manager, o1.id, { status: "SHIPPING", trackingCode: "VD123" });
  check("PICKUP không được chuyển sang SHIPPING ⇒ 409 ORDER_INVALID_TRANSITION", res.status === 409 && res.body.errors?.code === "ORDER_INVALID_TRANSITION", res.body);
  res = await setStatus(manager, o1.id, { status: "READY_FOR_PICKUP" });
  check("Manager: PAID → READY_FOR_PICKUP", res.status === 200 && res.body.data.status === "READY_FOR_PICKUP", res.body);
  check("view Manager KHÔNG lộ mã nhận hàng", res.body.data.pickup?.code === undefined && res.body.data.pickup?.deadline, res.body.data.pickup);
  res = await http("GET", `/shop/orders/${o1.id}`, { token: m1.token });
  const pickup = res.body.data.pickup;
  check("chủ đơn thấy mã 8 ký tự + QR payload", /^[2-9A-Z]{8}$/.test(pickup?.code ?? "") && pickup.qrPayload === `SCMS-PICKUP:${o1.code}:${pickup.code}`, pickup);
  const dbOrder = await orderOf(o1.id);
  check("DB chỉ lưu hash (không có mã thô)", dbOrder.pickupCodeHash !== null && dbOrder.pickupCodeHash !== pickup.code && !JSON.stringify(dbOrder).includes(pickup.code));
  res = await http("POST", "/shop/manage/pickup/verify", { token: manager.token, body: { code: "ZZZZZZZZ" } });
  check("tra mã sai ⇒ 400 PICKUP_CODE_INVALID", res.status === 400 && res.body.errors?.code === "PICKUP_CODE_INVALID", res.body);
  res = await http("POST", "/shop/manage/pickup/verify", { token: manager.token, body: { code: pickup.qrPayload } });
  check("tra bằng QR ⇒ tóm tắt đơn + SĐT che", res.status === 200 && res.body.data.id === o1.id && res.body.data.recipientPhoneMasked === "******4567", res.body.data);
  res = await http("POST", `/shop/manage/orders/${o1.id}/pickup`, { token: manager.token, body: { code: pickup.code, phoneLast4: "0000" } });
  check("sai 4 số cuối SĐT ⇒ 400 PHONE_MISMATCH", res.status === 400 && res.body.errors?.code === "PHONE_MISMATCH", res.body);
  res = await http("POST", `/shop/manage/orders/${o1.id}/pickup`, { token: manager.token, body: { code: pickup.code, phoneLast4: "4567" } });
  check("đúng mã + SĐT ⇒ COMPLETED", res.status === 200 && res.body.data.status === "COMPLETED", res.body);
  res = await http("POST", `/shop/manage/orders/${o1.id}/pickup`, { token: manager.token, body: { code: pickup.code, phoneLast4: "4567" } });
  check("dùng lại mã ⇒ 409 PICKUP_CODE_USED", res.status === 409 && res.body.errors?.code === "PICKUP_CODE_USED", res.body);
  res = await http("POST", "/shop/manage/pickup/verify", { token: manager.token, body: { code: pickup.code } });
  check("mã đã dùng không tra được nữa", res.status === 400, res.body);
  const history = await prisma.orderStatusHistory.findMany({ where: { orderId: o1.id }, orderBy: { createdAt: "asc" } });
  check("lịch sử: PENDING_PAYMENT → PAID → READY_FOR_PICKUP → COMPLETED", history.map((h) => h.toStatus).join(">") === "PENDING_PAYMENT>PAID>READY_FOR_PICKUP>COMPLETED", history.map((h) => h.toStatus));

  group("Đánh giá theo dòng đơn + Manager ẩn");
  res = await http("GET", `/shop/orders/${o1.id}`, { token: m1.token });
  const itemA = res.body.data.items.find((i: any) => i.productId === pA.id);
  check("dòng đơn COMPLETED có canReview", itemA?.canReview === true, itemA);
  res = await http("POST", `/shop/order-items/${itemA.id}/review`, { token: m1.token, body: { rating: 5, comment: "Tốt" } });
  check("đánh giá ⇒ 201", res.status === 201, res.body);
  const reviewId = res.body.data?.id;
  res = await http("POST", `/shop/order-items/${itemA.id}/review`, { token: m1.token, body: { rating: 4 } });
  check("đánh giá lần 2 cùng dòng ⇒ 409 REVIEW_EXISTS", res.status === 409 && res.body.errors?.code === "REVIEW_EXISTS", res.body);
  res = await http("POST", `/shop/order-items/${itemA.id}/review`, { token: m3.token, body: { rating: 1 } });
  check("người khác đánh giá dòng của m1 ⇒ 404 (IDOR)", res.status === 404, res.body);
  check("điểm TB pA = 5 (1 đánh giá)", Number((await prisma.product.findUniqueOrThrow({ where: { id: pA.id } })).reviewCount) === 1);
  res = await http("PATCH", `/shop/manage/reviews/${reviewId}`, { token: manager.token, body: { isHidden: true, reason: "Spam" } });
  check("Manager ẩn đánh giá ⇒ 200", res.status === 200 && res.body.data.isHidden === true, res.body);
  const afterHide = await prisma.product.findUniqueOrThrow({ where: { id: pA.id } });
  check("đánh giá ẩn không tính điểm (reviewCount = 0)", afterHide.reviewCount === 0, afterHide.reviewCount);
  res = await http("GET", `/products/${pA.id}`);
  check("khách không thấy đánh giá ẩn", res.body.data.reviews.length === 0, res.body.data.reviews);
  res = await http("GET", `/products/${pA.id}`, { token: manager.token });
  check("Manager thấy đánh giá ẩn", res.body.data.reviews.length === 1 && res.body.data.reviews[0].isHidden === true);

  group("DELIVERY: sổ địa chỉ, khu vực giao, phí ship, vận đơn, xác nhận đã nhận");
  res = await http("POST", "/shop/addresses", { token: m2.token, body: { recipientName: "Người nhận", phone: "0912345678", province: "TP. Hồ Chí Minh", district: "Quận 1", street: "12 Lê Lợi" } });
  check("thêm địa chỉ đầu tiên ⇒ mặc định + deliverable", res.status === 201 && res.body.data.isDefault === true && res.body.data.deliverable === true, res.body);
  const hcm = res.body.data;
  res = await http("POST", "/shop/addresses", { token: m2.token, body: { recipientName: "Người nhận", phone: "0912345678", province: "Hà Nội", district: "Ba Đình", street: "1 Kim Mã" } });
  const hn = res.body.data;
  check("địa chỉ Hà Nội ⇒ deliverable = false", hn.deliverable === false, hn);
  await http("POST", "/shop/cart/items", { token: m2.token, body: { productId: pA.id, quantity: 1 } });
  const delBody = { mode: "BUY_NOW", items: [{ productId: pB.id, quantity: 2 }], fulfillmentType: "DELIVERY" };
  res = await http("POST", "/shop/checkout/preview", { token: m2.token, body: { ...delBody, addressId: hn.id } });
  check("xem trước ngoài khu vực ⇒ cảnh báo DELIVERY_NOT_AVAILABLE, canCheckout = false", res.body.data.canCheckout === false && res.body.data.warnings.some((w: any) => w.code === "DELIVERY_NOT_AVAILABLE"), res.body.data);
  res = await checkout(m2, { ...delBody, addressId: hn.id, expectedTotal: 140_000 });
  check("đặt giao ngoài khu vực ⇒ 400 DELIVERY_NOT_AVAILABLE", res.status === 400 && res.body.errors?.code === "DELIVERY_NOT_AVAILABLE", res.body);
  res = await http("POST", "/shop/checkout/preview", { token: m2.token, body: { ...delBody, addressId: hcm.id } });
  check("2 × 55.000 + ship 30.000 = 140.000", res.body.data.subtotal === 110_000 && res.body.data.shippingFee === 30_000 && res.body.data.total === 140_000, res.body.data);
  res = await checkout(m2, { ...delBody, addressId: hcm.id, expectedTotal: 140_000 });
  check("đặt DELIVERY ⇒ 201, snapshot địa chỉ", res.status === 201 && res.body.data.order.shippingAddress?.includes("12 Lê Lợi") && res.body.data.order.recipientPhone === "0912345678", res.body.data?.order);
  const o2 = res.body.data.order;
  const pay2 = res.body.data.checkout.paymentId;
  res = await http("GET", "/shop/cart", { token: m2.token });
  check("Mua ngay không đụng giỏ", res.body.data.count === 1, res.body.data);
  check("đơn chưa hoàn tất ⇒ không đánh giá được (403 REVIEW_NOT_ALLOWED)",
    (await http("POST", `/shop/order-items/${o2.items[0].id}/review`, { token: m2.token, body: { rating: 5 } })).body.errors?.code === "REVIEW_NOT_ALLOWED");
  await pay(m2, pay2);
  res = await setStatus(manager, o2.id, { status: "READY_FOR_PICKUP" });
  check("DELIVERY không được READY_FOR_PICKUP ⇒ 409", res.status === 409, res.body);
  check("PAID → PROCESSING", (await setStatus(manager, o2.id, { status: "PROCESSING" })).body.data?.status === "PROCESSING");
  res = await setStatus(manager, o2.id, { status: "SHIPPING" });
  check("SHIPPING thiếu vận đơn ⇒ 400 TRACKING_CODE_REQUIRED", res.status === 400 && res.body.errors?.code === "TRACKING_CODE_REQUIRED", res.body);
  res = await setStatus(manager, o2.id, { status: "SHIPPING", trackingCode: "GHN123456", carrier: "GHN" });
  check("PROCESSING → SHIPPING + mã vận đơn", res.body.data?.status === "SHIPPING" && res.body.data.trackingCode === "GHN123456", res.body);
  res = await http("POST", `/shop/orders/${o2.id}/cancel`, { token: m2.token, body: {} });
  check("đang giao không hủy được ⇒ 409", res.status === 409, res.body);
  check("SHIPPING → DELIVERED", (await setStatus(manager, o2.id, { status: "DELIVERED" })).body.data?.status === "DELIVERED");
  res = await http("POST", `/shop/orders/${o2.id}/confirm-received`, { token: m2.token });
  check("khách xác nhận đã nhận ⇒ COMPLETED", res.body.data?.status === "COMPLETED", res.body);
  res = await http("POST", `/shop/order-items/${o2.items[0].id}/review`, { token: m2.token, body: { rating: 4 } });
  check("sau khi hoàn tất ⇒ đánh giá 201", res.status === 201, res.body);
  res = await http("POST", "/shop/checkout/preview", { token: m2.token, body: { mode: "BUY_NOW", items: [{ productId: pShip.id, quantity: 1 }], fulfillmentType: "DELIVERY", addressId: hcm.id } });
  check("tạm tính ≥ 500.000 ⇒ miễn phí ship", res.body.data.shippingFee === 0 && res.body.data.total === 600_000, res.body.data);
  res = await checkout(m2, { mode: "BUY_NOW", items: [{ productId: pShip.id, quantity: 1 }], fulfillmentType: "DELIVERY", addressId: hcm.id, expectedTotal: 600_000 });
  const o2b = res.body.data.order;
  await pay(m2, res.body.data.checkout.paymentId);
  await setStatus(manager, o2b.id, { status: "PROCESSING" });
  await setStatus(manager, o2b.id, { status: "SHIPPING", trackingCode: "GHN999" });
  await setStatus(manager, o2b.id, { status: "DELIVERED" });
  await prisma.order.update({ where: { id: o2b.id }, data: { deliveredAt: new Date(Date.now() - 4 * 86_400_000) } });
  const autoRun = await runShopMaintenance();
  check("job: DELIVERED quá 3 ngày ⇒ tự COMPLETED", autoRun.autoCompleted >= 1 && (await orderOf(o2b.id)).status === "COMPLETED", autoRun);

  group("IDOR & phân quyền");
  check("người khác xem đơn ⇒ 404", (await http("GET", `/shop/orders/${o1.id}`, { token: m3.token })).status === 404);
  check("người khác hủy đơn ⇒ 404", (await http("POST", `/shop/orders/${o2.id}/cancel`, { token: m3.token, body: {} })).status === 404);
  check("người khác sửa địa chỉ ⇒ 404", (await http("PATCH", `/shop/addresses/${hcm.id}`, { token: m3.token, body: { street: "hack" } })).status === 404);
  check("người khác đặt giao tới địa chỉ của m2 ⇒ 404 ADDRESS_NOT_FOUND",
    (await checkout(m3, { mode: "BUY_NOW", items: [{ productId: pB.id, quantity: 1 }], fulfillmentType: "DELIVERY", addressId: hcm.id, expectedTotal: 85_000 })).body.errors?.code === "ADDRESS_NOT_FOUND");
  check("Member gọi API Manager ⇒ 403", (await http("GET", "/shop/manage/orders", { token: m1.token })).status === 403);
  check("Manager không đặt mua được ⇒ 403", (await http("GET", "/shop/cart", { token: manager.token })).status === 403);

  group("Hai người cùng mua món cuối");
  const [r4, r5] = await Promise.all([buyNow(m4, pLast.id, 1), buyNow(m5, pLast.id, 1)]);
  const statuses = [r4.status, r5.status].sort();
  check("đúng một 201 và một 409 OUT_OF_STOCK", statuses[0] === 201 && statuses[1] === 409 && [r4, r5].some((r) => r.body.errors?.code === "OUT_OF_STOCK"), [r4.body, r5.body]);
  check("pLast reserved = 1 (không bán quá kho)", (await stockOf(pLast.id)).reservedStock === 1);
  const winner = r4.status === 201 ? r4 : r5;
  const lastOrder = winner.body.data.order;
  const lastPayment = winner.body.data.checkout;

  group("Job hết hạn: nhả hàng, idempotent; tiền về muộn ⇒ không khôi phục, tạo hoàn tiền");
  await prisma.order.update({ where: { id: lastOrder.id }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
  const run1 = await runShopMaintenance();
  check("job: đơn → EXPIRED", run1.expired >= 1 && (await orderOf(lastOrder.id)).status === "EXPIRED", run1);
  check("nhả hàng: pLast reserved 0, stock 1", JSON.stringify(await stockOf(pLast.id)) === JSON.stringify({ stockQuantity: 1, reservedStock: 0 }));
  check("payment → FAILED", (await prisma.payment.findUniqueOrThrow({ where: { id: lastPayment.paymentId } })).status === "FAILED");
  const run2 = await runShopMaintenance();
  check("chạy lại job ⇒ không xử lý lại (idempotent)", run2.expired === 0 && (await stockOf(pLast.id)).reservedStock === 0, run2);
  res = await webhook(lastPayment.orderCode, lastPayment.amount);
  check("webhook đủ tiền nhưng đơn đã EXPIRED ⇒ ACK 200", res.status === 200, res.body);
  check("đơn vẫn EXPIRED (không tự khôi phục)", (await orderOf(lastOrder.id)).status === "EXPIRED");
  const latePay = await prisma.payment.findUniqueOrThrow({ where: { id: lastPayment.paymentId } });
  check("payment REQUIRES_REVIEW (LATE_PAYMENT)", latePay.activationStatus === "REQUIRES_REVIEW", latePay.activationStatus);
  const lateRefund = await prisma.refund.findFirst({ where: { orderId: lastOrder.id, reason: "ORDER_LATE_PAYMENT" } });
  check("tự tạo Refund ORDER_LATE_PAYMENT chờ Manager", lateRefund?.status === "PENDING" && Number(lateRefund.amount) === 70_000, lateRefund);

  group("Webhook lệch tiền ⇒ không chuyển PAID");
  res = await buyNow(m6, pB.id, 1);
  const o6 = res.body.data.order;
  res = await webhook(res.body.data.checkout.orderCode, res.body.data.checkout.amount - 1000);
  const mismatchEvent = await prisma.sepayWebhookEvent.findFirst({ where: { payment: { orderId: o6.id } }, orderBy: { createdAt: "desc" } });
  check("thiếu tiền ⇒ ACK nhưng đơn vẫn PENDING_PAYMENT, event MISMATCH", res.status === 200 && (await orderOf(o6.id)).status === "PENDING_PAYMENT" && mismatchEvent?.status === "MISMATCH", mismatchEvent);

  group("Giới hạn: đơn chờ thanh toán, số lượng mỗi ngày, rate limit");
  res = await buyNow(m6, pB.id, 1);
  check("đơn chờ thứ 2 ⇒ 201", res.status === 201, res.body);
  const o6b = res.body.data.order;
  res = await buyNow(m6, pB.id, 1);
  check("đơn chờ thứ 3 ⇒ 409 PENDING_ORDER_LIMIT (kèm danh sách đơn chờ)", res.status === 409 && res.body.errors?.code === "PENDING_ORDER_LIMIT" && res.body.errors.pendingOrders?.length === 2, res.body);
  res = await buyNow(m3, pA.id, 3);
  const o3 = res.body.data.order;
  await pay(m3, res.body.data.checkout.paymentId);
  res = await buyNow(m3, pA.id, 3);
  check("pA: 3 + 3 > 5/ngày ⇒ 400 DAILY_LIMIT_EXCEEDED", res.status === 400 && res.body.errors?.code === "DAILY_LIMIT_EXCEEDED" && res.body.errors.remainingToday === 2, res.body);

  group("Để hết hạn 3 lần/24h ⇒ khóa đặt hàng");
  for (let i = 0; i < 3; i++) {
    res = await buyNow(m7, pB.id, 1);
    await prisma.order.update({ where: { id: res.body.data.order.id }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
    await runShopMaintenance();
  }
  const locked = await prisma.user.findUniqueOrThrow({ where: { id: m7.id } });
  check("User.checkoutLockedUntil ≈ +24h", !!locked.checkoutLockedUntil && locked.checkoutLockedUntil.getTime() > Date.now() + 23 * 3_600_000, locked.checkoutLockedUntil);
  res = await buyNow(m7, pB.id, 1);
  check("đặt tiếp ⇒ 403 CHECKOUT_LOCKED kèm lockedUntil", res.status === 403 && res.body.errors?.code === "CHECKOUT_LOCKED" && !!res.body.errors.lockedUntil, res.body);
  res = await http("POST", "/shop/checkout/preview", { token: m7.token, body: { mode: "BUY_NOW", items: [{ productId: pB.id, quantity: 1 }], fulfillmentType: "PICKUP", recipientPhone: PHONE } });
  check("xem trước báo khóa (canCheckout = false, lockedUntil)", res.body.data.canCheckout === false && !!res.body.data.lockedUntil, res.body.data);

  group("Khóa xác nhận nhận hàng sau nhiều lần sai");
  await setStatus(manager, o3.id, { status: "READY_FOR_PICKUP" });
  const ownerView = await http("GET", `/shop/orders/${o3.id}`, { token: m3.token });
  for (let i = 0; i < 4; i++) await http("POST", `/shop/manage/orders/${o3.id}/pickup`, { token: manager.token, body: { code: "WRONG234", phoneLast4: "4567" } });
  res = await http("POST", `/shop/manage/orders/${o3.id}/pickup`, { token: manager.token, body: { code: "WRONG234", phoneLast4: "4567" } });
  check("lần sai thứ 5 ⇒ 423 PICKUP_LOCKED", res.status === 423 && res.body.errors?.code === "PICKUP_LOCKED", res.body);
  res = await http("POST", `/shop/manage/orders/${o3.id}/pickup`, { token: manager.token, body: { code: ownerView.body.data.pickup.code, phoneLast4: "4567" } });
  check("đang khóa: mã đúng cũng bị từ chối (423)", res.status === 423, res.body);

  group("Quá hạn nhận tại quầy ⇒ NOT_PICKED_UP + trả hàng + hoàn tiền");
  const pAbefore = await stockOf(pA.id);
  await prisma.order.update({ where: { id: o3.id }, data: { pickupDeadline: new Date(Date.now() - 1000) } });
  const run3 = await runShopMaintenance();
  check("job: READY quá hạn ⇒ NOT_PICKED_UP", run3.notPickedUp >= 1 && (await orderOf(o3.id)).status === "NOT_PICKED_UP", run3);
  check("trả 3 sản phẩm lên kệ (RETURN)", (await stockOf(pA.id)).stockQuantity === pAbefore.stockQuantity + 3);
  const npRefund = await prisma.refund.findFirst({ where: { orderId: o3.id, reason: "ORDER_NOT_PICKED_UP" } });
  check("Refund ORDER_NOT_PICKED_UP = 100% (300.000)", npRefund?.status === "PENDING" && Number(npRefund.amount) === 300_000, npRefund);
  res = await http("PATCH", `/refunds/${npRefund!.id}/approve`, { token: manager.token, body: { note: "CK hoàn" } });
  check("duyệt ⇒ đơn REFUNDED, giao dịch REFUNDED", res.status === 200 && (await orderOf(o3.id)).status === "REFUNDED" && (await prisma.payment.findUniqueOrThrow({ where: { orderId: o3.id } })).status === "REFUNDED", res.body);

  group("HLV mua hàng: yêu cầu hoàn tiền đơn đã thanh toán (từ chối rồi duyệt)");
  res = await buyNow(coach, pB.id, 2);
  check("HLV đặt mua ⇒ 201", res.status === 201, res.body);
  const oc = res.body.data.order;
  await pay(coach, res.body.data.checkout.paymentId);
  const pBpaid = await stockOf(pB.id);
  res = await http("POST", `/shop/orders/${oc.id}/request-refund`, { token: coach.token, body: { reason: "Đặt nhầm" } });
  check("PAID → REFUND_REQUESTED", res.status === 200 && res.body.data.status === "REFUND_REQUESTED", res.body);
  res = await http("POST", `/shop/orders/${oc.id}/request-refund`, { token: coach.token, body: { reason: "Đặt nhầm" } });
  check("gửi lại ⇒ 409", res.status === 409, res.body);
  res = await http("GET", "/refunds/my", { token: coach.token });
  const coachRefund = (res.body.data ?? []).find((r: any) => r.orderId === oc.id);
  check("HLV thấy yêu cầu hoàn tiền của mình (kèm mã đơn)", res.status === 200 && coachRefund?.order?.code === oc.code && coachRefund.member === null, res.body);
  res = await http("PATCH", `/refunds/${coachRefund.id}/reject`, { token: manager.token, body: { reason: "Hàng đã soạn" } });
  check("từ chối ⇒ đơn quay về PAID", res.status === 200 && (await orderOf(oc.id)).status === "PAID", res.body);
  res = await http("POST", `/shop/orders/${oc.id}/request-refund`, { token: coach.token, body: { reason: "Vẫn muốn hủy" } });
  const refund2 = await prisma.refund.findFirst({ where: { orderId: oc.id, status: "PENDING" } });
  res = await http("PATCH", `/refunds/${refund2!.id}/approve`, { token: manager.token, body: {} });
  check("duyệt ⇒ REFUNDED + trả 2 sản phẩm về kho", (await orderOf(oc.id)).status === "REFUNDED" && (await stockOf(pB.id)).stockQuantity === pBpaid.stockQuantity + 2, await stockOf(pB.id));

  group("Hủy đơn chờ thanh toán (khách & Manager) ⇒ nhả hàng");
  const pBbefore = await stockOf(pB.id);
  res = await http("POST", `/shop/orders/${o6.id}/cancel`, { token: m6.token, body: { reason: "Đổi ý" } });
  check("khách hủy ⇒ CANCELLED", res.status === 200 && res.body.data.status === "CANCELLED", res.body);
  res = await setStatus(manager, o6b.id, { status: "CANCELLED", reason: "Khách gọi hủy" });
  check("Manager hủy ⇒ CANCELLED", res.body.data?.status === "CANCELLED", res.body);
  check("nhả 2 sản phẩm giữ", (await stockOf(pB.id)).reservedStock === pBbefore.reservedStock - 2);
  res = await http("POST", `/shop/orders/${o6.id}/cancel`, { token: m6.token, body: {} });
  check("hủy lần 2 ⇒ 409", res.status === 409, res.body);

  group("Kho (Manager): nhập, điều chỉnh, nhật ký, cảnh báo sắp hết");
  res = await http("POST", `/shop/manage/inventory/${pLast.id}`, { token: manager.token, body: { type: "IN", quantity: 5, note: "Nhập lô mới" } });
  check("IN +5 ⇒ stock 6", res.status === 200 && res.body.data.stockQuantity === 6, res.body);
  await buyNow(m1, pLast.id, 2);
  res = await http("POST", `/shop/manage/inventory/${pLast.id}`, { token: manager.token, body: { type: "ADJUST", quantity: -5, note: "Hư hỏng" } });
  check("điều chỉnh xuống dưới số đang giữ ⇒ 409 STOCK_BELOW_RESERVED", res.status === 409 && res.body.errors?.code === "STOCK_BELOW_RESERVED", res.body);
  res = await http("GET", `/shop/manage/inventory/${pLast.id}/transactions`, { token: manager.token });
  const types = (res.body.data ?? []).map((t: any) => t.type);
  check("nhật ký có RESERVE, RELEASE, IN", ["RESERVE", "RELEASE", "IN"].every((t) => types.includes(t)), types);
  res = await http("GET", `/shop/manage/inventory?lowStock=true&search=${RUN}`, { token: manager.token });
  check("cảnh báo sắp hết có pLast (còn bán 4 ≤ 5)", (res.body.data ?? []).some((p: any) => p.id === pLast.id && p.availableStock === 4), res.body.data);
  res = await http("GET", "/shop/manage/summary", { token: manager.token });
  check("summary Manager có số liệu", res.status === 200 && typeof res.body.data.needsAction === "number", res.body);
  res = await http("GET", `/shop/manage/orders?search=${o2.code}`, { token: manager.token });
  check("Manager tìm theo mã đơn", res.body.data?.length === 1 && res.body.data[0].id === o2.id, res.body.data);

  group("API cũ vẫn chạy");
  res = await http("GET", "/products/my/orders", { token: m1.token });
  check("GET /products/my/orders ⇒ có code + items[].product.name", res.status === 200 && res.body.data.some((o: any) => o.code === o1.code && o.items[0].product?.name), res.body.data?.[0]);
  res = await http("GET", `/products/${pA.id}`);
  check("GET /products/:id ⇒ availableStock", typeof res.body.data.availableStock === "number", res.body.data);

  group("Rate limit");
  let limited: HttpResult | null = null;
  for (let i = 0; i < 70 && !limited; i++) {
    const r = await http("GET", "/shop/cart", { token: m5.token }).then(() => http("POST", "/shop/cart/accept-prices", { token: m5.token }));
    if (r.status === 429) limited = r;
  }
  check("spam giỏ hàng ⇒ 429 RATE_LIMITED", limited?.body?.errors?.code === "RATE_LIMITED", limited?.body);
}

async function cleanup() {
  await prisma.inventoryTransaction.deleteMany({ where: { product: { name: { startsWith: RUN } } } });
  await cleanupRun();
}

void runSuite("shop", main, cleanup);
