import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateClassSchema,
  UpdateClassSchema,
  AssignCoachSchema,
  ClassQuerySchema,
} from "./classes.schema.js";
import * as classesController from "./classes.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Classes
 *   description: Manage classes
 */

/**
 * @swagger
 * /classes:
 *   get:
 *     summary: Get list of classes
 *     tags: [Classes]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by class name
 *       - in: query
 *         name: sportId
 *         schema:
 *           type: string
 *         description: Filter by sport
 *       - in: query
 *         name: classType
 *         schema:
 *           type: string
 *           enum: [REGULAR, PREMIUM]
 *         description: Filter by class type
 *       - in: query
 *         name: coachId
 *         schema:
 *           type: string
 *         description: Filter by coach (CoachProfile.id)
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200: { $ref: "#/components/responses/ClassListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate,
  validate(ClassQuerySchema, "query"),
  classesController.listClasses
);

/**
 * @swagger
 * /classes/{id}:
 *   get:
 *     summary: View class details (includes coaches and upcoming schedules)
 *     tags: [Classes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", authenticate, classesController.getClassById);

/**
 * @swagger
 * /classes:
 *   post:
 *     summary: Create a new class
 *     tags: [Classes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - sportId
 *               - capacity
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Morning Yoga"
 *               description:
 *                 type: string
 *               sportId:
 *                 type: string
 *               capacity:
 *                 type: integer
 *                 example: 20
 *               classType:
 *                 type: string
 *                 enum: [REGULAR, PREMIUM]
 *                 default: REGULAR
 *     responses:
 *       201: { $ref: "#/components/responses/ClassCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreateClassSchema),
  classesController.createClass
);

/**
 * @swagger
 * /classes/{id}:
 *   patch:
 *     summary: Update class
 *     tags: [Classes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               sportId:
 *                 type: string
 *               capacity:
 *                 type: integer
 *               classType:
 *                 type: string
 *                 enum: [REGULAR, PREMIUM]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
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
  validate(UpdateClassSchema),
  classesController.updateClass
);

/**
 * @swagger
 * /classes/{id}:
 *   delete:
 *     summary: Deactivate class (soft delete)
 *     tags: [Classes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  classesController.deleteClass
);

/**
 * @swagger
 * /classes/{id}/coaches:
 *   post:
 *     summary: Assign coach to class
 *     tags: [Classes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coachId
 *             properties:
 *               coachId:
 *                 type: string
 *                 description: CoachProfile ID
 *               isPrimary:
 *                 type: boolean
 *                 default: false
 *                 description: Set as primary coach
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:id/coaches",
  authenticate,
  authorize("MANAGER"),
  validate(AssignCoachSchema),
  classesController.assignCoach
);

/**
 * @swagger
 * /classes/{id}/coaches/{coachId}:
 *   delete:
 *     summary: Remove coach from class
 *     tags: [Classes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *       - in: path
 *         name: coachId
 *         required: true
 *         schema:
 *           type: string
 *         description: CoachProfile ID
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete(
  "/:id/coaches/:coachId",
  authenticate,
  authorize("MANAGER"),
  classesController.removeCoach
);

export default router;
