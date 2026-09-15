import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { DateRangeSchema } from "./reports.schema.js";
import * as reportsController from "./reports.controller.js";

const router = Router();

router.use(authenticate, authorize("MANAGER"));

/**
 * @swagger
 * /reports/revenue:
 *   get:
 *     summary: Revenue report (total, by method, recent payments)
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, example: "2026-01-01" }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, example: "2026-12-31" }
 *     responses:
 *       200: { $ref: "#/components/responses/RevenueReportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/revenue", validate(DateRangeSchema, "query"), reportsController.getRevenueReport);

/**
 * @swagger
 * /reports/members:
 *   get:
 *     summary: Member report (total, new, active, by tier)
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/MemberReportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/members", validate(DateRangeSchema, "query"), reportsController.getMemberReport);

/**
 * @swagger
 * /reports/enrollments:
 *   get:
 *     summary: Enrollment report (top classes, by type)
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/EnrollmentReportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/enrollments", validate(DateRangeSchema, "query"), reportsController.getEnrollmentReport);

/**
 * @swagger
 * /reports/memberships:
 *   get:
 *     summary: Membership subscription report (by status, tier, revenue)
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/MembershipReportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/memberships", validate(DateRangeSchema, "query"), reportsController.getMembershipReport);

export default router;
