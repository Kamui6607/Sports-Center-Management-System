import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./training-plans.controller.js";
import { CreateTrainingPlanSchema, CreateTrainingResultSchema, UpdateTrainingPlanSchema, UpdateTrainingResultSchema } from "./training-plans.schema.js";

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Training
 */

/**
 * @swagger
 * /training-plans:
 *   get:
 *     tags: [Training]
 *     description: |
 *       Phạm vi theo NGƯỜI ĐĂNG NHẬP (không tin query từ client):
 *       - MANAGER: xem toàn bộ (lọc `memberId` nếu truyền).
 *       - COACH: chỉ plan do chính mình phụ trách.
 *       - MEMBER: chỉ plan của chính mình; truyền `memberId` của người khác ⇒ 403.
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Success" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/", controller.getPlans);

/**
 * @swagger
 * /training-plans:
 *   post:
 *     tags: [Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberId: { type: string }
 *               coachId: { type: string }
 *               name: { type: string }
 *               startDate: { type: string }
 *               endDate: { type: string }
 *     responses:
 *       201: { description: "Success" }
 */
router.post("/", authorize("COACH", "MANAGER"), validate(CreateTrainingPlanSchema), controller.createPlan);

/**
 * @swagger
 * /training-plans/{id}:
 *   patch:
 *     summary: Change the coach of a training plan (Member changes own plan, Coach current plan, Manager any plan)
 *     description: |
 *       **Business rules:**
 *       - MEMBER chỉ đổi được HLV của training plan thuộc hồ sơ của chính mình (403 nếu không phải).
 *       - COACH chỉ đổi được HLV của plan mình đang phụ trách; MANAGER đổi được mọi plan.
 *       - `coachId` mới phải tồn tại, đang hoạt động và có role COACH (404 nếu không hợp lệ).
 *       - Không cho gán lại đúng HLV hiện tại (409).
 *       - Chỉ cập nhật `TrainingPlan.coachId`; KHÔNG thay đổi enrollment/class/schedule/attendance.
 *       - Hội viên (khi người khác đổi) và HLV mới nhận notification TRAINING_PLAN_ASSIGNED.
 *     tags: [Training]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: TrainingPlan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [coachId]
 *             properties:
 *               coachId:
 *                 type: string
 *                 format: uuid
 *                 description: CoachProfile.id của HLV mới (khác HLV hiện tại)
 *           example:
 *             coachId: "c1a2b3c4-0000-4000-8000-000000000002"
 *     responses:
 *       200:
 *         description: Training plan coach updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               message: Training plan coach updated successfully
 *               data:
 *                 id: "b7e3d6f0-0000-4000-8000-000000000001"
 *                 memberId: "member-1"
 *                 coachId: "c1a2b3c4-0000-4000-8000-000000000002"
 *                 name: "Giảm cân 8 tuần"
 *                 coach: { user: { fullName: "Coach Two" } }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authorize("MEMBER", "COACH", "MANAGER"),
  validate(UpdateTrainingPlanSchema),
  controller.updatePlanCoach
);

/**
 * @swagger
 * /training-plans/results:
 *   post:
 *     summary: Coach ghi một mốc tiến độ cho kế hoạch (CHỈ Coach phụ trách plan)
 *     description: |
 *       `metrics` là danh sách chỉ số tập luyện thực tế (không phải chỉ số y tế), mỗi phần tử
 *       `{ name, value, unit?, lowerIsBetter? }`. Cùng `name` ở các mốc khác nhau sẽ được so sánh thành một đường tiến bộ.
 *       Manager nhận 403; Coach không phụ trách plan nhận 403.
 *     tags: [Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId, date]
 *             properties:
 *               planId: { type: string, format: uuid }
 *               date: { type: string, format: date-time }
 *               coachNote: { type: string, maxLength: 1000 }
 *               metrics:
 *                 type: array
 *                 maxItems: 30
 *                 items:
 *                   type: object
 *                   required: [name, value]
 *                   properties:
 *                     name: { type: string, example: "Squat" }
 *                     value: { type: number, example: 80 }
 *                     unit: { type: string, example: "kg" }
 *                     lowerIsBetter: { type: boolean, description: "true nếu số càng nhỏ càng tốt (vd. thời gian chạy)" }
 *           example:
 *             planId: "b7e3d6f0-0000-4000-8000-000000000001"
 *             date: "2026-10-08T09:00:00.000Z"
 *             coachNote: "Giữ form tốt, tăng tạ ở buổi sau."
 *             metrics:
 *               - { name: "Squat", value: 80, unit: "kg" }
 *               - { name: "Chạy 2km", value: 11.5, unit: "phút", lowerIsBetter: true }
 *     responses:
 *       201: { description: "Success" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.post("/results", authorize("COACH"), validate(CreateTrainingResultSchema), controller.createResult);

/**
 * @swagger
 * /training-plans/results/{id}:
 *   patch:
 *     summary: Coach sửa một mốc tiến độ (CHỈ Coach phụ trách plan)
 *     tags: [Training]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Cần ít nhất một trường. `metrics` nếu gửi sẽ thay toàn bộ danh sách chỉ số của mốc.
 *             properties:
 *               date: { type: string, format: date-time }
 *               coachNote: { type: string, maxLength: 1000 }
 *               metrics: { type: array, items: { type: object } }
 *     responses:
 *       200: { description: "Updated" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.patch("/results/:id", authorize("COACH"), validate(UpdateTrainingResultSchema), controller.updateResult);

/**
 * @swagger
 * /training-plans/results/{id}:
 *   delete:
 *     summary: Coach xóa một mốc tiến độ (CHỈ Coach phụ trách plan)
 *     tags: [Training]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Deleted" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.delete("/results/:id", authorize("COACH"), controller.deleteResult);

/**
 * @swagger
 * /training-plans/{id}/progress:
 *   get:
 *     summary: Xem tiến độ của một kế hoạch (Member chủ plan, Coach phụ trách, Manager)
 *     description: |
 *       Trả về `checkpoints` (các mốc theo thời gian) và `summary.metrics`: với mỗi chỉ số có `first`, `latest`,
 *       `change`, `changePercent`, `trend` (IMPROVED | DECLINED | UNCHANGED | INSUFFICIENT_DATA) và `points` để vẽ biểu đồ.
 *       MEMBER chỉ xem plan của chính mình; COACH chỉ plan mình phụ trách (403 nếu không).
 *     tags: [Training]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Success" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id/progress", controller.getPlanProgress);

export default router;
