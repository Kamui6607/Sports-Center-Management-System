import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateSubscriptionSchema,
  RenewSubscriptionSchema,
  UpdateStatusSchema,
  SubscriptionQuerySchema,
  CancelSubscriptionSchema,
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
 *     summary: Cập nhật trạng thái gói (Manager only)
 *     description: |
 *       **Khi đổi sang `CANCELLED` (Manager hủy gói):**
 *       - Tự động tính hoàn tiền theo tỷ lệ ngày còn lại *(Prorated)*:
 *         `refundAmount = (giá_gốc / tổng_ngày) × ngày_còn_lại`
 *       - Nếu còn ngày sử dụng → Payment gốc chuyển sang `REFUNDED`, Member nhận Notification `PAYMENT_REFUNDED`.
 *       - Nếu gói đã hết hạn (0 ngày còn lại) → Không hoàn tiền, gửi `SUBSCRIPTION_CANCELLED`.
 *       - Toàn bộ lịch học tương lai (`BOOKED`) của member **tự động bị hủy**.
 *
 *       **Khi đổi sang `SUSPENDED`:** Lưu số ngày còn lại để khôi phục sau.
 *
 *       **Khi đổi từ `SUSPENDED` → `ACTIVE`:** Cộng lại số ngày còn dư vào ngày kết thúc mới.
 *     tags: [Subscriptions]
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
 *               status: { type: string, enum: [ACTIVE, CANCELLED, SUSPENDED] }
 *           examples:
 *             cancel:
 *               summary: Hủy gói (tự động tính hoàn tiền)
 *               value: { status: "CANCELLED" }
 *             suspend:
 *               summary: Tạm dừng gói
 *               value: { status: "SUSPENDED" }
 *             resume:
 *               summary: Kích hoạt lại từ tạm dừng
 *               value: { status: "ACTIVE" }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               cancelled_with_refund:
 *                 summary: Hủy + hoàn tiền prorated
 *                 value:
 *                   success: true
 *                   message: "Subscription status updated"
 *                   data:
 *                     id: "sub-uuid"
 *                     status: "CANCELLED"
 *                     refundAmount: 200000
 *                     willRefund: true
 *                     daysLeft: 20
 *               cancelled_no_refund:
 *                 summary: Hủy gói đã hết hạn
 *                 value:
 *                   success: true
 *                   message: "Subscription status updated"
 *                   data:
 *                     id: "sub-uuid"
 *                     status: "CANCELLED"
 *                     refundAmount: 0
 *                     willRefund: false
 *                     daysLeft: 0
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

/**
 * @swagger
 * /subscriptions/{id}/cancel:
 *   patch:
 *     summary: Member tự hủy gói của mình
 *     description: |
 *       **Chính sách hoàn tiền khi Member tự hủy gói:**
 *       - Gói còn **> 15 ngày** sử dụng → Hoàn **30%** giá trị gói gốc (qua nhân viên).
 *       - Gói còn **≤ 15 ngày** sử dụng → **Không hoàn tiền**.
 *
 *       **Hiệu lực khi hủy:**
 *       - Subscription chuyển sang `CANCELLED`.
 *       - Toàn bộ lịch học đã đặt trong tương lai (`BOOKED`) sẽ tự động bị `CANCELLED`.
 *       - Payment gốc chuyển sang `REFUNDED` nếu đủ điều kiện.
 *       - Member nhận Notification ngay lập tức với thông tin hoàn tiền (nếu có).
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Subscription ID (phải là gói của chính mình)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: Lý do hủy gói (không bắt buộc)
 *                 example: "Tôi không có thời gian tập luyện nữa"
 *     responses:
 *       200:
 *         description: Hủy thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               refund_eligible:
 *                 summary: Hoàn tiền 30% (còn > 15 ngày)
 *                 value:
 *                   success: true
 *                   message: "Hủy thành công. Hoàn 150,000đ (30%) vì còn 20 ngày."
 *                   data:
 *                     subscriptionId: "sub-uuid"
 *                     status: "CANCELLED"
 *                     daysLeft: 20
 *                     refundAmount: 150000
 *                     willRefund: true
 *               no_refund:
 *                 summary: Không hoàn tiền (còn ≤ 15 ngày)
 *                 value:
 *                   success: true
 *                   message: "Hủy thành công. Không hoàn tiền vì còn ≤ 15 ngày (còn 10 ngày)."
 *                   data:
 *                     subscriptionId: "sub-uuid"
 *                     status: "CANCELLED"
 *                     daysLeft: 10
 *                     refundAmount: 0
 *                     willRefund: false
 *       400:
 *         description: Gói không ở trạng thái ACTIVE
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example: { success: false, message: "Không thể hủy gói đang ở trạng thái CANCELLED" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/cancel",
  authenticate, authorize("MEMBER"),
  validate(CancelSubscriptionSchema),
  subsController.cancelSubscriptionBySelf
);

export default router;
