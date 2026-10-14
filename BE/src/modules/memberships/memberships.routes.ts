import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreatePlanSchema,
  MembershipQuerySchema,
  PlanIdParamSchema,
  PurchaseMembershipSchema,
  TogglePlanSchema,
  UserIdParamSchema,
} from "./memberships.schema.js";
import * as membershipsController from "./memberships.controller.js";

/** Mount tại `/memberships`. */
const router = Router();

/** Mount tại `/membership-plans`. */
export const membershipPlanRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Memberships
 *   description: Gói thành viên tập gym tự do (mua qua VietQR/SePay, HLV/Quản lý quét QR kiểm tra)
 */

/**
 * @swagger
 * /membership-plans:
 *   get:
 *     summary: Danh sách gói thành viên đang bán (giá tăng dần)
 *     tags: [Memberships]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
membershipPlanRouter.get("/", authenticate, membershipsController.listPlans);

/**
 * @swagger
 * /membership-plans:
 *   post:
 *     summary: MANAGER tạo gói thành viên
 *     tags: [Memberships]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, durationDays, price]
 *             properties:
 *               name: { type: string, example: "Gói 1 tháng" }
 *               durationDays: { type: integer, example: 30 }
 *               price: { type: integer, example: 500000 }
 *               description: { type: string }
 *     responses:
 *       201: { description: Đã tạo }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
membershipPlanRouter.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreatePlanSchema),
  membershipsController.createPlan
);

/**
 * @swagger
 * /membership-plans/{id}/toggle:
 *   patch:
 *     summary: MANAGER bật/tắt gói (bỏ trống isActive ⇒ đảo trạng thái)
 *     tags: [Memberships]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
membershipPlanRouter.patch(
  "/:id/toggle",
  authenticate,
  authorize("MANAGER"),
  validate(PlanIdParamSchema, "params"),
  validate(TogglePlanSchema),
  membershipsController.togglePlan
);

/**
 * @swagger
 * /memberships/purchase:
 *   post:
 *     summary: MEMBER mua gói — tạo giao dịch VietQR (SePay) chờ chuyển khoản
 *     description: |
 *       Trả "SePay checkout view" (paymentId, qrUrl, amount, transferContent, bank, expiresAt) + planName, durationDays.
 *       Membership chỉ được cấp khi SePay xác nhận đã thu tiền (webhook / đối soát / mock-confirm).
 *       Theo dõi kết quả bằng `GET /payments/sepay/{paymentId}`.
 *     tags: [Memberships]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId: { type: string }
 *     responses:
 *       201: { description: Đã tạo giao dịch chờ thanh toán }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: "SEPAY_PAYMENT_PENDING — còn giao dịch mua gói đang chờ (body kèm QR cũ)" }
 *       503: { description: Chưa cấu hình SePay }
 */
router.post(
  "/purchase",
  authenticate,
  authorize("MEMBER"),
  validate(PurchaseMembershipSchema),
  membershipsController.purchaseMembership
);

/**
 * @swagger
 * /memberships/my:
 *   get:
 *     summary: Gói thành viên đang hiệu lực của tôi
 *     description: "`{ membership: {...plan, daysLeft} | null, recentExpired: {...} | null }` — HLV luôn null."
 *     tags: [Memberships]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/my", authenticate, authorize("MEMBER", "COACH"), membershipsController.getMyMembership);

/**
 * @swagger
 * /memberships/verify/{userId}:
 *   get:
 *     summary: COACH/MANAGER quét QR (userId) của hội viên ⇒ gói còn / hết hạn
 *     tags: [Memberships]
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ user: {id, fullName, avatarUrl}, membership: {status, planName, endDate, daysLeft} | null, isActive }" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get(
  "/verify/:userId",
  authenticate,
  authorize("COACH", "MANAGER"),
  validate(UserIdParamSchema, "params"),
  membershipsController.verifyMembership
);

/**
 * @swagger
 * /memberships:
 *   get:
 *     summary: MANAGER xem danh sách membership
 *     tags: [Memberships]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [ACTIVE, EXPIRED, CANCELLED] } }
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
  validate(MembershipQuerySchema, "query"),
  membershipsController.listMemberships
);

export default router;
