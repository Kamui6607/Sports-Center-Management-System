import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { InvoiceQuerySchema } from "./invoices.schema.js";
import * as invoicesController from "./invoices.controller.js";

const router = Router();

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: List all invoices
 *     tags: [Invoices]
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ISSUED, CANCELLED] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/InvoiceListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate, authorize("MANAGER", "STAFF"),
  validate(InvoiceQuerySchema, "query"),
  invoicesController.listInvoices
);

/**
 * @swagger
 * /invoices/member/{memberId}:
 *   get:
 *     summary: Get invoices for a specific member
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/InvoiceListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/member/:memberId",
  authenticate, authorize("MANAGER", "STAFF"),
  invoicesController.getMemberInvoices
);

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get invoice by ID
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/InvoiceOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id",
  authenticate, authorize("MANAGER", "STAFF"),
  invoicesController.getInvoiceById
);

export default router;
