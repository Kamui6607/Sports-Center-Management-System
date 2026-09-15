import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreateEnrollmentSchema, EnrollmentQuerySchema } from "./enrollments.schema.js";
import * as enrollmentsController from "./enrollments.controller.js";

const router = Router();

/**
 * @swagger
 * /enrollments:
 *   post:
 *     summary: Book a class (Member books own class; Staff/Manager book for a member)
 *     tags: [Enrollments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scheduleId]
 *             properties:
 *               scheduleId: { type: string }
 *               memberId: { type: string, description: "Required when booked by Staff/Manager" }
 *     responses:
 *       201: { $ref: "#/components/responses/EnrollmentCreated" }
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
  validate(CreateEnrollmentSchema),
  enrollmentsController.bookClass
);

/**
 * @swagger
 * /enrollments/my:
 *   get:
 *     summary: Get current member's enrollments
 *     tags: [Enrollments]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [BOOKED, CANCELLED, COMPLETED] }
 *     responses:
 *       200: { $ref: "#/components/responses/EnrollmentListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/my",
  authenticate, authorize("MEMBER"),
  validate(EnrollmentQuerySchema, "query"),
  enrollmentsController.getMyEnrollments
);

/**
 * @swagger
 * /enrollments/schedule/{scheduleId}:
 *   get:
 *     summary: Get all enrollments for a schedule
 *     tags: [Enrollments]
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/EnrollmentListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/schedule/:scheduleId",
  authenticate, authorize("MANAGER", "COACH", "STAFF"),
  validate(EnrollmentQuerySchema, "query"),
  enrollmentsController.getScheduleEnrollments
);

/**
 * @swagger
 * /enrollments/{id}:
 *   delete:
 *     summary: Cancel an enrollment
 *     tags: [Enrollments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/EnrollmentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete("/:id", authenticate, enrollmentsController.cancelEnrollment);

export default router;
