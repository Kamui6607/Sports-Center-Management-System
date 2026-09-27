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

router.get("/", validate(ProductQuerySchema, "query"), productsController.listProducts);
router.get("/:id", productsController.getProductById);

router.post(
  "/orders",
  authenticate,
  validate(CreateProductOrderSchema),
  productsController.createProductOrder
);

router.get(
  "/my/orders",
  authenticate,
  productsController.listMyProductOrders
);

router.post(
  "/:id/reviews",
  authenticate,
  validate(CreateProductReviewSchema),
  productsController.addProductReview
);

// ── MANAGER: Quản lý sản phẩm ────────────────────────────────────────────────

router.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreateProductSchema),
  productsController.createProduct
);

router.patch(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(UpdateProductSchema),
  productsController.updateProduct
);

router.delete(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  productsController.deleteProduct
);

export default router;
