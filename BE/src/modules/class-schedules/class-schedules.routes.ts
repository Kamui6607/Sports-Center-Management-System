import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  ScheduleQuerySchema,
} from "./class-schedules.schema.js";
import * as schedulesController from "./class-schedules.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Class Schedules
 *   description: Manage class schedules
 */

/**
 * @swagger
 * /class-schedules:
 *   get:
 *     summary: Get list of schedules
 *     tags: [Class Schedules]
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Filter by class
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *         description: Filter by room
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, CANCELLED, COMPLETED]
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           example: "2026-09-15"
 *         description: Filter by date (YYYY-MM-DD)
 *       - in: query
 *         name: startAfter
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Schedules starting after this time
 *       - in: query
 *         name: startBefore
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Schedules starting before this time
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
 *       200: { $ref: "#/components/responses/ScheduleListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate,
  validate(ScheduleQuerySchema, "query"),
  schedulesController.listSchedules
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   get:
 *     summary: View schedule details (including enrolled count)
 *     tags: [Class Schedules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/ScheduleOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", authenticate, schedulesController.getScheduleById);

/**
 * @swagger
 * /class-schedules:
 *   post:
 *     summary: Create a new schedule (checks room & coach conflicts)
 *     tags: [Class Schedules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *               - roomId
 *               - startTime
 *               - endTime
 *             properties:
 *               classId:
 *                 type: string
 *               roomId:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-09-15T07:00:00+07:00"
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-09-15T08:00:00+07:00"
 *     responses:
 *       201: { $ref: "#/components/responses/ScheduleCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreateScheduleSchema),
  schedulesController.createSchedule
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   patch:
 *     summary: Update schedule (re-checks conflicts if room/time changed)
 *     tags: [Class Schedules]
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
 *               roomId:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [SCHEDULED, CANCELLED, COMPLETED]
 *                 description: "If set to CANCELLED, all BOOKED enrollments are cancelled automatically"
 *     responses:
 *       200: { $ref: "#/components/responses/ScheduleOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(UpdateScheduleSchema),
  schedulesController.updateSchedule
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   delete:
 *     summary: Cancel schedule (automatically cancels all BOOKED enrollments)
 *     tags: [Class Schedules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/ScheduleOk" }
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
  schedulesController.deleteSchedule
);

export default router;
