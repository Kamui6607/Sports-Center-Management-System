import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./attendance.controller.js";
import { CreateAttendanceSchema, UpdateAttendanceSchema, GenerateQrSchema, ScanQrSchema } from "./attendance.schema.js";

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
 */
router.get("/", controller.getAttendances);

/**
 * @swagger
 * /attendance:
 *   post:
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
 *     summary: Generate a short-lived QR token for attendance (Coach/Manager only)
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
 *         description: QR token generated
 */
router.post("/generate-qr", authorize("COACH", "MANAGER"), validate(GenerateQrSchema), controller.generateQr);

/**
 * @swagger
 * /attendance/scan-qr:
 *   post:
 *     summary: Scan a QR token to mark self as PRESENT (Member only)
 *     description: |
 *       **Chốt chặn 2:** Tại thời điểm quét QR, hệ thống kiểm tra lại gói tập của member có còn hạn hay không.
 *       Dù đã đặt lịch thành công trước đó, nếu gói hết hạn trước khi đi học → bị từ chối điểm danh.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [qrToken]
 *             properties:
 *               qrToken: { type: string, description: "JWT token from QR code shown by Coach" }
 *     responses:
 *       200:
 *         description: Marked as PRESENT successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               data: { id: "att-uuid", status: "PRESENT" }
 *       400:
 *         description: QR expired or invalid
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
 *                 summary: Subscription expired at scan time
 *                 value: { success: false, message: "Gói tập của bạn đã hết hạn. Vui lòng gia hạn để có thể vào lớp học." }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/scan-qr", authorize("MEMBER"), validate(ScanQrSchema), controller.scanQr);

export default router;