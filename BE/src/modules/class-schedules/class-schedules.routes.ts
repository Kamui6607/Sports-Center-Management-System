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
  CancelScheduleSchema,
} from "./class-schedules.schema.js";
import * as schedulesController from "./class-schedules.controller.js";

const router = Router();

/**
 * @swagger
 * /class-schedules/activity-plan:
 *   post:
 *     summary: Coach tạo nhanh lớp học (có phòng) — lớp PENDING chờ Manager duyệt
 *     description: |
 *       CHỈ COACH. Coach gọi API là HLV phụ trách lớp (`Class.coachId`); không nhận `primaryCoachId`/`supportCoachId`.
 *       Lớp PENDING nên chưa tạo buổi học — thêm lịch bằng `POST /class-schedules` sau khi lớp được duyệt.
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
  authorize("COACH"),
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
 *     description: |
 *       - Chỉ COACH phụ trách lớp (`Class.coachId`) được tạo lịch (khác ⇒ 403 `NOT_CLASS_COACH`). Manager không thao tác lịch học.
 *       - Lớp phải `APPROVED` (khác ⇒ 400 `CLASS_NOT_APPROVED`); `startTime` phải ở tương lai (⇒ 400 `SCHEDULE_IN_PAST`).
 *       - Class.areaType phải bằng Room.areaType; phòng đủ sức chứa.
 *       - Không trùng giờ với buổi `SCHEDULED` khác cùng phòng (409 `ROOM_CONFLICT`) hoặc cùng HLV (409 `COACH_CONFLICT`).
 *         Chạm biên (buổi trước kết thúc 9:00, buổi sau bắt đầu 9:00) không tính trùng.
 *         Request đồng thời cùng phòng/HLV được xếp hàng bằng advisory lock ⇒ không thể cùng lọt.
 *         `errors.conflict` chứa buổi bị trùng (scheduleId, className, phòng/HLV, startTime, endTime).
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
  authorize("COACH"),
  validate(CreateScheduleSchema),
  schedulesController.createSchedule
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   patch:
 *     summary: Update schedule (re-checks conflicts if room/time changed)
 *     description: |
 *       Closed schedules (CANCELLED/COMPLETED) are immutable. status=COMPLETED is rejected here — use PATCH /class-schedules/{id}/complete.
 *       Chỉ COACH phụ trách lớp được sửa lịch (403 `NOT_CLASS_COACH`).
 *       Đổi phòng/giờ: lớp phải `APPROVED`, giờ bắt đầu mới ở tương lai, và kiểm tra lại
 *       409 `ROOM_CONFLICT` / `COACH_CONFLICT` như khi tạo.
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
 *                 description: "CANCELLED chỉ dùng được khi buổi CHƯA có ai đặt chỗ; buổi đã có người đặt phải hủy qua POST /class-schedules/{id}/cancel (dạy bù / hoàn tiền), nếu không ⇒ 400 SCHEDULE_CANCEL_RESOLUTION_REQUIRED. COMPLETED must use /complete."
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
  authorize("COACH"),
  validate(ScheduleIdSchema, "params"),
  validate(UpdateScheduleSchema),
  schedulesController.updateSchedule
);

/**
 * @swagger
 * /class-schedules/{id}:
 *   delete:
 *     summary: Cancel a schedule that has NO bookings
 *     description: "Chỉ COACH phụ trách lớp được hủy lịch (403 NOT_CLASS_COACH). Chỉ hủy được buổi CHƯA có ai đặt chỗ; buổi đã có người đặt ⇒ 400 SCHEDULE_CANCEL_RESOLUTION_REQUIRED, dùng POST /class-schedules/{id}/cancel. Idempotent for already-CANCELLED schedules. Rejects COMPLETED schedules."
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
  authorize("COACH"),
  validate(ScheduleIdSchema, "params"),
  schedulesController.deleteSchedule
);

/**
 * @swagger
 * /class-schedules/{id}/cancel:
 *   post:
 *     summary: Hủy buổi học kèm DẠY BÙ hoặc HOÀN TIỀN cho hội viên đã đặt chỗ
 *     description: |
 *       Chỉ COACH phụ trách lớp. Buổi đã có hội viên giữ chỗ ⇒ BẮT BUỘC gửi `resolution`
 *       (thiếu ⇒ 400 `SCHEDULE_CANCEL_RESOLUTION_REQUIRED`):
 *       - `MAKEUP`: tạo buổi dạy bù ở giờ/phòng mới (kiểm tra trùng phòng, trùng HLV, trùng lịch của hội viên),
 *         chuyển toàn bộ hội viên đã đặt sang buổi bù. Không gửi `roomId` ⇒ dùng phòng cũ.
 *       - `REFUND`: mỗi hội viên đã thanh toán lớp nhận 1 yêu cầu hoàn tiền = tiền đã trả ÷ số buổi chính
 *         của lớp (không tính buổi bù), chờ Manager duyệt tại `/refunds`. Duyệt ⇒ trừ ví HLV 85% khoản đó.
 *       Buổi chưa ai đặt ⇒ hủy tự do (resolution tuỳ chọn).
 *     tags: [Class Schedules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *               resolution:
 *                 type: object
 *                 required: [mode]
 *                 properties:
 *                   mode: { type: string, enum: [MAKEUP, REFUND] }
 *                   startTime: { type: string, format: date-time, description: "Bắt buộc với MAKEUP" }
 *                   endTime: { type: string, format: date-time, description: "Bắt buộc với MAKEUP" }
 *                   roomId: { type: string, description: "Tuỳ chọn với MAKEUP" }
 *           examples:
 *             makeup:
 *               summary: Dạy bù
 *               value: { reason: "HLV ốm", resolution: { mode: MAKEUP, startTime: "2026-10-10T07:00:00+07:00", endTime: "2026-10-10T08:00:00+07:00" } }
 *             refund:
 *               summary: Hoàn tiền 1 buổi
 *               value: { reason: "HLV bận đột xuất", resolution: { mode: REFUND } }
 *     responses:
 *       200: { description: "Đã hủy — trả về { schedule, makeup, refunds }" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:id/cancel",
  authenticate,
  authorize("COACH"),
  validate(ScheduleIdSchema, "params"),
  validate(CancelScheduleSchema),
  schedulesController.cancelSchedule
);

/**
 * @swagger
 * /class-schedules/{id}/complete:
 *   patch:
 *     summary: Mark a schedule as COMPLETED (only after endTime)
 *     description: "Chỉ COACH phụ trách lớp được hoàn tất lịch (403 NOT_CLASS_COACH)."
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
  authorize("COACH"),
  validate(ScheduleIdSchema, "params"),
  schedulesController.completeSchedule
);

export default router;
