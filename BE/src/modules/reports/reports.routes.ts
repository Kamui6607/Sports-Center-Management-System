import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { DateRangeSchema, AttendanceReportQuerySchema } from "./reports.schema.js";
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

/**
 * @swagger
 * /reports/subscription-logs:
 *   get:
 *     summary: Detailed log of subscription purchases
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { $ref: "#/components/responses/SubscriptionLogListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
/**
 * @swagger
 * /reports/attendance:
 *   get:
 *     summary: Attendance report per (member × class) with OK/WARN/RELEASE status
 *     description: |
 *       Cửa sổ cố định: tối đa 10 buổi ĐÃ KẾT THÚC gần nhất của (member × class) — KHÔNG theo schedule,
 *       nên đổi buổi trong cùng lớp không reset lịch sử.
 *       `rate = (PRESENT + LATE) / (PRESENT + LATE + ABSENT + NO_SHOW)`; EXCUSED không vào tử/mẫu.
 *       sampleSize < 5 -> OK; rate >= 80% -> OK; 70% <= rate < 80% -> WARN; rate < 70% -> RELEASE.
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OK, WARN, RELEASE] }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: memberId
 *         schema: { type: string, description: MemberProfile.id }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Attendance report
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attendance report retrieved successfully
 *               data:
 *                 summary: { total: 12, ok: 9, warn: 2, release: 1 }
 *                 rows:
 *                   - memberId: "member-uuid"
 *                     memberName: "Nguyễn Văn A"
 *                     classId: "class-uuid"
 *                     className: "Yoga cơ bản"
 *                     sampleSize: 8
 *                     presentCount: 5
 *                     lateCount: 0
 *                     absentCount: 2
 *                     noShowCount: 1
 *                     excusedCount: 1
 *                     attendanceRate: 62.5
 *                     status: RELEASE
 *                     activePenalty: null
 *               pagination: { page: 1, limit: 20, total: 12, totalPages: 1 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/attendance",
  validate(AttendanceReportQuerySchema, "query"),
  reportsController.getAttendanceReport
);

router.get("/subscription-logs", reportsController.getSubscriptionLogs);

export default router;
