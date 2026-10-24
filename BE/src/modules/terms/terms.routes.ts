import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import {
  CheckInListQuerySchema,
  CreateLeaveSchema,
  ExemptSchema,
  LeaveIdParamSchema,
  LeaveListQuerySchema,
  PassScanQuerySchema,
  ReviewLeaveSchema,
  ScanCheckInSchema,
  TermCoachParamSchema,
  TermIdParamSchema,
  TermRosterQuerySchema,
  UpdateTermSchema,
  VerifyPassSchema,
} from "./terms.schema.js";
import * as controller from "./terms.controller.js";

/** Mount tại `/terms`. */
const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Terms
 *   description: |
 *     Kỳ học (3 kỳ/năm) & quyền lợi của Coach. Coach cần có khóa học hợp lệ trong hạn ân hạn và dạy đủ buổi;
 *     hệ thống ĐÁNH GIÁ + BÁO CÁO + NHẮC, thẻ ra vào của Coach do Manager quét để xác nhận (không tự khóa tài khoản).
 */

/**
 * @swagger
 * /terms:
 *   get:
 *     summary: Danh sách kỳ học (năm trước, năm nay, năm sau)
 *     tags: [Terms]
 *     responses:
 *       200: { description: "[{ id, name, year, seq, startDate, endDate, graceDays, graceDeadline, phase, daysToStart, daysToEnd }]" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/", authorize("COACH", "MANAGER"), controller.listTerms);

/**
 * @swagger
 * /terms/current:
 *   get:
 *     summary: Kỳ học hiện tại
 *     tags: [Terms]
 *     responses:
 *       200: { description: "Kỳ chứa thời điểm hiện tại (giờ Việt Nam)" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/current", authorize("COACH", "MANAGER"), controller.getCurrentTerm);

/**
 * @swagger
 * /terms/me:
 *   get:
 *     summary: COACH — trạng thái của tôi trong kỳ hiện tại
 *     description: |
 *       `{ eligible, term, evaluation: { state, final, reasons, warnings, atRisk, deadlineAt, daysToDeadline,
 *       registration, delivery, leave }, previousTerm, pass: { valid, level, reason }, rules }`.
 *       `state`: PENDING | COMPLIANT | NON_COMPLIANT | EXEMPT. `eligible=false` khi hồ sơ Coach chưa được duyệt.
 *     tags: [Terms]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/me", authorize("COACH"), controller.getMyTermStatus);

/**
 * @swagger
 * /terms/me/pass:
 *   get:
 *     summary: COACH — mã thẻ ra vào (JWT sống ~60 giây, app tự làm mới)
 *     description: "`{ token, expiresIn, verdict: { valid, level, reason }, state }` — token đưa vào QR cho Manager quét."
 *     tags: [Terms]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/me/pass", authorize("COACH"), controller.getMyPass);

/**
 * @swagger
 * /terms/me/leaves:
 *   get:
 *     summary: COACH — đơn nghỉ phép của tôi
 *     tags: [Terms]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *   post:
 *     summary: COACH — xin nghỉ phép/ốm
 *     description: "Nghỉ được duyệt: gia hạn ân hạn đúng số ngày nghỉ, buổi hủy trong thời gian nghỉ không bị tính, nghỉ ≥ 50% kỳ thì miễn kỳ."
 *     tags: [Terms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate, reason]
 *             properties:
 *               startDate: { type: string, example: "2026-11-02", description: "YYYY-MM-DD (giờ VN)" }
 *               endDate: { type: string, example: "2026-11-09" }
 *               kind: { type: string, enum: [SICK, PERSONAL, OTHER] }
 *               reason: { type: string, minLength: 3, maxLength: 500 }
 *     responses:
 *       201: { description: Created }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       409: { description: "LEAVE_OVERLAP — trùng đơn nghỉ khác" }
 */
router.get("/me/leaves", authorize("COACH"), controller.listMyLeaves);
router.post("/me/leaves", authorize("COACH"), validate(CreateLeaveSchema), controller.createLeave);

/**
 * @swagger
 * /terms/me/leaves/{id}:
 *   delete:
 *     summary: COACH — hủy đơn nghỉ (đang chờ duyệt, hoặc đã duyệt nhưng chưa bắt đầu)
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: "LEAVE_NOT_CANCELLABLE" }
 */
router.delete("/me/leaves/:id", authorize("COACH"), validate(LeaveIdParamSchema, "params"), controller.cancelMyLeave);

/**
 * @swagger
 * /terms/leaves:
 *   get:
 *     summary: MANAGER — danh sách đơn nghỉ phép của Coach
 *     tags: [Terms]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, APPROVED, REJECTED, CANCELLED] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/leaves", authorize("MANAGER"), validate(LeaveListQuerySchema, "query"), controller.listLeaves);

/**
 * @swagger
 * /terms/leaves/{id}/review:
 *   patch:
 *     summary: MANAGER — duyệt / từ chối đơn nghỉ phép
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, REJECT] }
 *               note: { type: string, maxLength: 300 }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: "LEAVE_ALREADY_REVIEWED" }
 */
router.patch(
  "/leaves/:id/review",
  authorize("MANAGER"),
  validate(LeaveIdParamSchema, "params"),
  validate(ReviewLeaveSchema),
  controller.reviewLeave
);

/**
 * @swagger
 * /terms/pass/verify:
 *   post:
 *     summary: MANAGER — quét thẻ ra vào của Coach ⇒ hợp lệ hay không (ghi nhật ký)
 *     description: "`{ valid, level: OK|WARN|DENY, reason, coach, state, previousState, term, scannedAt }`. Không tự khóa gì — người quét quyết định."
 *     tags: [Terms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400: { description: "PASS_EXPIRED | PASS_INVALID" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/pass/verify", authorize("MANAGER"), validate(VerifyPassSchema), controller.verifyPass);

/**
 * @swagger
 * /terms/pass/scans:
 *   get:
 *     summary: MANAGER — nhật ký quét thẻ Coach
 *     tags: [Terms]
 *     parameters:
 *       - { in: query, name: valid, schema: { type: string, enum: ["true", "false"] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: OK }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/pass/scans", authorize("MANAGER"), validate(PassScanQuerySchema, "query"), controller.listPassScans);

/**
 * @swagger
 * /terms/maintenance:
 *   post:
 *     summary: MANAGER — chạy ngay job nhắc & đánh giá kỳ (cũng chạy định kỳ ở server)
 *     description: "Idempotent. `{ terms, evaluated, coachReminders, managerReports }`."
 *     tags: [Terms]
 *     responses:
 *       200: { description: OK }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/maintenance", authorize("MANAGER"), controller.runMaintenance);

/**
 * @swagger
 * /terms/check-in/qr:
 *   post:
 *     summary: MANAGER — tạo mã QR check-in phòng gym cho HLV (sống ~60 giây, trang Web tự đổi mã)
 *     tags: [Terms]
 *     responses:
 *       200: { description: "{ token, expiresIn, issuedAt } — token đưa vào QR" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/check-in/qr", authorize("MANAGER"), controller.createCheckInQr);

/**
 * @swagger
 * /terms/check-in:
 *   post:
 *     summary: COACH — quét QR check-in ⇒ ghi MỘT ngày dùng phòng (giờ VN)
 *     description: |
 *       Còn hạn mức miễn phí tháng và thẻ hợp lệ ⇒ miễn phí; ngược lại trừ phí/ngày từ tiền ròng của khóa cũ nhất còn dư
 *       (ví thiếu ⇒ ghi nợ, trừ dần). Quét lại trong ngày ⇒ 200 `alreadyCheckedIn=true`, không tính thêm.
 *       `{ alreadyCheckedIn, checkIn: { dayKey, free, feeAssessed, feeCharged, feeDebt, dayIndex }, pass, usage }`.
 *     tags: [Terms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       201: { description: Created — ngày dùng đầu tiên trong ngày }
 *       200: { description: Đã check-in hôm nay }
 *       400: { description: "CHECKIN_QR_EXPIRED | CHECKIN_QR_INVALID" }
 *       403: { description: "CHECKIN_NOT_ELIGIBLE — hồ sơ chưa duyệt / tài khoản khóa" }
 */
router.post("/check-in", authorize("COACH"), validate(ScanCheckInSchema), controller.scanCheckIn);

/**
 * @swagger
 * /terms/me/check-ins:
 *   get:
 *     summary: COACH — mức dùng phòng tháng này + các ngày gần đây
 *     description: "`{ eligible, pass, usage: { daysUsed, freeDaysUsed, freeDaysPerMonth, freeDaysLeft, feePerDay, feeAssessedThisMonth, feeChargedThisMonth, feeDebt, checkedInToday }, items }`"
 *     tags: [Terms]
 *     responses:
 *       200: { description: OK }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/me/check-ins", authorize("COACH"), controller.getMyCheckIns);

/**
 * @swagger
 * /terms/check-ins:
 *   get:
 *     summary: MANAGER — nhật ký check-in phòng gym của HLV (+ tổng hợp phí)
 *     tags: [Terms]
 *     parameters:
 *       - { in: query, name: dayKey, schema: { type: string, example: "2026-10-24" } }
 *       - { in: query, name: monthKey, schema: { type: string, example: "2026-10" } }
 *       - { in: query, name: coachId, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ items, summary: { total, free, paid, feeAssessed, feeCharged, feeDebt } } + pagination" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/check-ins", authorize("MANAGER"), validate(CheckInListQuerySchema, "query"), controller.listCheckIns);

/**
 * @swagger
 * /terms/{id}:
 *   patch:
 *     summary: MANAGER — chỉnh số ngày ân hạn của kỳ (0–60)
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [graceDays]
 *             properties:
 *               graceDays: { type: integer, minimum: 0, maximum: 60 }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: "Kỳ đã kết thúc" }
 */
router.patch("/:id", authorize("MANAGER"), validate(TermIdParamSchema, "params"), validate(UpdateTermSchema), controller.updateTerm);

/**
 * @swagger
 * /terms/{id}/coaches:
 *   get:
 *     summary: MANAGER — bảng Coach × kỳ (đạt / chưa đạt / chờ / miễn) kèm số liệu
 *     description: "`{ term, summary: { total, PENDING, COMPLIANT, NON_COMPLIANT, EXEMPT, atRisk }, coaches: [{ coach, evaluation, manualExempt, lastReminderStage, evaluatedAt }] }`."
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: state, schema: { type: string, enum: [PENDING, COMPLIANT, NON_COMPLIANT, EXEMPT] } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get(
  "/:id/coaches",
  authorize("MANAGER"),
  validate(TermIdParamSchema, "params"),
  validate(TermRosterQuerySchema, "query"),
  controller.getTermRoster
);

/**
 * @swagger
 * /terms/{id}/evaluate:
 *   post:
 *     summary: MANAGER — đánh giá và LƯU kết quả cả kỳ (idempotent)
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ term, summary, evaluatedAt }" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.post("/:id/evaluate", authorize("MANAGER"), validate(TermIdParamSchema, "params"), controller.evaluateTerm);

/**
 * @swagger
 * /terms/{id}/coaches/{coachId}/exempt:
 *   put:
 *     summary: MANAGER — miễn trừ một Coach trong kỳ (kèm lý do)
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: coachId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 3, maxLength: 300 }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 *   delete:
 *     summary: MANAGER — bỏ miễn trừ
 *     tags: [Terms]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: coachId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.put(
  "/:id/coaches/:coachId/exempt",
  authorize("MANAGER"),
  validate(TermCoachParamSchema, "params"),
  validate(ExemptSchema),
  controller.exemptCoach
);
router.delete("/:id/coaches/:coachId/exempt", authorize("MANAGER"), validate(TermCoachParamSchema, "params"), controller.unexemptCoach);

export default router;
