import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CreateClassSchema,
  UpdateClassSchema,
  ApproveClassSchema,
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
 *     tags: [Courses]
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
 *     summary: Coach tạo lớp học mới (chờ Manager duyệt)
 *     description: |
 *       CHỈ COACH được tạo lớp. Coach tạo lớp ⇒ là HLV phụ trách lớp (`Class.coachId`, mỗi lớp đúng 1 HLV).
 *       Lớp mới ở trạng thái `PENDING`, Manager duyệt qua `PATCH /classes/{id}/review`.
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
  authorize("COACH"),
  validate(CreateClassSchema),
  classesController.createClass
);

/**
 * @swagger
 * /classes/{id}/review:
 *   patch:
 *     summary: Manager duyệt hoặc từ chối class do Coach tạo (PENDING → APPROVED/REJECTED)
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
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [APPROVE, REJECT]
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: Lý do từ chối (tùy chọn)
 *     responses:
 *       200: { $ref: "#/components/responses/ClassOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/review",
  authenticate,
  authorize("MANAGER"),
  validate(ApproveClassSchema),
  classesController.reviewClass
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

export default router;
