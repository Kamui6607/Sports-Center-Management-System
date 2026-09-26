import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./attendance.controller.js";
import {
  CreateAttendanceSchema,
  UpdateAttendanceSchema,
  GenerateQrSchema,
  ScanQrSchema,
  AttendanceRosterQuerySchema,
  MyAttendanceQuerySchema,
  PenaltyListQuerySchema,
  PenaltyApplySchema,
  PenaltyAppealSchema,
  PenaltyRevokeSchema,
} from "./attendance.schema.js";

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Attendance
 */

/**
 * @swagger
 * /attendance:
 *   get:
 *     summary: "Get attendance roster of a schedule (MANAGER/STAFF: full roster; COACH: only own classes; MEMBER: only own records)"
 *     description: |
 *       **Authorization:**
 *       - MANAGER / STAFF: xem toàn bộ roster (STAFF read-only, mutations vẫn chỉ COACH/MANAGER).
 *       - COACH: chỉ lớp mình phụ trách (403 nếu không).
 *       - MEMBER: chỉ nhận bản ghi điểm danh của CHÍNH MÌNH (không lộ roster của người khác).
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: scheduleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Success" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authorize("MEMBER", "COACH", "MANAGER", "STAFF"),
  validate(AttendanceRosterQuerySchema, "query"),
  controller.getAttendances
);

/**
 * @swagger
 * /attendance:
 *   post:
 *     summary: "Record attendance for a member in a schedule (COACH: own classes; MANAGER: any class)"
 *     description: |
 *       **Authorization:** COACH (chỉ lớp mình phụ trách) và MANAGER ghi được `PRESENT`/`ABSENT`/`LATE`.
 *       `EXCUSED` CHỈ MANAGER xác nhận — COACH gửi EXCUSED bị 403 (enforce ở service, không chỉ controller).
 *       MEMBER/STAFF không có quyền ghi attendance.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduleId: { type: string }
 *               memberId: { type: string }
 *               status: { type: string, enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"] }
 *     responses:
 *       201: { description: "Success" }
 */
router.post("/", authorize("COACH", "MANAGER"), validate(CreateAttendanceSchema), controller.createAttendance);

/**
 * @swagger
 * /attendance/{id}:
 *   patch:
 *     summary: "Update an attendance record (EXCUSED: MANAGER only)"
 *     description: |
 *       **Authorization:** COACH (chỉ attendance thuộc lớp mình phụ trách) và MANAGER.
 *       `EXCUSED` CHỈ MANAGER — COACH gửi EXCUSED bị 403 (enforce ở service).
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
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
 *               status: { type: string, enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"] }
 *     responses:
 *       200: { description: "Success" }
 */
router.patch("/:id", authorize("COACH", "MANAGER"), validate(UpdateAttendanceSchema), controller.updateAttendance);

/**
 * @swagger
 * /attendance/generate-qr:
 *   post:
 *     summary: Generate a short-lived QR token + manual backup code for attendance (Coach/Manager only)
 *     description: |
 *       Trả về 2 cách điểm danh cho buổi học:
 *       - `qrToken`: JWT token (mặc định 600 giây = 10 phút) để member quét QR.
 *       - `manualCode`: mã dự phòng 6 ký tự (alphabet A-HJ-NP-Z2-9, không có 0/O/1/I) cho member
 *         KHÔNG quét được QR (camera hỏng). TTL 90 giây.
 *
 *       Mỗi lần gọi endpoint này sẽ THU HỒI mã dự phòng cũ còn hiệu lực của CÙNG buổi học —
 *       tại một thời điểm chỉ có đúng một mã hợp lệ trên mỗi schedule.
 *     tags: [Attendance]
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
 *     responses:
 *       200:
 *         description: QR token + manual backup code generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               message: QR token generated successfully
 *               data:
 *                 qrToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"
 *                 expiresIn: 600
 *                 manualCode: "K7M2QP"
 *                 manualCodeExpiresIn: 90
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/generate-qr", authorize("COACH", "MANAGER"), validate(GenerateQrSchema), controller.generateQr);

/**
 * @swagger
 * /attendance/scan-qr:
 *   post:
 *     summary: Check in by QR token OR manual backup code (Member only)
 *     description: |
 *       Gửi ĐÚNG MỘT trong hai field — member KHÔNG gửi `scheduleId` (key lạ bị 400):
 *       - `qrToken`: JWT trong mã QR do COACH/MANAGER hiển thị.
 *       - `code`: mã dự phòng 6 ký tự cho member không quét được QR (camera hỏng).
 *         Nhận cả chữ thường và khoảng trắng thừa (tự chuẩn hoá trim + uppercase).
 *
 *       **Chốt chặn 2:** tại thời điểm điểm danh, hệ thống kiểm tra lại member có enrollment
 *       BOOKED/COMPLETED cho buổi học và gói tập còn hạn hay không. Dù đã đặt lịch thành công
 *       trước đó, nếu gói hết hạn trước khi đi học → bị từ chối điểm danh.
 *
 *       **Chống dò mã (chỉ áp dụng cho `code`):** sai/hết hạn/thu hồi/không tồn tại dùng chung
 *       một message; một mã bị dùng hỏng 5 lần → thu hồi; một member sai 10 lần trong 15 phút → 429.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             description: "Chỉ gửi một trong hai: qrToken hoặc code"
 *             properties:
 *               qrToken: { type: string, description: "JWT token from QR code shown by Coach (khi quét QR)" }
 *               code: { type: string, minLength: 6, maxLength: 6, description: "Mã dự phòng 6 ký tự (A-HJ-NP-Z2-9) khi không quét được QR" }
 *           example: { "code": "K7M2QP" }
 *     responses:
 *       200:
 *         description: Marked as PRESENT successfully (note phân biệt QR vs mã dự phòng)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               message: Điểm danh thành công
 *               data: { id: "att-uuid", status: "PRESENT", note: "Điểm danh bằng mã dự phòng (nhập tay)" }
 *       400:
 *         description: QR/code sai, hết hạn hoặc body sai cấu trúc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               qr_expired:
 *                 summary: QR expired
 *                 value: { success: false, message: "Mã QR đã hết hạn. Yêu cầu HLV mở mã mới." }
 *               qr_invalid:
 *                 summary: QR invalid
 *                 value: { success: false, message: "Mã QR không hợp lệ." }
 *               manual_code_invalid:
 *                 summary: Manual code wrong/expired/revoked
 *                 value: { success: false, message: "Mã điểm danh không hợp lệ hoặc đã hết hạn." }
 *               both_credentials:
 *                 summary: Gửi cả qrToken và code (hoặc key lạ như scheduleId)
 *                 value: { success: false, message: "Validation failed", errors: [{ field: "code", message: "Chỉ gửi một trong hai: qrToken hoặc code" }] }
 *       403:
 *         description: Not enrolled or subscription expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               not_enrolled:
 *                 summary: Not enrolled
 *                 value: { success: false, message: "Bạn chưa đặt chỗ cho lớp học này nên không thể điểm danh." }
 *               subscription_expired:
 *                 summary: Subscription expired at check-in time
 *                 value: { success: false, message: "Gói tập của bạn đã hết hạn. Vui lòng gia hạn để có thể vào lớp học." }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/scan-qr", authorize("MEMBER"), validate(ScanQrSchema), controller.scanQr);

/**
 * @swagger
 * /attendance/my:
 *   get:
 *     summary: Get current member's own attendance history
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PRESENT, ABSENT, LATE, EXCUSED] }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: "Paginated own attendance records"
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attendance retrieved successfully
 *               data:
 *                 - id: "att-uuid"
 *                   memberId: "member-uuid"
 *                   scheduleId: "schedule-uuid"
 *                   status: ABSENT
 *                   note: "SYSTEM_NO_SHOW"
 *                   schedule:
 *                     id: "schedule-uuid"
 *                     startTime: "2026-09-15T07:00:00+07:00"
 *                     status: COMPLETED
 *                     class: { id: "class-uuid", name: "Yoga cơ bản" }
 *               pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/my",
  authorize("MEMBER"),
  validate(MyAttendanceQuerySchema, "query"),
  controller.getMyAttendance
);

/**
 * @swagger
 * /attendance/my/summary:
 *   get:
 *     summary: Attendance rate per class for the current member + own penalties
 *     description: |
 *       Trả về bucket theo (member × class): sampleSize, present/late/absent/noShow/excused,
 *       attendanceRate, status (OK | WARN | RELEASE) cùng danh sách hình phạt của chính member
 *       (kèm `canAppeal` để FE bật nút khiếu nại trong cửa sổ 72 giờ).
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Attendance summary"
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attendance summary retrieved successfully
 *               data:
 *                 memberId: "member-uuid"
 *                 memberName: "Nguyễn Văn A"
 *                 thresholds: { minSample: 5, warnBelow: 80, releaseBelow: 70, appealWindowHours: 72 }
 *                 buckets:
 *                   - memberId: "member-uuid"
 *                     memberName: "Nguyễn Văn A"
 *                     classId: "class-uuid"
 *                     className: "Yoga cơ bản"
 *                     sampleSize: 5
 *                     presentCount: 3
 *                     lateCount: 0
 *                     absentCount: 0
 *                     noShowCount: 2
 *                     excusedCount: 0
 *                     attendanceRate: 60
 *                     status: RELEASE
 *                 penalties:
 *                   - id: "penalty-uuid"
 *                     classId: "class-uuid"
 *                     className: "Yoga cơ bản"
 *                     status: APPLIED
 *                     reason: "Chuyên cần 60% (5 buổi được tính) — dưới ngưỡng 70%."
 *                     attendanceRate: 60
 *                     sampleSize: 5
 *                     releasedCount: 2
 *                     blockedUntil: "2026-10-23T07:00:00+07:00"
 *                     canAppeal: true
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/my/summary", authorize("MEMBER"), controller.getMyAttendanceSummary);

/**
 * @swagger
 * /attendance/warnings/scan:
 *   post:
 *     summary: Scan attendance and send WARN notifications (Manager only)
 *     description: |
 *       Gửi `ATTENDANCE_WARNING` cho các (member × class) có 70% <= rate < 80%.
 *       Không gửi trùng khi cùng rate (dedupe theo classId + attendanceRate).
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               classId: { type: string, description: "Chỉ quét một lớp (bỏ trống = tất cả)" }
 *     responses:
 *       200: { description: "Scan result: { checked, warnBuckets, sent, skippedDuplicate }" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/warnings/scan", authorize("MANAGER"), controller.scanWarnings);

/**
 * @swagger
 * /attendance/penalties:
 *   get:
 *     summary: List attendance penalties (Manager only)
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPLIED, REVOKED, EXPIRED] }
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: "Paginated penalties" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/penalties",
  authorize("MANAGER"),
  validate(PenaltyListQuerySchema, "query"),
  controller.listPenalties
);

/**
 * @swagger
 * /attendance/penalties/preview:
 *   post:
 *     summary: Preview members eligible for attendance penalty (Manager only, read-only)
 *     description: |
 *       KHÔNG mutate DB, KHÔNG cancel enrollment, KHÔNG gửi notification.
 *       Trả về các (member × class) đủ điều kiện RELEASE kèm reason và số chỗ sẽ bị thu hồi.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Preview list
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Penalty preview generated
 *               data:
 *                 totalPreviewed: 1
 *                 items:
 *                   - memberId: "member-uuid"
 *                     memberName: "Nguyễn Văn A"
 *                     classId: "class-uuid"
 *                     className: "Yoga cơ bản"
 *                     attendanceRate: 62.5
 *                     sampleSize: 8
 *                     futureBookedEnrollmentCount: 2
 *                     reason: "Chuyên cần 62.5% (8 buổi được tính: 5 có mặt, 0 đi muộn, 2 vắng, 1 không điểm danh) — dưới ngưỡng 70%."
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/penalties/preview", authorize("MANAGER"), controller.previewPenalties);

/**
 * @swagger
 * /attendance/penalties/apply:
 *   post:
 *     summary: Apply attendance penalty (Manager only, atomic transaction)
 *     description: |
 *       Một transaction atomic: tạo `AttendancePenalty` (APPLIED, blockedUntil = now + 30 ngày)
 *       + cancel toàn bộ Enrollment BOOKED ở các buổi CHƯA bắt đầu của đúng (member × class).
 *       Không đụng COMPLETED/CANCELLED và không đụng Class khác. Hội viên nhận notification ATTENDANCE_PENALTY
 *       và bị chặn đặt lại Class này tới blockedUntil.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberId, classId]
 *             properties:
 *               memberId: { type: string, description: MemberProfile.id }
 *               classId: { type: string }
 *               reason: { type: string, maxLength: 500, description: "Bỏ trống sẽ dùng lý do hệ thống sinh" }
 *           example:
 *             memberId: "member-uuid"
 *             classId: "class-uuid"
 *     responses:
 *       200: { description: "Penalty applied (kèm releasedCount, releasedEnrollmentIds, blockedUntil)" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/penalties/apply",
  authorize("MANAGER"),
  validate(PenaltyApplySchema),
  controller.applyPenalty
);

/**
 * @swagger
 * /attendance/penalties/{id}/appeal:
 *   post:
 *     summary: Member appeals own penalty (within 72h window)
 *     description: Không tự động gỡ hình phạt; chỉ lưu audit (appealedAt, appealReason) và báo cho người quyết định.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 5, maxLength: 1000 }
 *     responses:
 *       200: { description: "Appeal recorded" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/penalties/:id/appeal",
  authorize("MEMBER"),
  validate(PenaltyAppealSchema),
  controller.appealPenalty
);

/**
 * @swagger
 * /attendance/penalties/{id}/revoke:
 *   post:
 *     summary: Revoke a penalty (Manager only)
 *     description: |
 *       status -> REVOKED, hội viên được đặt lại Class. `restoreSlots = true` sẽ cố khôi phục các chỗ
 *       đã thu hồi nhưng CHỈ khi an toàn (buổi chưa bắt đầu, còn capacity, không trùng giờ) — không overbooking.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *               restoreSlots: { type: boolean, default: false }
 *     responses:
 *       200: { description: "Penalty revoked (kèm restoredCount, skipped[])" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/penalties/:id/revoke",
  authorize("MANAGER"),
  validate(PenaltyRevokeSchema),
  controller.revokePenalty
);

export default router;