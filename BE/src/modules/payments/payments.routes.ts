import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreatePaymentSchema, UpdatePaymentStatusSchema, PaymentQuerySchema } from "./payments.schema.js";
import * as paymentsController from "./payments.controller.js";

const router = Router();

/**
 * @swagger
 * /payments:
 *   post:
 *     summary: Record a payment (auto-creates invoice on SUCCESS)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberId, amount, method]
 *             properties:
 *               memberId: { type: string }
 *               subscriptionId: { type: string }
 *               amount: { type: number }
 *               method: { type: string, enum: [CASH, BANK_TRANSFER] }
 *               status: { type: string, enum: [PENDING, SUCCESS, FAILED] }
 *               note: { type: string }
 *               transactionCode: { type: string }
 *     responses:
 *       201: { $ref: "#/components/responses/PaymentCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate, authorize("MANAGER", "STAFF"),
  validate(CreatePaymentSchema),
  paymentsController.createPayment
);

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List payments with filters
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, SUCCESS, FAILED, REFUNDED] }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [CASH, BANK_TRANSFER] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate, authorize("MANAGER", "STAFF"),
  validate(PaymentQuerySchema, "query"),
  paymentsController.listPayments
);

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id",
  authenticate, authorize("MANAGER", "STAFF"),
  paymentsController.getPaymentById
);

/**
 * @swagger
 * /payments/{id}/status:
 *   patch:
 *     summary: Update payment status
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, SUCCESS, FAILED, REFUNDED] }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/status",
  authenticate, authorize("MANAGER"),
  validate(UpdatePaymentStatusSchema),
  paymentsController.updatePaymentStatus
);

export default router;
