import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  PurchaseCourseSchema,
  CoursePurchaseQuerySchema,
  CancelCoursePurchaseSchema,
  UpdateCoursePurchaseStatusSchema,
} from "./course-purchases.schema.js";
import * as purchasesController from "./course-purchases.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Course Purchases
 *   description: |
 *     Member mua KHÓA HỌC (thay cho Membership cũ). Mô hình hoa hồng đã chốt là **khấu trừ**:
 *     Member trả ĐÚNG giá niêm yết `Class.price`; nền tảng (Manager) giữ 15%;
 *     Coach sở hữu khóa học nhận 85%. Cả 3 con số (`price`, `commissionAmount`, `coachEarning`)
 *     được snapshot trên từng lượt mua để đối soát.
 */

/**
 * @swagger
 * /course-purchases:
 *   post:
 *     summary: Buy a course (MEMBER buys for self; MANAGER buys on behalf of a member)
 *     description: |
 *       - Tạo `CoursePurchase` (ACTIVE) + `Payment` (SUCCESS) + `Invoice` trong cùng 1 transaction.
 *       - Member mua khóa học của chính mình; MANAGER phải truyền `memberId` (userId hoặc MemberProfile.id).
 *       - `endDate = now + Class.durationDays` (khóa không đặt `durationDays` ⇒ không giới hạn thời hạn).
 *       - Mỗi member chỉ giữ **1 lượt ACTIVE / khóa**; mua lại được khi lượt cũ đã EXPIRED/CANCELLED.
 *       - Khóa học phải đang `isActive`; Member phải đang hoạt động và có role MEMBER.
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId]
 *             properties:
 *               classId: { type: string, description: "Class.id (khóa học)" }
 *               memberId: { type: string, description: "Bắt buộc khi MANAGER mua hộ (userId hoặc MemberProfile.id)" }
 *               method: { type: string, enum: [CASH, BANK_TRANSFER], default: BANK_TRANSFER }
 *               note: { type: string }
 *               transactionCode: { type: string }
 *           example:
 *             classId: "9f1a2b3c-0000-0000-0000-000000000001"
 *             method: "BANK_TRANSFER"
 *     responses:
 *       201:
 *         description: Mua khóa học thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Course purchased successfully
 *               data:
 *                 id: "purchase-uuid"
 *                 price: "500000"
 *                 commissionRate: 0.15
 *                 commissionAmount: "75000"
 *                 coachEarning: "425000"
 *                 status: ACTIVE
 *                 endDate: "2026-10-25T00:00:00.000Z"
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409:
 *         description: Đã sở hữu khóa học
 *         content:
 *           application/json:
 *             example: { success: false, message: "Bạn đã sở hữu khóa học này." }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate, authorize("MEMBER", "MANAGER"),
  validate(PurchaseCourseSchema),
  purchasesController.purchaseCourse
);

/**
 * @swagger
 * /course-purchases/my:
 *   get:
 *     summary: List my purchased courses (MEMBER)
 *     description: Chỉ trả lượt mua của CHÍNH member đang đăng nhập, kèm `daysRemaining` (null = vô hạn).
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED] }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseListOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/my",
  authenticate, authorize("MEMBER"),
  validate(CoursePurchaseQuerySchema, "query"),
  purchasesController.getMyPurchases
);

/**
 * @swagger
 * /course-purchases/my-sales:
 *   get:
 *     summary: List sales of my own courses (COACH)
 *     description: |
 *       Coach xem các lượt Member mua khóa học do mình sở hữu (`Class.ownerCoachId`),
 *       kèm `summary.grossRevenue`, `summary.platformCommission`, `summary.coachEarning`.
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED] }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseListOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/my-sales",
  authenticate, authorize("COACH"),
  validate(CoursePurchaseQuerySchema, "query"),
  purchasesController.listMySales
);

/**
 * @swagger
 * /course-purchases:
 *   get:
 *     summary: List all course purchases + commission summary (MANAGER)
 *     description: |
 *       Bộ lọc `status`, `classId`, `coachId`, `memberId` (userId hoặc MemberProfile.id).
 *       `summary` chỉ tính các lượt đang ACTIVE: `grossRevenue` (member trả),
 *       `platformCommission` (15%), `coachEarnings` (85%).
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED] }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: coachId
 *         schema: { type: string }
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseListOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate, authorize("MANAGER"),
  validate(CoursePurchaseQuerySchema, "query"),
  purchasesController.listPurchases
);

/**
 * @swagger
 * /course-purchases/{id}:
 *   get:
 *     summary: Get a course purchase (owning MEMBER, owning COACH, or MANAGER)
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id",
  authenticate, authorize("MEMBER", "COACH", "MANAGER"),
  purchasesController.getPurchaseById
);

/**
 * @swagger
 * /course-purchases/{id}/cancel:
 *   patch:
 *     summary: Cancel a course purchase (owning MEMBER or MANAGER)
 *     description: |
 *       Lượt mua → `CANCELLED`; toàn bộ buổi học tương lai của member trong khóa đó bị hủy để nhả chỗ.
 *       Hoàn tiền KHÔNG tự động — MANAGER xử lý qua `PATCH /payments/{id}/status` (REFUNDED).
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/cancel",
  authenticate, authorize("MEMBER", "MANAGER"),
  validate(CancelCoursePurchaseSchema),
  purchasesController.cancelPurchase
);

/**
 * @swagger
 * /course-purchases/{id}/status:
 *   patch:
 *     summary: Update course purchase status (MANAGER)
 *     description: Đổi trạng thái lượt mua (`ACTIVE` kích hoạt lại / `EXPIRED` / `CANCELLED`).
 *     tags: [Course Purchases]
 *     security:
 *       - BearerAuth: []
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
 *               status: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED] }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/status",
  authenticate, authorize("MANAGER"),
  validate(UpdateCoursePurchaseStatusSchema),
  purchasesController.updatePurchaseStatus
);

export default router;
