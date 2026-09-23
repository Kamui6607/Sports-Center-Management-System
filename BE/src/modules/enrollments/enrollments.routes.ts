import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreateEnrollmentSchema, TransferEnrollmentSchema, EnrollmentQuerySchema } from "./enrollments.schema.js";
import * as enrollmentsController from "./enrollments.controller.js";

const router = Router();

/**
 * @swagger
 * /enrollments:
 *   post:
 *     summary: Book a class (Member books own class; Staff/Manager book for a member)
 *     description: |
 *       **Business Rules (Chốt chặn nghiệp vụ):**
 *       - Membership must be ACTIVE at booking time.
 *       - Membership `endDate` must be ≥ `schedule.startTime` — cannot book a class that happens after your plan expires.
 *       - PREMIUM class requires PREMIUM tier.
 *       - **Concurrent-class quota**: số Class KHÁC NHAU đang giữ (Enrollment `BOOKED` ở buổi `SCHEDULED` chưa bắt đầu)
 *         không được vượt `MembershipPlan.maxConcurrentClasses` của gói đang ACTIVE. Class đã giữ không tiêu thêm quota.
 *         Vượt quota → **403 `CONCURRENT_CLASS_LIMIT_REACHED`** kèm `tier`/`limit`/`used`/`remaining`.
 *         Member gói FREE có `limit = 0` nên mọi booking Class mới đều bị 403 quota (FE nên gợi ý nâng cấp gói).
 *         Xem chi tiết cách tính ở `GET /enrollments/my/quota`.
 *       - No double-booking the same schedule.
 *       - No two schedules with overlapping time.
 *       - Class capacity must not be exceeded.
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scheduleId]
 *             properties:
 *               scheduleId: { type: string, format: uuid }
 *               memberId: { type: string, format: uuid, description: "Required when booked by Staff/Manager" }
 *           example:
 *             scheduleId: "a1b2c3d4-0000-0000-0000-000000000001"
 *     responses:
 *       201: { $ref: "#/components/responses/EnrollmentCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403:
 *         description: |
 *           Forbidden — one of:
 *           - No active membership
 *           - Membership expires before class date
 *           - PREMIUM class requires PREMIUM plan
 *           - Concurrent-class quota exceeded (`MembershipPlan.maxConcurrentClasses`)
 *           - Member đang bị hình phạt chuyên cần ở Class này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               no_membership:
 *                 summary: No active membership
 *                 value: { success: false, message: "Bạn không có gói tập đang hoạt động. Vui lòng mua gói để đặt lịch." }
 *               plan_expires_before_class:
 *                 summary: Plan expires before class
 *                 value: { success: false, message: "Gói tập của bạn sẽ hết hạn ngày 25/09/2026, trước khi lớp học diễn ra ngày 30/09/2026. Vui lòng gia hạn gói để đặt lịch." }
 *               premium_required:
 *                 summary: PREMIUM class requires PREMIUM plan
 *                 value: { success: false, message: "Premium membership required to book this class." }
 *               concurrent_class_limit_reached:
 *                 summary: Vượt quota lớp học song song (distinct Class)
 *                 value:
 *                   success: false
 *                   message: "Bạn đã đạt giới hạn 3 lớp học song song của gói MEMBERSHIP. Vui lòng hủy hoặc chuyển một lớp đang đặt trước khi đăng ký lớp mới."
 *                   errors: { code: "CONCURRENT_CLASS_LIMIT_REACHED", tier: "MEMBERSHIP", limit: 3, used: 3, remaining: 0 }
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
 * /enrollments/my/quota:
 *   get:
 *     summary: Get my concurrent-class quota (Member only)
 *     description: |
 *       **Quota lớp học song song** — số Class KHÁC NHAU tối đa mà hội viên được giữ đồng thời,
 *       lấy từ `MembershipPlan.maxConcurrentClasses` của MembershipSubscription đang ACTIVE.
 *
 *       Cách tính `used` (tính động từ DB, KHÔNG lưu counter trên Member):
 *       - Chỉ tính `Enrollment.status = BOOKED` ở `ClassSchedule.status = SCHEDULED` và `startTime > now`.
 *       - Đếm **DISTINCT Class**: một Class có nhiều buổi BOOKED vẫn chỉ chiếm 1 quota (`classes[]` có 1 entry/Class,
 *         kèm `futureBookedScheduleCount`; `scheduleId`/`scheduleStartTime` chỉ là buổi đại diện).
 *       - KHÔNG tính: Enrollment `COMPLETED`/`CANCELLED`, buổi đã bắt đầu, buổi `CANCELLED`/`COMPLETED`.
 *
 *       `remaining = max(0, limit - used)`. Transfer trong cùng Class (BR-08) không đổi quota.
 *       Downgrade gói không tự hủy lớp đang giữ: có thể `used > limit` (grandfathering) nhưng
 *       `remaining = 0` nên không đặt thêm Class mới cho tới khi `used < limit`.
 *
 *       Subscription:
 *       - Member mới được auto-provision gói **FREE** (`tier = FREE`, `maxConcurrentClasses = 0`) nên response
 *         thường có `hasActiveSubscription = true`, `tier = "FREE"`, `limit = 0`.
 *       - Dữ liệu cũ/bất thường KHÔNG có subscription ACTIVE: `hasActiveSubscription = false`, `tier = null`,
 *         `limit = 0`, `used` = số Class đang giữ (nếu có), `remaining = 0`.
 *         `tier = null` KHÔNG có nghĩa là tier FREE.
 *
 *       Chỉ trả quota của CHÍNH hội viên đang đăng nhập (không có tham số `memberId`).
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/responses/ConcurrentClassQuotaOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/my/quota", authenticate, authorize("MEMBER"), enrollmentsController.getMyQuota);

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

/**
 * @swagger
 * /enrollments/{id}/transfer:
 *   post:
 *     summary: Move a booking to another schedule (Member moves own booking; Staff/Manager any member)
 *     description: |
 *       **Business rules (Chốt chặn nghiệp vụ):**
 *       - Chỉ chuyển chỗ đặt (Enrollment) sang buổi khác — KHÔNG sửa ClassSchedule/Class/Room.
 *       - MEMBER chỉ chuyển chỗ của chính mình (403 nếu không phải); COACH bị chặn.
 *       - **BR-08**: `targetScheduleId` phải thuộc CÙNG Class với Enrollment hiện tại (khác Class -> 400).
 *         Member không được dùng endpoint này để chuyển sang Class khác.
 *       - Chỗ cũ phải `BOOKED` và buổi cũ chưa diễn ra; buổi mới phải `SCHEDULED` và chưa bắt đầu.
 *       - Áp dụng đầy đủ luật đặt chỗ cho buổi mới: gói tập ACTIVE còn hạn tới ngày học, PREMIUM class cần tier PREMIUM,
 *         còn sức chứa, không trùng chỗ, không trùng giờ (bỏ qua chỗ cũ đang được chuyển đi).
 *       - **Quota lớp học song song KHÔNG đổi**: transfer giữ nguyên Class (BR-08) nên không tiêu thêm quota mới —
 *         `used`/`remaining` của `GET /enrollments/my/quota` không thay đổi. Vẫn khóa `lockMemberQuota`
 *         cùng thứ tự lock với booking (memberQuota -> memberClass -> schedule) để không chen với request khác.
 *       - **BR-09**: các transfer của cùng `(memberId, classId)` được serialize bằng advisory lock + compare-and-set,
 *         nên một Enrollment không thể bị chuyển đồng thời sang nhiều buổi: chỉ 1 request thắng (200), request còn lại 409.
 *       - Toàn bộ trong 1 transaction: fail thì rollback, hội viên giữ nguyên chỗ cũ.
 *       - Chỗ cũ chuyển `CANCELLED` (giữ lịch sử); buổi mới nếu từng bị hủy trước đây sẽ được kích hoạt lại (BR-07).
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Enrollment ID của chỗ đặt hiện tại
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetScheduleId]
 *             properties:
 *               targetScheduleId:
 *                 type: string
 *                 format: uuid
 *                 description: ClassSchedule.id của buổi muốn chuyển tới
 *           example:
 *             targetScheduleId: "a1b2c3d4-0000-0000-0000-000000000002"
 *     responses:
 *       200: { $ref: "#/components/responses/EnrollmentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:id/transfer",
  authenticate,
  validate(TransferEnrollmentSchema),
  enrollmentsController.transferEnrollment
);

export default router;
