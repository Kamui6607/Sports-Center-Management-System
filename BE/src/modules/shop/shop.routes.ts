import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { validate } from "../../middlewares/validate.js";
import {
  AddCartItemSchema,
  AddressSchema,
  CancelOrderSchema,
  CheckoutPreviewSchema,
  CheckoutSchema,
  InventoryChangeSchema,
  InventoryQuerySchema,
  ManagerStatusSchema,
  OrderQuerySchema,
  PickupConfirmSchema,
  PickupVerifySchema,
  RequestRefundSchema,
  ReviewOrderItemSchema,
  ReviewQuerySchema,
  ReviewVisibilitySchema,
  UpdateAddressSchema,
  UpdateCartItemSchema,
} from "./shop.schema.js";
import * as c from "./shop.controller.js";

const router = Router();

const buyer = [authenticate, authorize("MEMBER", "COACH")];
const manager = [authenticate, authorize("MANAGER")];
const cartLimit = rateLimit({ name: "cart", windowMs: 60_000, max: 60 });
const checkoutLimit = rateLimit({ name: "checkout", windowMs: 60_000, max: 10 });
const reviewLimit = rateLimit({ name: "review", windowMs: 60_000, max: 5 });
const pickupLimit = rateLimit({ name: "pickup", windowMs: 60_000, max: 30 });

/**
 * @swagger
 * tags:
 *   name: Shop
 *   description: |
 *     Cửa hàng — giỏ hàng, sổ địa chỉ, checkout (VietQR/SePay bắt buộc trả trước), đơn hàng theo máy trạng thái,
 *     xử lý đơn / mã nhận hàng / tồn kho / ẩn đánh giá cho Manager. Thiết kế: Doc/SHOP_FLOW_DESIGN.md.
 *     Lỗi nghiệp vụ trả `errors.code` (VD OUT_OF_STOCK, PRICE_CHANGED, PENDING_ORDER_LIMIT, CHECKOUT_LOCKED,
 *     DAILY_LIMIT_EXCEEDED, MAX_PER_ORDER_EXCEEDED, IDEMPOTENCY_KEY_REUSED, ORDER_INVALID_TRANSITION, PICKUP_CODE_INVALID,
 *     PICKUP_LOCKED, PHONE_MISMATCH, REVIEW_NOT_ALLOWED, RATE_LIMITED).
 */

/**
 * @swagger
 * /shop/config:
 *   get:
 *     summary: Cấu hình cửa hàng (giữ hàng, phí ship, khu vực giao, giới hạn…)
 *     tags: [Shop]
 *     responses:
 *       200: { description: "{ holdMinutes, maxPendingOrders, pickupDays, shippingFee, freeShippingThreshold, deliveryProvinces[], … }" }
 */
router.get("/config", c.getConfig);

// ── Giỏ hàng ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /shop/cart:
 *   get:
 *     summary: Giỏ hàng + cảnh báo từng dòng
 *     description: "Mỗi dòng có `warnings[]` (OUT_OF_STOCK, INSUFFICIENT_STOCK, MAX_PER_ORDER_EXCEEDED, PRICE_CHANGED, PRODUCT_INACTIVE) và `purchasable`. `count` = số dòng (badge)."
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ id, items[], count, totalQuantity, subtotal, hasWarnings }" }
 *   delete:
 *     summary: Xóa toàn bộ giỏ
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Giỏ rỗng }
 */
router.get("/cart", ...buyer, c.getCart);
router.delete("/cart", ...buyer, cartLimit, c.clearCart);

/**
 * @swagger
 * /shop/cart/items:
 *   post:
 *     summary: Thêm sản phẩm vào giỏ (cộng dồn). Giỏ không giữ tồn kho.
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1, default: 1 }
 *     responses:
 *       200: { description: Giỏ sau khi thêm }
 *       400: { description: "PRODUCT_INACTIVE / MAX_PER_ORDER_EXCEEDED / CART_FULL" }
 *       409: { description: "OUT_OF_STOCK / INSUFFICIENT_STOCK" }
 *       429: { description: RATE_LIMITED }
 */
router.post("/cart/items", ...buyer, cartLimit, validate(AddCartItemSchema), c.addCartItem);

/**
 * @swagger
 * /shop/cart/items/{productId}:
 *   patch:
 *     summary: Đặt lại số lượng một dòng
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: productId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [quantity], properties: { quantity: { type: integer, minimum: 1 } } } } }
 *     responses:
 *       200: { description: Giỏ sau khi sửa }
 *   delete:
 *     summary: Xóa một dòng
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: productId, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Giỏ sau khi xóa }
 */
router.patch("/cart/items/:productId", ...buyer, cartLimit, validate(UpdateCartItemSchema), c.updateCartItem);
router.delete("/cart/items/:productId", ...buyer, cartLimit, c.removeCartItem);

/**
 * @swagger
 * /shop/cart/accept-prices:
 *   post:
 *     summary: Chấp nhận giá hiện tại cho mọi dòng (xóa cảnh báo PRICE_CHANGED)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Giỏ đã cập nhật giá }
 */
router.post("/cart/accept-prices", ...buyer, cartLimit, c.acceptCartPrices);

// ── Sổ địa chỉ ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /shop/addresses:
 *   get:
 *     summary: Sổ địa chỉ (mặc định lên đầu; `deliverable` = trong khu vực giao)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ id, recipientName, phone, province, district, ward, street, isDefault, fullAddress, deliverable }]" }
 *   post:
 *     summary: Thêm địa chỉ (địa chỉ đầu tiên tự là mặc định; tối đa 10)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientName, phone, province, district, street]
 *             properties:
 *               recipientName: { type: string }
 *               phone: { type: string, example: "0901234567" }
 *               province: { type: string, example: "Hồ Chí Minh" }
 *               district: { type: string }
 *               ward: { type: string }
 *               street: { type: string }
 *               isDefault: { type: boolean }
 *     responses:
 *       201: { description: Địa chỉ mới }
 */
router.get("/addresses", ...buyer, c.listAddresses);
router.post("/addresses", ...buyer, validate(AddressSchema), c.createAddress);

/**
 * @swagger
 * /shop/addresses/{id}:
 *   patch:
 *     summary: Sửa địa chỉ của mình (không phải của mình ⇒ 404)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Địa chỉ sau khi sửa }
 *   delete:
 *     summary: Xóa địa chỉ (xóa mặc định ⇒ địa chỉ cũ nhất còn lại thành mặc định)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Sổ địa chỉ còn lại }
 */
router.patch("/addresses/:id", ...buyer, validate(UpdateAddressSchema), c.updateAddress);
router.delete("/addresses/:id", ...buyer, c.deleteAddress);

/**
 * @swagger
 * /shop/addresses/{id}/default:
 *   post:
 *     summary: Đặt làm địa chỉ mặc định
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Sổ địa chỉ }
 */
router.post("/addresses/:id/default", ...buyer, c.setDefaultAddress);

// ── Checkout ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /shop/checkout/preview:
 *   post:
 *     summary: Xem trước đơn (không ghi) — dòng, tạm tính, phí ship, tổng, cảnh báo, canCheckout
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode, fulfillmentType]
 *             properties:
 *               mode: { type: string, enum: [CART, BUY_NOW] }
 *               productIds: { type: array, items: { type: string }, description: "CART: chọn dòng (trống = cả giỏ)" }
 *               items: { type: array, items: { type: object, properties: { productId: { type: string }, quantity: { type: integer } } }, description: "BUY_NOW" }
 *               fulfillmentType: { type: string, enum: [PICKUP, DELIVERY] }
 *               addressId: { type: string, description: "DELIVERY: địa chỉ trong sổ của chính mình" }
 *               recipientName: { type: string }
 *               recipientPhone: { type: string }
 *               note: { type: string }
 *     responses:
 *       200: { description: "{ lines[], subtotal, shippingFee, total, recipient, address, warnings[], canCheckout, pendingOrders, lockedUntil }" }
 */
router.post("/checkout/preview", ...buyer, cartLimit, validate(CheckoutPreviewSchema), c.previewCheckout);

/**
 * @swagger
 * /shop/checkout:
 *   post:
 *     summary: Tạo đơn + giao dịch VietQR (SePay) — bắt buộc header Idempotency-Key
 *     description: |
 *       Server tự tính giá/tổng; `expectedTotal` là tổng khách đã xem ở bước xem trước — lệch ⇒ 409 PRICE_CHANGED (kèm `preview` mới).
 *       Giữ hàng có điều kiện trong transaction (hai người cùng mua món cuối: chỉ một thành công — 409 OUT_OF_STOCK).
 *       CART chỉ xóa các dòng đã đặt; BUY_NOW không đụng giỏ. Cùng Idempotency-Key ⇒ trả lại đơn cũ (200).
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, minLength: 8 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode, fulfillmentType, expectedTotal]
 *             properties:
 *               mode: { type: string, enum: [CART, BUY_NOW] }
 *               productIds: { type: array, items: { type: string } }
 *               items: { type: array, items: { type: object, properties: { productId: { type: string }, quantity: { type: integer } } } }
 *               fulfillmentType: { type: string, enum: [PICKUP, DELIVERY] }
 *               addressId: { type: string }
 *               recipientName: { type: string }
 *               recipientPhone: { type: string }
 *               note: { type: string }
 *               expectedTotal: { type: integer }
 *     responses:
 *       201: { description: "{ order, checkout: { paymentId, orderCode, amount, qrUrl, expiresAt, bank, order{ id, code } } }" }
 *       200: { description: Idempotent replay (đơn đã tạo với cùng khóa) }
 *       400: { description: "CART_EMPTY / ADDRESS_REQUIRED / DELIVERY_NOT_AVAILABLE / MAX_PER_ORDER_EXCEEDED / DAILY_LIMIT_EXCEEDED / PRODUCT_INACTIVE / IDEMPOTENCY_KEY_REQUIRED" }
 *       403: { description: "CHECKOUT_LOCKED (kèm lockedUntil)" }
 *       409: { description: "OUT_OF_STOCK / INSUFFICIENT_STOCK / PRICE_CHANGED / PENDING_ORDER_LIMIT / IDEMPOTENCY_KEY_REUSED" }
 *       429: { description: RATE_LIMITED }
 *       503: { description: SEPAY_NOT_CONFIGURED }
 */
router.post("/checkout", ...buyer, checkoutLimit, validate(CheckoutSchema), c.createOrder);

// ── Đơn của tôi ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /shop/orders:
 *   get:
 *     summary: Đơn của tôi (lọc nhóm PENDING|ACTIVE|COMPLETED|CLOSED hoặc trạng thái cụ thể)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "data[] + counts{ PENDING, ACTIVE, COMPLETED, CLOSED } + pagination" }
 */
router.get("/orders", ...buyer, validate(OrderQuerySchema, "query"), c.listMyOrders);

/**
 * @swagger
 * /shop/orders/{id}:
 *   get:
 *     summary: Chi tiết đơn của tôi — items (+ quyền đánh giá), history, payment, pickup{code,qrPayload,deadline} khi READY, actions
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Chi tiết đơn }
 *       404: { description: "Không có hoặc không phải đơn của mình (chặn IDOR)" }
 */
router.get("/orders/:id", ...buyer, c.getMyOrder);

/**
 * @swagger
 * /shop/orders/{id}/cancel:
 *   post:
 *     summary: Hủy đơn chờ thanh toán (nhả hàng). Đơn đã thanh toán ⇒ 409 ORDER_PAID_USE_REFUND.
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Đơn đã hủy }
 */
router.post("/orders/:id/cancel", ...buyer, validate(CancelOrderSchema), c.cancelMyOrder);

/**
 * @swagger
 * /shop/orders/{id}/request-refund:
 *   post:
 *     summary: Đơn ĐÃ THANH TOÁN (PAID) ⇒ REFUND_REQUESTED + yêu cầu hoàn tiền (Manager duyệt)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [reason], properties: { reason: { type: string } } } } }
 *     responses:
 *       200: { description: Đơn chờ hoàn tiền }
 *       409: { description: "ORDER_NOT_REFUNDABLE / REFUND_ALREADY_REQUESTED" }
 */
router.post("/orders/:id/request-refund", ...buyer, validate(RequestRefundSchema), c.requestRefund);

/**
 * @swagger
 * /shop/orders/{id}/confirm-received:
 *   post:
 *     summary: Khách xác nhận đã nhận hàng (DELIVERED ⇒ COMPLETED)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Đơn hoàn tất }
 */
router.post("/orders/:id/confirm-received", ...buyer, c.confirmReceived);

/**
 * @swagger
 * /shop/order-items/{id}/review:
 *   post:
 *     summary: Đánh giá một dòng đơn COMPLETED của mình (mỗi dòng tối đa 1 đánh giá)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [rating], properties: { rating: { type: integer, minimum: 1, maximum: 5 }, comment: { type: string } } } } }
 *     responses:
 *       201: { description: Đánh giá }
 *       403: { description: REVIEW_NOT_ALLOWED }
 *       409: { description: REVIEW_EXISTS }
 */
router.post("/order-items/:id/review", ...buyer, reviewLimit, validate(ReviewOrderItemSchema), c.reviewOrderItem);

// ── Manager ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /shop/manage/summary:
 *   get:
 *     summary: Đếm đơn theo trạng thái + số sản phẩm sắp hết
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ byStatus, needsAction, toPrepare, readyForPickup, shipping, refundRequested, lowStockProducts }" }
 */
router.get("/manage/summary", ...manager, c.managerSummary);

/**
 * @swagger
 * /shop/manage/orders:
 *   get:
 *     summary: Danh sách đơn (lọc trạng thái/nhóm, hình thức nhận, tìm mã đơn/tên/SĐT/vận đơn)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: fulfillmentType, schema: { type: string, enum: [PICKUP, DELIVERY] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *     responses:
 *       200: { description: Danh sách đơn }
 */
router.get("/manage/orders", ...manager, validate(OrderQuerySchema, "query"), c.managerListOrders);

/**
 * @swagger
 * /shop/manage/orders/{id}:
 *   get:
 *     summary: Chi tiết đơn cho Manager (người mua, allowedTransitions; không lộ mã nhận hàng)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Chi tiết đơn }
 */
router.get("/manage/orders/:id", ...manager, c.managerGetOrder);

/**
 * @swagger
 * /shop/manage/orders/{id}/status:
 *   post:
 *     summary: Chuyển trạng thái đơn theo máy trạng thái (SHIPPING bắt buộc trackingCode)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [CANCELLED, READY_FOR_PICKUP, PROCESSING, SHIPPING, DELIVERED, COMPLETED, NOT_PICKED_UP, REFUND_REQUESTED] }
 *               reason: { type: string }
 *               trackingCode: { type: string }
 *               carrier: { type: string }
 *     responses:
 *       200: { description: Đơn sau khi chuyển }
 *       409: { description: "ORDER_INVALID_TRANSITION / ORDER_STATE_CHANGED" }
 */
router.post("/manage/orders/:id/status", ...manager, validate(ManagerStatusSchema), c.managerTransition);

/**
 * @swagger
 * /shop/manage/pickup/verify:
 *   post:
 *     summary: Tra mã nhận hàng (QR `SCMS-PICKUP:<mã đơn>:<mã>` hoặc nhập tay) ⇒ tóm tắt đơn để đối chiếu
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [code], properties: { code: { type: string } } } } }
 *     responses:
 *       200: { description: "Tóm tắt đơn + recipientPhoneMasked" }
 *       400: { description: PICKUP_CODE_INVALID }
 */
router.post("/manage/pickup/verify", ...manager, pickupLimit, validate(PickupVerifySchema), c.verifyPickup);

/**
 * @swagger
 * /shop/manage/orders/{id}/pickup:
 *   post:
 *     summary: Xác nhận giao tại quầy (mã + 4 số cuối SĐT) ⇒ COMPLETED; mã dùng một lần
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [code, phoneLast4], properties: { code: { type: string }, phoneLast4: { type: string } } } } }
 *     responses:
 *       200: { description: Đơn hoàn tất }
 *       400: { description: "PICKUP_CODE_INVALID / PHONE_MISMATCH (kèm remainingAttempts)" }
 *       409: { description: "PICKUP_CODE_USED / ORDER_NOT_READY" }
 *       423: { description: "PICKUP_LOCKED (kèm lockedUntil)" }
 */
router.post("/manage/orders/:id/pickup", ...manager, pickupLimit, validate(PickupConfirmSchema), c.confirmPickup);

/**
 * @swagger
 * /shop/manage/inventory:
 *   get:
 *     summary: Tồn kho (stock, reserved, available, lowStock) — sắp hết lên đầu
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: lowStock, schema: { type: string, enum: ["true", "false"] } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses:
 *       200: { description: "data[] + lowStockCount + pagination" }
 */
router.get("/manage/inventory", ...manager, validate(InventoryQuerySchema, "query"), c.listInventory);

/**
 * @swagger
 * /shop/manage/inventory/{productId}:
 *   post:
 *     summary: Nhập hàng (IN, số dương) / điều chỉnh (ADJUST, ±) — ghi nhật ký kho
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: productId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [type, quantity, note], properties: { type: { type: string, enum: [IN, ADJUST] }, quantity: { type: integer }, note: { type: string } } } } }
 *     responses:
 *       200: { description: "{ stockQuantity, reservedStock, availableStock }" }
 *       409: { description: STOCK_BELOW_RESERVED }
 */
router.post("/manage/inventory/:productId", ...manager, validate(InventoryChangeSchema), c.changeInventory);

/**
 * @swagger
 * /shop/manage/inventory/{productId}/transactions:
 *   get:
 *     summary: Nhật ký kho của sản phẩm
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: productId, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "[{ type, quantity, stockAfter, reservedAfter, order{code}, note, createdAt }]" }
 */
router.get("/manage/inventory/:productId/transactions", ...manager, c.listInventoryTransactions);

/**
 * @swagger
 * /shop/manage/reviews:
 *   get:
 *     summary: Đánh giá sản phẩm (lọc sản phẩm / đang ẩn)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Danh sách đánh giá }
 */
router.get("/manage/reviews", ...manager, validate(ReviewQuerySchema, "query"), c.listReviews);

/**
 * @swagger
 * /shop/manage/reviews/{id}:
 *   patch:
 *     summary: Ẩn / hiện đánh giá (điểm trung bình tính lại, không tính đánh giá ẩn)
 *     tags: [Shop]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [isHidden], properties: { isHidden: { type: boolean }, reason: { type: string } } } } }
 *     responses:
 *       200: { description: Đánh giá sau khi cập nhật }
 */
router.patch("/manage/reviews/:id", ...manager, validate(ReviewVisibilitySchema), c.setReviewVisibility);

export default router;
