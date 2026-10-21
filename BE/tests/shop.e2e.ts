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
import { addDays, vnDateString, vnDayStart } from "../src/modules/shop/pickup-schedule.js";
import { check, group, http, RUN, runSuite, type HttpResult } from "./helpers/e2e.js";
import { cleanupRun, createUser, login, type TestUser } from "./helpers/fixtures.js";

const PHONE = "0901234567";
/** "YYYY-MM-DD" (giờ VN) của hôm nay + offset ngày. */
const vnDate = (offset: number) => vnDateString(addDays(vnDayStart(new Date()), offset));
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
  const m8 = await login(await createUser("MEMBER"));
  const m9 = await login(await createUser("MEMBER"));
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
  check("2 × 55.000 + ship 15.000 = 125.000", res.body.data.subtotal === 110_000 && res.body.data.shippingFee === 15_000 && res.body.data.total === 125_000, res.body.data);
  res = await checkout(m2, { ...delBody, addressId: hcm.id, expectedTotal: 125_000 });
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
  check("Refund ORDER_NOT_PICKED_UP = 100% (300.000), lần bùng đầu không trừ phí", npRefund?.status === "PENDING" && Number(npRefund.amount) === 300_000 && npRefund.feePercent === null, npRefund);
  res = await http("GET", `/shop/manage/orders/${o3.id}`, { token: manager.token });
  check("Manager thấy hoàn tiền chờ STK + khách bùng 1 lần", res.body.data?.refunds?.[0]?.awaitingBankInfo === true && res.body.data.buyer.noShowCount === 1, res.body.data?.refunds);
  res = await http("PATCH", `/refunds/${npRefund!.id}/approve`, { token: manager.token, body: { note: "CK hoàn" } });
  check("duyệt chuyển khoản khi chưa có STK ⇒ 409 REFUND_BANK_INFO_REQUIRED", res.status === 409 && res.body.errors?.code === "REFUND_BANK_INFO_REQUIRED", res.body);
  res = await http("POST", `/shop/manage/orders/${o3.id}/remind-refund-bank`, { token: manager.token });
  check("Manager nhắc khách gửi STK ⇒ 200", res.status === 200 && !!res.body.data.refunds[0].bankInfoRequestedAt, res.body);
  res = await http("POST", `/shop/manage/orders/${o3.id}/remind-refund-bank`, { token: manager.token });
  check("nhắc lại ngay ⇒ 429 REFUND_REMINDER_TOO_SOON", res.status === 429 && res.body.errors?.code === "REFUND_REMINDER_TOO_SOON", res.body);
  res = await http("PUT", `/shop/orders/${o3.id}/refund-bank`, { token: m3.token, body: { bankName: "MBBank", bankAccountNumber: "0123 456 789", bankAccountName: "Nguyen Van A" } });
  check("khách cập nhật STK ⇒ lưu (bỏ khoảng trắng, in hoa tên)", res.status === 200 && res.body.data.refunds[0].bankAccountNumber === "0123456789" && res.body.data.refunds[0].bankAccountName === "NGUYEN VAN A", res.body);
  res = await http("PUT", `/shop/orders/${o3.id}/refund-bank`, { token: m4.token, body: { bankName: "MBBank", bankAccountNumber: "0123456789", bankAccountName: "Hacker" } });
  check("người khác sửa STK ⇒ 404 (IDOR)", res.status === 404, res.body);
  res = await http("PATCH", `/refunds/${npRefund!.id}/approve`, { token: manager.token, body: { note: "CK hoàn", transactionRef: "FT123" } });
  check("duyệt ⇒ đơn REFUNDED, giao dịch REFUNDED, payoutMethod BANK_TRANSFER", res.status === 200 && res.body.data.payoutMethod === "BANK_TRANSFER" && (await orderOf(o3.id)).status === "REFUNDED" && (await prisma.payment.findUniqueOrThrow({ where: { orderId: o3.id } })).status === "REFUNDED", res.body);

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
  res = await http("PATCH", `/refunds/${refund2!.id}/approve`, { token: manager.token, body: { payoutMethod: "CASH" } });
  check("duyệt hoàn tiền mặt tại quầy (không cần STK) ⇒ REFUNDED + trả 2 sản phẩm về kho", res.body.data?.payoutMethod === "CASH" && (await orderOf(oc.id)).status === "REFUNDED" && (await stockOf(pB.id)).stockQuantity === pBpaid.stockQuantity + 2, res.body);

  group("Trả tiền tại quầy + ngày dự định lấy + đổi ngày");
  const pCash = await product("Bình nước", 100_000, 10);
  const pBig = await product("Máy chạy", 2_500_000, 3);
  const cashBody = (extra: Record<string, unknown> = {}) => ({ mode: "BUY_NOW", items: [{ productId: pCash.id, quantity: 1 }], fulfillmentType: "PICKUP", recipientPhone: PHONE, paymentMethod: "CASH", ...extra });
  res = await http("POST", "/shop/checkout/preview", { token: m8.token, body: cashBody({ pickupDate: vnDate(8) }) });
  check("ngày lấy quá 7 ngày ⇒ cảnh báo PICKUP_DATE_OUT_OF_RANGE", res.body.data?.canCheckout === false && res.body.data.warnings.some((w: any) => w.code === "PICKUP_DATE_OUT_OF_RANGE"), res.body.data);
  res = await http("POST", "/shop/checkout/preview", { token: m8.token, body: cashBody({ pickupDate: vnDate(2) }) });
  check("xem trước CASH: ship 0, cash.available, khoảng ngày [hôm nay, +7]", res.body.data?.canCheckout === true && res.body.data.shippingFee === 0 && res.body.data.cash.available === true && res.body.data.pickupDateRange.max === vnDate(7), res.body.data);
  res = await http("POST", "/shop/checkout/preview", { token: m8.token, body: { ...cashBody(), fulfillmentType: "DELIVERY" } });
  check("CASH + DELIVERY ⇒ 400 (chỉ nhận tại quầy)", res.status === 400, res.body);
  res = await http("POST", "/shop/checkout/preview", { token: m9.token, body: cashBody({ items: [{ productId: pBig.id, quantity: 1 }] }) });
  check("đơn 2.500.000 trả tại quầy ⇒ CASH_ORDER_TOO_LARGE", res.body.data?.cash?.code === "CASH_ORDER_TOO_LARGE" && res.body.data.canCheckout === false, res.body.data);
  const cashStock0 = await stockOf(pCash.id);
  res = await checkout(m8, { ...cashBody({ pickupDate: vnDate(2) }), expectedTotal: 100_000 });
  check("đặt trả tại quầy ⇒ 201 CONFIRMED, không có QR", res.status === 201 && res.body.data.order.status === "CONFIRMED" && res.body.data.checkout === null && res.body.data.order.paymentMethod === "CASH", res.body);
  const oc1 = res.body.data.order;
  check("ngày hẹn lưu đúng + giữ hàng (reserved +1)", oc1.preferredPickupDate === vnDate(2) && (await stockOf(pCash.id)).reservedStock === cashStock0.reservedStock + 1, oc1.preferredPickupDate);
  res = await checkout(m8, { ...cashBody(), expectedTotal: 100_000 });
  check("đơn trả tại quầy thứ 2 khi đơn 1 chưa nhận ⇒ 409 CASH_ORDER_LIMIT", res.status === 409 && res.body.errors?.code === "CASH_ORDER_LIMIT", res.body);
  res = await http("GET", `/shop/orders/${oc1.id}`, { token: m8.token });
  check("chủ đơn: hủy được, đổi ngày được, cần trả 100.000 tại quầy", res.body.data.actions.canCancel && res.body.data.actions.canReschedulePickup && res.body.data.amountDueAtCounter === 100_000, res.body.data.actions);
  res = await http("POST", `/shop/orders/${oc1.id}/reschedule-pickup`, { token: m8.token, body: { pickupDate: vnDate(6) } });
  check("dời quá 3 ngày ⇒ 400 PICKUP_DATE_OUT_OF_RANGE", res.status === 400 && res.body.errors?.code === "PICKUP_DATE_OUT_OF_RANGE", res.body);
  res = await http("POST", `/shop/orders/${oc1.id}/reschedule-pickup`, { token: m8.token, body: { pickupDate: vnDate(4) } });
  check("dời sang +4 ngày ⇒ 200", res.status === 200 && res.body.data.preferredPickupDate === vnDate(4) && res.body.data.pickupRescheduleCount === 1, res.body);
  res = await http("POST", `/shop/orders/${oc1.id}/reschedule-pickup`, { token: m8.token, body: { pickupDate: vnDate(5) } });
  check("đổi lần 2 ⇒ 409 PICKUP_RESCHEDULE_LIMIT", res.status === 409 && res.body.errors?.code === "PICKUP_RESCHEDULE_LIMIT", res.body);
  res = await setStatus(manager, oc1.id, { status: "REFUND_REQUESTED", reason: "Thử hoàn" });
  check("đơn chưa thu tiền: không có hủy & hoàn tiền ⇒ 409", res.status === 409, res.body);
  res = await setStatus(manager, oc1.id, { status: "READY_FOR_PICKUP" });
  const expectDeadline = addDays(vnDayStart(new Date()), 4 + 3 + 1).getTime() - 1000;
  check("CONFIRMED → READY, hạn nhận = cuối ngày (ngày hẹn + 3)", res.status === 200 && new Date(res.body.data.pickup.deadline).getTime() === expectDeadline && res.body.data.pickup.requiresCashCollection === true, res.body.data?.pickup);
  res = await http("GET", `/shop/orders/${oc1.id}`, { token: m8.token });
  const cashCode = res.body.data.pickup.code;
  res = await http("POST", `/shop/manage/orders/${oc1.id}/pickup`, { token: manager.token, body: { code: cashCode, phoneLast4: "4567" } });
  check("giao mà chưa xác nhận thu tiền ⇒ 400 CASH_COLLECTION_REQUIRED", res.status === 400 && res.body.errors?.code === "CASH_COLLECTION_REQUIRED", res.body);
  res = await http("POST", `/shop/manage/orders/${oc1.id}/pickup`, { token: manager.token, body: { code: cashCode, phoneLast4: "4567", cashCollected: true } });
  const cashPay = await prisma.payment.findUnique({ where: { orderId: oc1.id } });
  check("thu tiền + giao ⇒ COMPLETED, giao dịch CASH SUCCESS 100.000", res.body.data?.status === "COMPLETED" && cashPay?.method === "CASH" && cashPay.status === "SUCCESS" && Number(cashPay.amount) === 100_000, cashPay);
  check("SALE: stock −1, reserved trở lại", JSON.stringify(await stockOf(pCash.id)) === JSON.stringify({ stockQuantity: cashStock0.stockQuantity - 1, reservedStock: cashStock0.reservedStock }));

  group("Trả tại quầy: khách hủy, nhắc hạn, quá hạn (bùng hàng) ⇒ khóa trả tại quầy, phí giữ hàng");
  res = await checkout(m8, { ...cashBody(), expectedTotal: 100_000 });
  const oc2 = res.body.data.order;
  res = await http("POST", `/shop/orders/${oc2.id}/cancel`, { token: m8.token, body: { reason: "Đổi ý" } });
  check("khách hủy đơn trả tại quầy ⇒ CANCELLED, nhả hàng", res.body.data?.status === "CANCELLED" && (await stockOf(pCash.id)).reservedStock === cashStock0.reservedStock, res.body);
  res = await http("GET", `/shop/manage/orders?queue=PICKUP_TODAY&search=${PHONE}`, { token: manager.token });
  check("hàng đợi PICKUP_TODAY trả 200", res.status === 200 && Array.isArray(res.body.data), res.body);
  const noShow = async () => {
    const r = await checkout(m8, { ...cashBody(), expectedTotal: 100_000 });
    const o = r.body.data.order;
    await setStatus(manager, o.id, { status: "READY_FOR_PICKUP" });
    return o;
  };
  const oc3 = await noShow();
  await prisma.order.update({ where: { id: oc3.id }, data: { pickupDeadline: new Date(Date.now() + 2 * 3_600_000) } });
  let run = await runShopMaintenance();
  check("job: sắp hết hạn ⇒ nhắc 1 lần", run.reminded >= 1 && !!(await orderOf(oc3.id)).pickupReminderSentAt, run);
  run = await runShopMaintenance();
  check("chạy lại không nhắc trùng", (await prisma.notification.count({ where: { userId: m8.id, title: { contains: "sắp hết hạn nhận" } } })) === 1, run);
  const before3 = await stockOf(pCash.id);
  await prisma.order.update({ where: { id: oc3.id }, data: { pickupDeadline: new Date(Date.now() - 1000) } });
  await runShopMaintenance();
  const after3 = await stockOf(pCash.id);
  check("quá hạn đơn chưa trả ⇒ NOT_PICKED_UP, nhả hàng (stock giữ nguyên), không hoàn tiền",
    (await orderOf(oc3.id)).status === "NOT_PICKED_UP" && after3.reservedStock === before3.reservedStock - 1 && after3.stockQuantity === before3.stockQuantity && (await prisma.refund.count({ where: { orderId: oc3.id } })) === 0, after3);
  check("bùng lần 1 ⇒ chưa khóa trả tại quầy", (await prisma.user.findUniqueOrThrow({ where: { id: m8.id } })).cashPickupLockedUntil === null);
  const oc4 = await noShow();
  await prisma.order.update({ where: { id: oc4.id }, data: { pickupDeadline: new Date(Date.now() - 1000) } });
  await runShopMaintenance();
  const lockedCash = (await prisma.user.findUniqueOrThrow({ where: { id: m8.id } })).cashPickupLockedUntil;
  check("bùng lần 2 trong 90 ngày ⇒ khóa trả tại quầy ~30 ngày", !!lockedCash && lockedCash.getTime() > Date.now() + 29 * 86_400_000, lockedCash);
  res = await checkout(m8, { ...cashBody(), expectedTotal: 100_000 });
  check("đang khóa ⇒ đặt CASH 403 CASH_PAYMENT_LOCKED", res.status === 403 && res.body.errors?.code === "CASH_PAYMENT_LOCKED", res.body);
  res = await buyNow(m8, pCash.id, 1);
  check("vẫn đặt được bằng chuyển khoản trước", res.status === 201 && res.body.data.order.status === "PENDING_PAYMENT", res.body);
  const op = res.body.data.order;
  await pay(m8, res.body.data.checkout.paymentId);
  await setStatus(manager, op.id, { status: "READY_FOR_PICKUP" });
  await prisma.order.update({ where: { id: op.id }, data: { pickupDeadline: new Date(Date.now() - 1000) } });
  await runShopMaintenance();
  const feeRefund = await prisma.refund.findFirst({ where: { orderId: op.id, reason: "ORDER_NOT_PICKED_UP" } });
  check("bùng lần 3 (đã trả) ⇒ hoàn 90% (trừ 10% phí giữ hàng)", Number(feeRefund?.amount) === 90_000 && feeRefund?.feePercent === 10 && Number(feeRefund.grossAmount) === 100_000, feeRefund);
  res = await http("GET", `/shop/manage/orders?queue=REFUND_PENDING&search=${op.code}`, { token: manager.token });
  check("hàng đợi REFUND_PENDING có đơn + cờ chờ STK", res.body.data?.[0]?.pendingRefund?.awaitingBankInfo === true, res.body.data);
  await prisma.refund.update({ where: { id: feeRefund!.id }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
  res = await http("GET", `/shop/manage/orders?queue=STALE_REFUND&search=${op.code}`, { token: manager.token });
  check("chờ hoàn quá 30 ngày ⇒ hàng đợi STALE_REFUND + isStale", res.body.data?.[0]?.pendingRefund?.isStale === true, res.body.data);
  res = await http("GET", "/shop/manage/summary", { token: manager.token });
  check("summary có staleRefunds / awaitingBankInfo / pickupToday", res.body.data.staleRefunds >= 1 && res.body.data.awaitingBankInfo >= 1 && typeof res.body.data.pickupToday === "number", res.body.data);
  res = await buyNow(m9, pCash.id, 1);
  await pay(m9, res.body.data.checkout.paymentId);
  res = await setStatus(manager, res.body.data.order.id, { status: "REFUND_REQUESTED" });
  check("Manager hủy & hoàn tiền không ghi lý do ⇒ 400 CANCEL_REASON_REQUIRED", res.status === 400 && res.body.errors?.code === "CANCEL_REASON_REQUIRED", res.body);

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
