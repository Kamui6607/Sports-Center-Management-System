import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateSubscriptionSchema,
  RenewSubscriptionSchema,
  UpdateStatusSchema,
  SubscriptionQuerySchema,
} from "./subscriptions.schema.js";
import * as subsController from "./subscriptions.controller.js";

const router = Router();

/**
 * @swagger
 * /subscriptions:
 *   post:
 *     summary: Register member to a membership plan
 *     tags: [Subscriptions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberId, planId, paymentMethod]
 *             properties:
 *               memberId: { type: string }
 *               planId: { type: string }
 *               startDate: { type: string }
 *               paymentMethod: { type: string, enum: [CASH, BANK_TRANSFER] }
 *               note: { type: string }
 *     responses:
 *       201: { $ref: "#/components/responses/SubscriptionCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate, authorize("MANAGER", "STAFF"),
  validate(CreateSubscriptionSchema),
  subsController.createSubscription
);

/**
 * @swagger
 * /subscriptions/{id}/renew:
 *   post:
 *     summary: Renew a membership subscription
 *     tags: [Subscriptions]
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
 *             required: [planId, paymentMethod]
 *             properties:
 *               planId: { type: string }
 *               paymentMethod: { type: string, enum: [CASH, BANK_TRANSFER] }
 *               note: { type: string }
 *     responses:
 *       201: { $ref: "#/components/responses/SubscriptionCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:id/renew",
  authenticate, authorize("MANAGER", "STAFF"),
  validate(RenewSubscriptionSchema),
  subsController.renewSubscription
);

/**
 * @swagger
 * /subscriptions/member/{memberId}:
 *   get:
 *     summary: Get all subscriptions for a member
 *     tags: [Subscriptions]
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED, SUSPENDED] }
 *     responses:
 *       200: { $ref: "#/components/responses/SubscriptionListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/member/:memberId",
  authenticate,
  validate(SubscriptionQuerySchema, "query"),
  subsController.getMemberSubscriptions
);

/**
 * @swagger
 * /subscriptions/{id}:
 *   get:
 *     summary: Get subscription by ID
 *     tags: [Subscriptions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/SubscriptionOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id",
  authenticate, authorize("MANAGER", "STAFF"),
  subsController.getSubscriptionById
);

/**
 * @swagger
 * /subscriptions/{id}/status:
 *   patch:
 *     summary: Update subscription status
 *     tags: [Subscriptions]
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
 *               status: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED, SUSPENDED] }
 *     responses:
 *       200: { $ref: "#/components/responses/SubscriptionOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/status",
  authenticate, authorize("MANAGER"),
  validate(UpdateStatusSchema),
  subsController.updateSubscriptionStatus
);

export default router;
