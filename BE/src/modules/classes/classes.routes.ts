import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateClassSchema,
  UpdateClassSchema,
  AssignCoachSchema,
  AssignSupportCoachSchema,
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
 *         description: Filter by class tier (REGULAR | PREMIUM)
 *       - in: query
 *         name: areaType
 *         schema:
 *           type: string
 *           enum: [POOL, INDOOR, OUTDOOR]
 *         description: Filter by area type (POOL | INDOOR | OUTDOOR)
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
 * /classes/{id}/course-plan:
 *   get:
 *     summary: View a class as ONE course (grouped recurring timetable) + whole-course enrollment eligibility
 *     description: |
 *       **"Nguyên cái lịch trình" của một Class** — dùng cho màn hình chi tiết lớp của hội viên.
 *
 *       Thay vì liệt kê từng buổi rời rạc, BE gom TẤT CẢ buổi `SCHEDULED` chưa bắt đầu thành:
 *       - `course.slots[]`: khung lịch lặp lại theo (Thứ + giờ + phòng), ví dụ "Thứ 2 · 18:00–19:30 · Phòng Yoga",
 *         kèm `sessionCount`, `firstSessionStart`, `lastSessionStart`, `sessionIds`.
 *       - `course`: tổng số buổi, buổi đầu/cuối, các thứ, các phòng, `timeSlots`, `availability`
 *         (`minRemainingSlots` = chỗ trống ít nhất qua các buổi, `fullSessionCount`, `isFullyBookable`).
 *       - `sessions[]`: từng buổi kèm `weekdayLabel`/`timeLabel` (giờ VN), `remainingSlots`, `isFull`,
 *         `canBook`, `myEnrollmentStatus` của chính hội viên (nếu caller là MEMBER).
 *       - `registration` (chỉ MEMBER): preview điều kiện **đăng ký trọn khóa** theo đúng bộ luật
 *         all-or-nothing của `POST /enrollments/bulk` — `eligible`, `blockers[]` (code + message + sessionId),
 *         `subscription`, `quota`, `penalty`, `registeredSessions`, `isFullyRegistered`.
 *
 *       Thứ/giờ được tính theo múi giờ **Asia/Ho_Chi_Minh**, không phụ thuộc timezone của server.
 *     tags: [Classes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id/course-plan", authenticate, classesController.getClassCoursePlan);

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
 *               - sportIds
 *               - capacity
 *               - areaType
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Morning Yoga"
 *               description:
 *                 type: string
 *               sportIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               capacity:
 *                 type: integer
 *                 example: 20
 *               classType:
 *                 type: string
 *                 enum: [REGULAR, PREMIUM]
 *                 default: REGULAR
 *                 description: "Class tier (REGULAR | PREMIUM). Different from areaType."
 *               areaType:
 *                 type: string
 *                 enum: [POOL, INDOOR, OUTDOOR]
 *                 example: "INDOOR"
 *                 description: "Area type required by this class. Every selected sport must support it."
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
  authorize("MANAGER", "STAFF"),
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
 *               sportIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               capacity:
 *                 type: integer
 *               classType:
 *                 type: string
 *                 enum: [REGULAR, PREMIUM]
 *               areaType:
 *                 type: string
 *                 enum: [POOL, INDOOR, OUTDOOR]
 *                 description: "New area type. All sports of this class must support it, and upcoming schedules must use a matching Room."
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
  authorize("MANAGER", "STAFF"),
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
  authorize("MANAGER", "STAFF"),
  classesController.deleteClass
);

/**
 * @swagger
 * /classes/{id}/coaches:
 *   post:
 *     summary: Assign coach to class (Sends COACH_CHANGED notification to enrolled members)
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
  authorize("MANAGER", "STAFF"),
  validate(AssignCoachSchema),
  classesController.assignCoach
);

/**
 * @swagger
 * /classes/{id}/coaches/support:
 *   post:
 *     summary: Assign a support coach to class (Sends COACH_CHANGED notification to enrolled members)
 *     description: >
 *       Gán HLV hỗ trợ cho Class. Mỗi Class chỉ có duy nhất 1 HLV chính (isPrimary = true),
 *       HLV hỗ trợ luôn được lưu với isPrimary = false nên endpoint này không nhận isPrimary.
 *       Idempotent khi HLV đã là HLV hỗ trợ của Class (không gửi lại thông báo).
 *       Trả 409 nếu HLV đang là HLV chính của Class hoặc trùng lịch với buổi SCHEDULED sắp tới.
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
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:id/coaches/support",
  authenticate,
  authorize("MANAGER", "STAFF"),
  validate(AssignSupportCoachSchema),
  classesController.assignSupportCoach
);

/**
 * @swagger
 * /classes/{id}/coaches/{coachId}:
 *   delete:
 *     summary: Remove coach from class (Sends COACH_CHANGED notification to enrolled members)
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
  authorize("MANAGER", "STAFF"),
  classesController.removeCoach
);

export default router;
