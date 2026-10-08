import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQuerySchema,
  CreateOrderSchema,
  CreateProductReviewSchema,
} from "./products.schema.js";
import * as productsController from "./products.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Shop products management
 */

// ── MEMBER & COACH: Xem và mua ───────────────────────────────────────────────

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products (default — only products on sale)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ["true", "false", "all"]
 *         description: "Mặc định true (đang bán). false = đã ngừng bán, all = tất cả (cho Manager)."
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/", validate(ProductQuerySchema, "query"), productsController.listProducts);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get product details by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/:id", productsController.getProductById);

/**
 * @swagger
 * /products/orders:
 *   post:
 *     summary: Create an order (multiple products) and its SePay (VietQR) payment
 *     description: |
 *       Chỉ MEMBER hoặc COACH. Giữ hàng (trừ kho từng sản phẩm) ngay khi tạo đơn; `totalAmount` mỗi dòng = quantity × unitPrice, `totalPrice` đơn = tổng các `totalAmount`; đơn ở trạng thái PENDING và trả về
 *       thông tin QR chuyển khoản (giống `POST /payments/sepay/checkout`). FE polling
 *       `GET /payments/sepay/{paymentId}` để biết khi nào đơn được thanh toán.
 *       - SePay báo đã thu tiền ⇒ đơn SUCCESS + thông báo.
 *       - Hủy (`POST /products/orders/{id}/cancel`) hoặc quá hạn chờ chuyển khoản ⇒ đơn CANCELLED, hoàn kho.
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 description: Các sản phẩm trong đơn (cùng productId lặp lại sẽ được cộng dồn số lượng)
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId: { type: string }
 *                     quantity: { type: integer, minimum: 1 }
 *     responses:
 *       201:
 *         description: Đơn PENDING + thông tin QR (paymentId, orderCode, amount, qrUrl, expiresAt, order{ id, totalPrice, status, items[{ productId, productName, quantity, unitPrice, totalAmount }] })
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       503: { description: "Chưa cấu hình tài khoản nhận tiền SePay" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/orders",
  authenticate,
  authorize("MEMBER", "COACH"),
  validate(CreateOrderSchema),
  productsController.createOrder
);

/**
 * @swagger
 * /products/orders/{id}/cancel:
 *   post:
 *     summary: Cancel a PENDING order (restores stock)
 *     description: Người đặt đơn hoặc MANAGER. Chỉ hủy được đơn chưa thanh toán; đơn đã thu tiền ⇒ 409.
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Đơn đã hủy, kho đã được hoàn lại
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/orders/:id/cancel",
  authenticate,
  authorize("MEMBER", "COACH", "MANAGER"),
  productsController.cancelOrder
);

/**
 * @swagger
 * /products/my/orders:
 *   get:
 *     summary: Get my orders (with items)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get(
  "/my/orders",
  authenticate,
  productsController.listMyOrders
);

/**
 * @swagger
 * /products/{id}/reviews:
 *   post:
 *     summary: Add a review for a product
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */
router.post(
  "/:id/reviews",
  authenticate,
  validate(CreateProductReviewSchema),
  productsController.addProductReview
);

// ── MANAGER: Quản lý sản phẩm ────────────────────────────────────────────────

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product (Manager only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, price, stockQuantity]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               stockQuantity: { type: integer }
 *     responses:
 *       201:
 *         description: Created
 */
router.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreateProductSchema),
  productsController.createProduct
);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update an existing product (Manager only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               stockQuantity: { type: integer }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: OK
 */
router.patch(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(UpdateProductSchema),
  productsController.updateProduct
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product (Manager only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.delete(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  productsController.deleteProduct
);

export default router;
