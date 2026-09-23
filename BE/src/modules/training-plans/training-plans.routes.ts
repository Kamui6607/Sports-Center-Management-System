import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./training-plans.controller.js";
import { CreateTrainingPlanSchema, CreateTrainingResultSchema, UpdateTrainingPlanSchema } from "./training-plans.schema.js";

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
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Success" }
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
 *     tags: [Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId: { type: string }
 *               date: { type: string }
 *     responses:
 *       201: { description: "Success" }
 */
router.post("/results", authorize("COACH", "MANAGER"), validate(CreateTrainingResultSchema), controller.createResult);

export default router;