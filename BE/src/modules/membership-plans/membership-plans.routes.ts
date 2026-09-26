import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreatePlanSchema, UpdatePlanSchema, PlanQuerySchema } from "./membership-plans.schema.js";
import * as plansController from "./membership-plans.controller.js";

const router = Router();

/**
 * @swagger
 * /membership-plans:
 *   get:
 *     summary: List membership plans (public)
 *     tags: [Membership Plans]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: tier
 *         schema: { type: string, enum: [MEMBERSHIP, PREMIUM] }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200: { $ref: "#/components/responses/PlanListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/", validate(PlanQuerySchema, "query"), plansController.listPlans);

/**
 * @swagger
 * /membership-plans/{id}:
 *   get:
 *     summary: Get plan details (public)
 *     tags: [Membership Plans]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PlanOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", plansController.getPlanById);

/**
 * @swagger
 * /membership-plans:
 *   post:
 *     summary: Create membership plan
 *     description: |
 *       MANAGER tạo gói tập. `maxConcurrentClasses` = quota lớp học song song: số Class KHÁC NHAU
 *       tối đa hội viên được giữ đồng thời (>= 0). Bỏ trống => mặc định theo tier (MEMBERSHIP 3 / PREMIUM 6).
 *       MEMBER không có quyền gọi API này.
 *     tags: [Membership Plans]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price, durationDays, tier]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               durationDays: { type: integer }
 *               tier: { type: string, enum: [MEMBERSHIP, PREMIUM] }
 *               maxConcurrentClasses:
 *                 type: integer
 *                 minimum: 0
 *                 description: "Quota số Class KHÁC NHAU được giữ đồng thời; bỏ trống = mặc định theo tier"
 *           example:
 *             name: "Membership Monthly"
 *             price: 300000
 *             durationDays: 30
 *             tier: "MEMBERSHIP"
 *             maxConcurrentClasses: 3
 *     responses:
 *       201: { $ref: "#/components/responses/PlanCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate, authorize("MANAGER"),
  validate(CreatePlanSchema),
  plansController.createPlan
);

/**
 * @swagger
 * /membership-plans/{id}:
 *   patch:
 *     summary: Update membership plan
 *     description: |
 *       MANAGER cập nhật gói tập (kể cả `maxConcurrentClasses` — quota lớp học song song, >= 0; integer).
 *
 *       **`maxConcurrentClasses` là config của TỪNG plan, không phải field derived của `tier`**:
 *       - `PATCH { "tier": "PREMIUM" }` → chỉ đổi tier, **GIỮ NGUYÊN** quota hiện tại (không tự đổi 3 → 6).
 *       - `PATCH { "tier": "PREMIUM", "maxConcurrentClasses": 6 }` → đổi cả hai.
 *       - `POST /membership-plans` không truyền quota mới áp default theo tier (FREE 0 / MEMBERSHIP 3 / PREMIUM 6);
 *         giá trị explicit luôn được ưu tiên.
 *
 *       Quota mới áp dụng cho lần đặt lớp TIẾP THEO; KHÔNG tự hủy các lớp hội viên đang giữ
 *       (grandfathering: có thể `used > limit` nhưng `remaining = 0`).
 *     tags: [Membership Plans]
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
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               durationDays: { type: integer }
 *               tier: { type: string, enum: [MEMBERSHIP, PREMIUM] }
 *               maxConcurrentClasses: { type: integer, minimum: 0, description: "Quota số Class KHÁC NHAU được giữ đồng thời" }
 *               isActive: { type: boolean }
 *           example:
 *             maxConcurrentClasses: 6
 *     responses:
 *       200: { $ref: "#/components/responses/PlanOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authenticate, authorize("MANAGER"),
  validate(UpdatePlanSchema),
  plansController.updatePlan
);

/**
 * @swagger
 * /membership-plans/{id}:
 *   delete:
 *     summary: Deactivate membership plan
 *     tags: [Membership Plans]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PlanOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete(
  "/:id",
  authenticate, authorize("MANAGER"),
  plansController.deletePlan
);

export default router;
