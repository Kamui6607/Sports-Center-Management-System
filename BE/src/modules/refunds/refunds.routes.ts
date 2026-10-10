import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  RefundIdSchema,
  RequestCourseRefundSchema,
  ApproveRefundSchema,
  RejectRefundSchema,
  RefundQuerySchema,
  CourseRefundPreviewSchema,
} from "./refunds.schema.js";
import * as refundsController from "./refunds.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Refunds
 *   description: Hủy khóa học & hoàn tiền (Manager chuyển khoản tay rồi duyệt)
 */

/**
 * @swagger
 * /refunds/course-cancellation:
 *   post:
 *     summary: MEMBER xin hủy khóa học và hoàn tiền (trước khai giảng ≥ 24h)
 *     description: |
 *       Tạo yêu cầu hoàn tiền PENDING cho giao dịch lớp học đã thu tiền gần nhất của hội viên.
 *       - Chỉ khi còn ≥ 24h trước buổi khai giảng; trễ hơn ⇒ 400 `COURSE_CANCEL_TOO_LATE`.
 *       - Hoàn phần còn lại của giao dịch (100% nếu chưa có khoản hoàn buổi lẻ nào).
 *       - Chỗ đã đặt vẫn giữ tới khi Manager duyệt; duyệt ⇒ trừ ví HLV, giao dịch REFUNDED, hủy chỗ.
 *     tags: [Refunds]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId]
 *             properties:
 *               classId: { type: string }
 *               note: { type: string, maxLength: 500, description: "Lý do hủy (tuỳ chọn)" }
 *     responses:
 *       201: { description: Yêu cầu hoàn tiền đã được tạo (PENDING) }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/course-cancellation",
  authenticate,
  authorize("MEMBER"),
  validate(RequestCourseRefundSchema),
  refundsController.requestCourseRefund
);

/**
 * @swagger
 * /refunds/my:
 *   get:
 *     summary: MEMBER xem các yêu cầu hoàn tiền của mình
 *     tags: [Refunds]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, COMPLETED, REJECTED] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get(
  "/my",
  authenticate,
  // HLV mua hàng cũng có yêu cầu hoàn tiền đơn hàng (ORDER_*).
  authorize("MEMBER", "COACH"),
  validate(RefundQuerySchema, "query"),
  refundsController.listMyRefunds
);

/**
 * @swagger
 * /refunds:
 *   get:
 *     summary: MANAGER xem danh sách yêu cầu hoàn tiền
 *     tags: [Refunds]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, COMPLETED, REJECTED] } }
 *       - { in: query, name: reason, schema: { type: string, enum: [MEMBER_CANCEL_COURSE, SESSION_CANCELLED] } }
 *       - { in: query, name: memberId, schema: { type: string } }
 *       - { in: query, name: classId, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(RefundQuerySchema, "query"),
  refundsController.listRefunds
);

/**
 * @swagger
 * /refunds/{id}/approve:
 *   patch:
 *     summary: MANAGER duyệt hoàn tiền (sau khi đã chuyển khoản tay cho hội viên)
 *     description: |
 *       Trừ ví HLV `coachDebitAmount` (giao dịch ví REFUND_DEBIT). Hủy khóa học ⇒ giao dịch REFUNDED,
 *       hủy chỗ đang giữ của hội viên trong lớp. Đã xử lý ⇒ 409 `REFUND_ALREADY_PROCESSED`.
 *     tags: [Refunds]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, maxLength: 500, description: "VD mã giao dịch chuyển khoản hoàn tiền" }
 *     responses:
 *       200: { description: Đã duyệt }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
/**
 * @swagger
 * /refunds/course-cancellation/preview:
 *   get:
 *     summary: "BE-16: Xem trước điều kiện hủy khóa (MEMBER) — không ghi dữ liệu"
 *     tags: [Refunds]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: classId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ allowed, deadline, firstSessionStart, paidAmount, refundableAmount, blockReason, blockMessage, existingRefundId }" }
 */
router.get(
  "/course-cancellation/preview",
  authenticate,
  authorize("MEMBER"),
  validate(CourseRefundPreviewSchema, "query"),
  refundsController.previewCourseRefund
);

/**
 * @swagger
 * /refunds/{id}:
 *   get:
 *     summary: "BE-17: Chi tiết yêu cầu hoàn tiền (MANAGER: mọi bản ghi; MEMBER: của mình)"
 *     tags: [Refunds]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Refund kèm member, class (+coach), schedule, payment" }
 *       403: { description: "Không phải của mình" }
 *       404: { description: "Không tìm thấy" }
 */
router.get(
  "/:id",
  authenticate,
  authorize("MEMBER", "COACH", "MANAGER"),
  validate(RefundIdSchema, "params"),
  refundsController.getRefundById
);

router.patch(
  "/:id/approve",
  authenticate,
  authorize("MANAGER"),
  validate(RefundIdSchema, "params"),
  validate(ApproveRefundSchema),
  refundsController.approveRefund
);

/**
 * @swagger
 * /refunds/{id}/reject:
 *   patch:
 *     summary: MANAGER từ chối hoàn tiền (kèm lý do)
 *     tags: [Refunds]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 3, maxLength: 500 }
 *     responses:
 *       200: { description: Đã từ chối }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.patch(
  "/:id/reject",
  authenticate,
  authorize("MANAGER"),
  validate(RefundIdSchema, "params"),
  validate(RejectRefundSchema),
  refundsController.rejectRefund
);

export default router;
