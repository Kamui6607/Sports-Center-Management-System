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
 * /reports/courses:
 *   get:
 *     summary: Course revenue & commission report (thay cho báo cáo memberships)
 *     description: |
 *       Tổng hợp lượt mua khóa học theo trạng thái + doanh thu/hoa hồng:
 *       - `totalRevenue`: tiền thực thu (payments SUCCESS gắn `coursePurchaseId`, theo `paidAt` trong kỳ).
 *       - `platformCommission` (15%) / `coachEarnings` (85%): chỉ tính các lượt mua đang **ACTIVE**
 *         — dùng để đối soát chi trả cho Coach.
 *       - `topCourses`: 5 khóa học bán chạy nhất trong kỳ.
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
 *       200:
 *         description: Course revenue report
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Course revenue report retrieved successfully
 *               data:
 *                 totalPurchases: 12
 *                 newPurchases: 4
 *                 activePurchases: 9
 *                 expiredPurchases: 2
 *                 cancelledPurchases: 1
 *                 totalRevenue: 5400000
 *                 activeGrossRevenue: 4500000
 *                 platformCommission: 675000
 *                 coachEarnings: 3825000
 *                 topCourses: [{ classId: "class-uuid", className: "Morning Yoga", purchaseCount: 5, revenue: 2500000 }]
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/courses", validate(DateRangeSchema, "query"), reportsController.getCourseRevenueReport);

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

/**
 * @swagger
 * /reports/course-purchase-logs:
 *   get:
 *     summary: Detailed log of course purchases (thay cho subscription-logs)
 *     description: Mỗi dòng gồm member, khóa học, Coach sở hữu, giá, hoa hồng nền tảng và phần Coach nhận.
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
 *       200:
 *         description: Course purchase logs
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Course purchase logs retrieved successfully
 *               data:
 *                 data:
 *                   - id: "purchase-uuid"
 *                     action: "Mua khóa học"
 *                     username: "Phạm Văn An"
 *                     email: "member1@example.com"
 *                     className: "Morning Yoga"
 *                     coachName: "Nguyễn Văn Cường"
 *                     price: 500000
 *                     commissionAmount: 75000
 *                     coachEarning: 425000
 *                     status: ACTIVE
 *                     paymentStatus: SUCCESS
 *                 pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/course-purchase-logs", reportsController.getCoursePurchaseLogs);

export default router;
