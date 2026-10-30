import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CancelMembershipSchema,
  CreatePlanSchema,
  MemberPassScanQuerySchema,
  MembershipQuerySchema,
  UpdatePlanSchema,
  VerifyMemberPassSchema,
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
 *     summary: Danh sách gói thành viên đang bán (theo thứ tự Manager đặt, rồi giá tăng dần)
 *     description: "Mỗi gói: { id, name, durationDays, price, pricePer30Days, description, benefits[], isFeatured, sortOrder }"
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
 *               benefits: { type: array, items: { type: string }, example: ["Tập không giới hạn giờ mở cửa", "Tủ đồ miễn phí"] }
 *               isFeatured: { type: boolean }
 *               sortOrder: { type: integer }
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
 * /membership-plans/manage:
 *   get:
 *     summary: MANAGER — mọi gói (cả gói đã tắt) kèm số liệu (hội viên đang dùng, lượt bán, doanh thu, đã hoàn)
 *     tags: [Memberships]
 *     responses:
 *       200: { description: OK }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
membershipPlanRouter.get("/manage", authenticate, authorize("MANAGER"), membershipsController.listManagePlans);

/**
 * @swagger
 * /membership-plans/{id}:
 *   patch:
 *     summary: MANAGER sửa gói (đổi giá / số ngày chỉ áp dụng cho giao dịch mới)
 *     tags: [Memberships]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               durationDays: { type: integer }
 *               price: { type: integer }
 *               description: { type: string }
 *               benefits: { type: array, items: { type: string } }
 *               isFeatured: { type: boolean }
 *               sortOrder: { type: integer }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: PLAN_NAME_TAKEN }
 *   delete:
 *     summary: MANAGER xóa gói chưa từng bán (đã bán ⇒ 409 PLAN_IN_USE, hãy tắt bán)
 *     tags: [Memberships]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *       409: { description: PLAN_IN_USE }
 */
membershipPlanRouter.patch(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(PlanIdParamSchema, "params"),
  validate(UpdatePlanSchema),
  membershipsController.updatePlan
);
membershipPlanRouter.delete(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(PlanIdParamSchema, "params"),
  membershipsController.deletePlan
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
 * /memberships/my/history:
 *   get:
 *     summary: MEMBER — lịch sử mọi gói đã mua (tên/giá theo ảnh chụp lúc mua)
 *     tags: [Memberships]
 *     responses:
 *       200: { description: OK }
 */
router.get("/my/history", authenticate, authorize("MEMBER"), membershipsController.getMyHistory);

/**
 * @swagger
 * /memberships/my/pass:
 *   get:
 *     summary: MEMBER — mã QR động của thẻ thành viên (JWT sống 60 giây, app tự làm mới)
 *     tags: [Memberships]
 *     responses:
 *       200: { description: "{ token, expiresIn, expiresAt, isActive, validUntil }" }
 */
router.get("/my/pass", authenticate, authorize("MEMBER"), membershipsController.getMyPass);

/**
 * @swagger
 * /memberships/pass/verify:
 *   post:
 *     summary: MANAGER/COACH quét mã QR động của hội viên ⇒ hợp lệ hay không + ghi nhật ký vào cửa
 *     tags: [Memberships]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: "{ valid, reason, member, membership, validUntil, totalDaysLeft, entriesToday }" }
 *       400: { description: PASS_EXPIRED / PASS_INVALID }
 */
router.post(
  "/pass/verify",
  authenticate,
  authorize("MANAGER", "COACH"),
  validate(VerifyMemberPassSchema),
  membershipsController.verifyPass
);

/**
 * @swagger
 * /memberships/pass/scans:
 *   get:
 *     summary: MANAGER — nhật ký quét thẻ hội viên
 *     tags: [Memberships]
 *     parameters:
 *       - { in: query, name: valid, schema: { type: string, enum: ["true", "false"] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: OK }
 */
router.get(
  "/pass/scans",
  authenticate,
  authorize("MANAGER"),
  validate(MemberPassScanQuerySchema, "query"),
  membershipsController.listPassScans
);

/**
 * @swagger
 * /memberships/maintenance:
 *   post:
 *     summary: MANAGER — chạy ngay job gói thành viên (hết hạn + nhắc gia hạn 7 ngày / 1 ngày; cũng chạy định kỳ)
 *     tags: [Memberships]
 *     responses:
 *       200: { description: "{ remindedDays7, remindedDays1, expired }" }
 */
router.post("/maintenance", authenticate, authorize("MANAGER"), membershipsController.runMaintenance);

/**
 * @swagger
 * /memberships/{id}/cancel:
 *   post:
 *     summary: MANAGER hủy gói của hội viên (gói xếp hàng phía sau dời lên; hoàn tiền tùy chọn ≤ giá trị còn lại)
 *     tags: [Memberships]
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
 *               reason: { type: string }
 *               refundAmount: { type: integer, description: "0 = không hoàn" }
 *     responses:
 *       200: { description: "{ membershipId, refund, shiftedQueued, maxRefund }" }
 *       400: { description: REFUND_EXCEEDS_REMAINING }
 *       409: { description: MEMBERSHIP_NOT_ACTIVE }
 */
router.post(
  "/:id/cancel",
  authenticate,
  authorize("MANAGER"),
  validate(PlanIdParamSchema, "params"),
  validate(CancelMembershipSchema),
  membershipsController.cancelMembership
);

/**
 * @swagger
 * /memberships/verify/{userId}:
 *   get:
 *     summary: COACH/MANAGER tra cứu gói của hội viên theo userId (KHÔNG dùng vào cửa — vào cửa dùng /memberships/pass/verify)
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
 *       - { in: query, name: planId, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string } }
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
