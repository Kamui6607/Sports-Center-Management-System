import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQuerySchema,
  CreateProductOrderSchema,
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
 *     summary: List all active products
 *     tags: [Products]
 *     parameters:
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
 *     summary: Create a product order
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1 }
 *     responses:
 *       201:
 *         description: Created
 */
router.post(
  "/orders",
  authenticate,
  validate(CreateProductOrderSchema),
  productsController.createProductOrder
);

/**
 * @swagger
 * /products/my/orders:
 *   get:
 *     summary: Get my product orders
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
  productsController.listMyProductOrders
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
