import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./makeup-requests.controller.js";
import { AssignMakeupSchema, MakeupListQuerySchema, OpenMakeupSlotSchema, RejectMakeupSchema } from "./makeup-requests.schema.js";

/**
 * Học bù (Doc/MAKEUP_ABSENCE_PLAN.md §3.3–3.4). Học viên tạo yêu cầu qua
 * `POST /enrollments/:id/absence { requestMakeup: true }` hoặc `POST /enrollments/:id/makeup-request`.
 */
const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Makeup
 * /makeup-requests/my:
 *   get:
 *     summary: "Học viên: yêu cầu học bù của tôi (mới → cũ)"
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get("/my", authorize("MEMBER"), controller.listMine);

/**
 * @swagger
 * /makeup-requests:
 *   get:
 *     summary: "HLV: yêu cầu học bù của các khóa mình dạy (Quản lý: tất cả)"
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, SCHEDULED, REJECTED, EXPIRED, CANCELLED] } }
 *       - { in: query, name: classId, schema: { type: string } }
 *     responses: { 200: { description: OK } }
 */
router.get("/", authorize("COACH", "MANAGER"), validate(MakeupListQuerySchema, "query"), controller.list);

/**
 * @swagger
 * /makeup-requests/slots:
 *   post:
 *     summary: "HLV: mở buổi bù cho khóa (không bán, không tính buổi chính) + xếp luôn các yêu cầu được chọn"
 *     description: |
 *       Giờ cách hiện tại ≥ 2h, dài ≤ 4h, tới ngày kết thúc khóa + 14 ngày. Phòng mặc định = phòng buổi gần nhất.
 *       Học viên còn chờ học bù của khóa nhận thông báo `MAKEUP_SLOT_OPENED` để tự chọn.
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, startTime, endTime]
 *             properties:
 *               classId: { type: string, format: uuid }
 *               startTime: { type: string, format: date-time }
 *               endTime: { type: string, format: date-time }
 *               roomId: { type: string, format: uuid }
 *               capacity: { type: integer }
 *               assignRequestIds: { type: array, items: { type: string, format: uuid } }
 *     responses: { 201: { description: "{ slot, assigned, failed, notifiedWaiting }" } }
 */
router.post("/slots", authorize("COACH"), validate(OpenMakeupSlotSchema), controller.openSlot);

/**
 * @swagger
 * /makeup-requests/{id}/options:
 *   get:
 *     summary: "Buổi có thể xếp học bù (học viên: buổi bù mở của khóa; HLV: + buổi khóa đó / khóa cùng HLV, cùng hạng)"
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "{ request, options[] }" } }
 */
router.get("/:id/options", authorize("MEMBER", "COACH", "MANAGER"), controller.options);

/**
 * @swagger
 * /makeup-requests/{id}/assign:
 *   post:
 *     summary: "HLV xếp buổi học bù / học viên tự chọn buổi bù mở"
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [scheduleId], properties: { scheduleId: { type: string, format: uuid } } } } }
 *     responses:
 *       200: { description: OK }
 *       409: { description: "MAKEUP_NOT_PENDING · GUEST_SEATS_FULL · hết chỗ / trùng giờ" }
 */
router.post("/:id/assign", authorize("MEMBER", "COACH"), validate(AssignMakeupSchema), controller.assign);

/**
 * @swagger
 * /makeup-requests/{id}/reject:
 *   post:
 *     summary: "HLV từ chối (gửi ≥ 24h trước buổi vắng ⇒ tự tạo hoàn 80% tiền buổi)"
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [reason], properties: { reason: { type: string } } } } }
 *     responses: { 200: { description: "{ request, refund }" } }
 */
router.post("/:id/reject", authorize("COACH", "MANAGER"), validate(RejectMakeupSchema), controller.reject);

/**
 * @swagger
 * /makeup-requests/{id}:
 *   delete:
 *     summary: "Học viên rút yêu cầu đang chờ (báo vắng vẫn giữ)"
 *     tags: [Makeup]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: OK } }
 */
router.delete("/:id", authorize("MEMBER"), controller.cancelMine);

export default router;
