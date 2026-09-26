import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateScheduleSchema,
  CreateActivityPlanSchema,
  UpdateScheduleSchema,
  ScheduleQuerySchema,
  ScheduleIdSchema,
} from "./class-schedules.schema.js";
import * as schedulesController from "./class-schedules.controller.js";

const router = Router();

/**
 * @swagger
 * /class-schedules/activity-plan:
 *   post:
 *     summary: Atomically create a sport (optional), class, coach assignments and schedules
 *     tags: [Class Schedules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201: { $ref: "#/components/responses/ScheduleCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.post(
  "/activity-plan",
  authenticate,
  authorize("MANAGER", "STAFF"),
  validate(CreateActivityPlanSchema),
  schedulesController.createActivityPlan,
);

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
 *     description: "date/startAfter/startBefore use legacy start-time filtering. from/to use overlap-range filtering (schedule.startTime < to AND schedule.endTime > from). weekday/weekdays filter by Thứ 2..CN on startTime in Asia/Ho_Chi_Minh (ISO 1=Mon..7=Sun after normalization)."
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
 *         name: weekday
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: form
 *         explode: true
 *         description: "Lọc 1 thứ: 2=T2..7=T7, 8=CN (alias: T2..T7, MON..SUN, Thứ 2..Chủ nhật). Lặp lại param để chọn nhiều thứ. VD: ?weekday=2&weekday=CN"
 *         example: "2"
 *       - in: query
 *         name: weekdays
 *         schema:
 *           type: string
 *         description: "Lọc nhiều thứ, phân tách dấu phẩy. VD: ?weekdays=2,4,8 hoặc ?weekdays=T2,T4,CN. Hợp nhất với weekday."
 *         example: "2,4,8"
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
 *         description: Schedules starting before this time (legacy start-time filtering)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Overlap-range filter start (schedule.endTime > from)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Overlap-range filter end (schedule.startTime < to)
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
router.get(
  "/:id",
  authenticate,
  validate(ScheduleIdSchema, "params"),
  schedulesController.getScheduleById
);

/**
 * @swagger
 * /class-schedules:
 *   post:
 *     summary: Create a new schedule (checks area type, room & coach conflicts)
 *     description: "Business rule: Class.areaType must equal Room.areaType. Checked before capacity and conflict checks."
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
  authorize("MANAGER", "STAFF"),
  validate(CreateScheduleSchema),
  schedulesController.createSchedule
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   patch:
 *     summary: Update schedule (re-checks conflicts if room/time changed)
 *     description: "Closed schedules (CANCELLED/COMPLETED) are immutable. status=COMPLETED is rejected here — use PATCH /class-schedules/{id}/complete."
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
 *                 enum: [SCHEDULED, CANCELLED]
 *                 description: "If set to CANCELLED, all BOOKED enrollments are cancelled automatically. COMPLETED must use /complete."
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: "Cancellation reason (used in SCHEDULE_CANCELLED notification)"
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
  authorize("MANAGER", "STAFF"),
  validate(ScheduleIdSchema, "params"),
  validate(UpdateScheduleSchema),
  schedulesController.updateSchedule
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   delete:
 *     summary: Cancel schedule (automatically cancels all BOOKED enrollments)
 *     description: "Idempotent for already-CANCELLED schedules (no duplicate notification). Rejects COMPLETED schedules."
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
  authorize("MANAGER", "STAFF"),
  validate(ScheduleIdSchema, "params"),
  schedulesController.deleteSchedule
);

/**
 * @swagger
 * /class-schedules/{id}/complete:
 *   patch:
 *     summary: Mark a schedule as COMPLETED (only after endTime)
 *     tags: [Class Schedules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/ScheduleOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/complete",
  authenticate,
  authorize("MANAGER", "STAFF"),
  validate(ScheduleIdSchema, "params"),
  schedulesController.completeSchedule
);

export default router;
