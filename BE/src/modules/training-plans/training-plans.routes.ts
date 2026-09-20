import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./training-plans.controller.js";
import { CreateTrainingPlanSchema, CreateTrainingResultSchema } from "./training-plans.schema.js";

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