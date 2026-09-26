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
 *     summary: Book a class schedule (Member books for self; Manager books for a member)
 *     description: |
 *       **Business Rules (Chốt chặn nghiệp vụ) — sau khi bỏ Membership:**
 *       - Member phải **đã MUA khóa học** (`CoursePurchase` ACTIVE) của Class này → nếu chưa,
 *         trả **403 `COURSE_NOT_PURCHASED`**. Quyền vào lớp đến từ việc mua khóa học, không còn từ gói tập.
 *       - Khóa học phải **còn hạn tại thời điểm buổi học diễn ra** (`CoursePurchase.endDate ≥ schedule.startTime`;
 *         `endDate = null` nghĩa là khóa không giới hạn thời hạn).
 *       - **Không còn quota "số lớp song song"** (đã bỏ cùng `MembershipPlan.maxConcurrentClasses`):
 *         member được đặt mọi buổi của những khóa học mình đã mua.
 *       - Không còn yêu cầu tier PREMIUM cho lớp `classType = PREMIUM` (chỉ còn là thuộc tính phân loại).
 *       - No double-booking the same schedule.
 *       - No two schedules with overlapping time.
 *       - Class capacity must not be exceeded.
 *       - Member đang bị hình phạt chuyên cần ở Class này thì không được đặt lại.
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
 *               memberId: { type: string, format: uuid, description: "Bắt buộc khi MANAGER đặt hộ member (userId hoặc MemberProfile.id)" }
 *           example:
 *             scheduleId: "a1b2c3d4-0000-0000-0000-000000000001"
 *     responses:
 *       201: { $ref: "#/components/responses/EnrollmentCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403:
 *         description: |
 *           Forbidden — one of:
 *           - Member chưa mua khóa học (`COURSE_NOT_PURCHASED`)
 *           - Khóa học hết hạn trước ngày buổi học diễn ra
 *           - Member đang bị hình phạt chuyên cần ở Class này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               course_not_purchased:
 *                 summary: Member chưa mua khóa học
 *                 value: { success: false, message: "Bạn chưa sở hữu khóa học \"Yoga cơ bản\". Vui lòng mua khóa học để đặt lịch.", errors: { code: "COURSE_NOT_PURCHASED", classId: "class-uuid" } }
 *               course_expired_before_class:
 *                 summary: Khóa học hết hạn trước ngày học
 *                 value: { success: false, message: "Khóa học \"Yoga cơ bản\" của bạn hết hạn ngày 25/09/2026, trước khi buổi học diễn ra ngày 30/09/2026. Vui lòng mua lại khóa học để đặt lịch." }
 *               attendance_penalty:
 *                 summary: Đang bị hình phạt chuyên cần ở Class này
 *                 value: { success: false, message: "Bạn đang bị tạm khoá đặt chỗ lớp này đến 30/09/2026 00:00 do chuyên cần 60% (5 buổi được tính). Vui lòng liên hệ quản lý nếu cần khiếu nại." }
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

// Ghi chú: endpoint quota lớp học song song (`GET /enrollments/my/quota`) đã bị GỠ BỎ cùng Membership.
// Danh sách khóa học Member đã mua (nguồn quyền đặt lịch) nằm ở `GET /course-purchases/my`.

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
  authenticate, authorize("MANAGER", "COACH"),
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
 *     summary: Move a booking to another schedule (Member moves own booking; Manager any member)
 *     description: |
 *       **Business rules (Chốt chặn nghiệp vụ):**
 *       - Chỉ chuyển chỗ đặt (Enrollment) sang buổi khác — KHÔNG sửa ClassSchedule/Class/Room.
 *       - MEMBER chỉ chuyển chỗ của chính mình (403 nếu không phải); COACH bị chặn.
 *       - **BR-08**: `targetScheduleId` phải thuộc CÙNG Class với Enrollment hiện tại (khác Class -> 400).
 *         Member không được dùng endpoint này để chuyển sang Class khác.
 *       - Chỗ cũ phải `BOOKED` và buổi cũ chưa diễn ra; buổi mới phải `SCHEDULED` và chưa bắt đầu.
 *       - Áp dụng đầy đủ luật đặt chỗ cho buổi mới: Member đã mua khóa học (CoursePurchase ACTIVE) và khóa
 *         còn hạn tới ngày học, còn sức chứa, không trùng chỗ, không trùng giờ (bỏ qua chỗ cũ đang được chuyển đi).
 *       - Vẫn khóa theo thứ tự member -> (member × class) -> schedule để không chen với request khác.
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
