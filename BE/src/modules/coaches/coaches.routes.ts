import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CoachQuerySchema, UpdateCoachSchema } from "./coaches.schema.js";
import * as coachController from "./coaches.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Coaches
 *   description: Coach management endpoints
 */

/**
 * @swagger
 * /coaches:
 *   get:
 *     summary: List all coaches
 *     tags: [Coaches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Filter by specialization (partial match)
 *     responses:
 *       200: { $ref: "#/components/responses/CoachListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate,
  authorize("MANAGER", "STAFF"),
  validate(CoachQuerySchema, "query"),
  coachController.listCoaches
);

/**
 * @swagger
 * /coaches/{id}:
 *   get:
 *     summary: Get coach by ID
 *     tags: [Coaches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Coach user ID
 *     responses:
 *       200: { $ref: "#/components/responses/CoachOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", authenticate, coachController.getCoachById);

/**
 * @swagger
 * /coaches/{id}:
 *   patch:
 *     summary: Update coach profile
 *     tags: [Coaches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Coach user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE, OTHER]
 *               dateOfBirth:
 *                 type: string
 *               specialization:
 *                 type: string
 *               experienceYears:
 *                 type: integer
 *               bio:
 *                 type: string
 *     responses:
 *       200: { $ref: "#/components/responses/CoachOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(UpdateCoachSchema),
  coachController.updateCoach
);

export default router;
