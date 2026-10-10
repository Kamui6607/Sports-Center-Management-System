import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authenticateRestricted } from "../../middlewares/authenticateRestricted.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { cvUpload } from "../../middlewares/upload.js";
import { CoachQuerySchema, UpdateCoachSchema } from "./coaches.schema.js";
import * as coachController from "./coaches.controller.js";
import * as walletController from "./coach-wallet.controller.js";
import { z } from "zod";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Coaches
 *   description: Coach management endpoints
 */

/**
 * @swagger
 * /coaches:
 *   get:
 *     summary: List all coaches
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Filter by specialization (partial match)
 *     responses:
 *       200: { $ref: "#/components/responses/CoachListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate,
  validate(CoachQuerySchema, "query"),
  coachController.listCoaches
);

// ─── Wallet routes (Coach chỉ xem/rút ví mình; Manager xem + duyệt) ─────────

/**
 * @swagger
 * /coaches/me/wallet:
 *   get:
 *     summary: Coach xem ví của chính mình
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin ví
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/me/wallet", authenticate, authorize("COACH"), walletController.getMyWallet);

/**
 * @swagger
 * /coaches/me/wallet/transactions:
 *   get:
 *     summary: Coach xem lịch sử giao dịch ví
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách giao dịch
 */
router.get("/me/wallet/transactions", authenticate, authorize("COACH"), walletController.getMyWalletTransactions);

/**
 * @swagger
 * /coaches/me/wallet/withdraw:
 *   post:
 *     summary: Coach yêu cầu rút tiền (chỉ khi tất cả class đã COMPLETED)
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, bankInfo]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Số tiền muốn rút (VND)
 *               bankInfo:
 *                 type: object
 *                 description: Thông tin ngân hàng nhận tiền
 *                 properties:
 *                   bankName: { type: string }
 *                   accountNumber: { type: string }
 *                   accountName: { type: string }
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Yêu cầu rút tiền đã được gửi, chờ Manager duyệt
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409:
 *         description: Đang có yêu cầu rút tiền PENDING chưa xử lý
 */
router.post(
  "/me/wallet/withdraw",
  authenticate,
  authorize("COACH"),
  validate(z.object({
    amount: z.number().positive(),
    bankInfo: z.object({
      bankName: z.string().min(1),
      accountNumber: z.string().min(1),
      accountName: z.string().min(1),
    }),
    note: z.string().max(500).optional(),
  })),
  walletController.requestWithdrawal
);

/**
 * @swagger
 * /coaches/wallet/transactions/{txId}/review:
 *   patch:
 *     summary: Manager duyệt hoặc từ chối yêu cầu rút tiền của Coach
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: txId
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
 *     responses:
 *       200:
 *         description: Yêu cầu đã được xử lý
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
/**
 * @swagger
 * /coaches/wallet/transactions:
 *   get:
 *     summary: "BE-7: MANAGER liệt kê lệnh rút tiền (kèm HLV, số dư & tiền tạm giữ của ví)"
 *     tags: [Coaches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [WITHDRAWAL, DEPOSIT, REFUND_DEBIT], default: WITHDRAWAL } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, COMPLETED, REJECTED, FAILED] } }
 *       - { in: query, name: coachId, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "[{ id, amount, status, bankInfo, note, rejectReason, createdAt, coach, wallet: { balance, pendingRefundDebit, available } }]" }
 */
router.get(
  "/wallet/transactions",
  authenticate,
  authorize("MANAGER"),
  validate(z.object({
    type: z.enum(["WITHDRAWAL", "DEPOSIT", "REFUND_DEBIT"]).optional(),
    status: z.enum(["PENDING", "COMPLETED", "REJECTED", "FAILED"]).optional(),
    coachId: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }), "query"),
  walletController.listWalletTransactions
);

/**
 * @swagger
 * /coaches/wallet/transactions/{txId}:
 *   get:
 *     summary: "BE-7: MANAGER xem chi tiết lệnh rút tiền"
 *     tags: [Coaches]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Lệnh rút + coach + wallet" }
 *       404: { description: "Không tìm thấy" }
 */
router.get("/wallet/transactions/:txId", authenticate, authorize("MANAGER"), walletController.getWalletTransaction);

/**
 * @swagger
 * /coaches/me/students/{memberId}:
 *   get:
 *     summary: "BE-19: Hồ sơ học viên trong các khóa của tôi + chuyên cần từng khóa + lộ trình"
 *     tags: [Coaches]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ member, attendedCount, pastSessionCount, classes[], plans[] }" }
 *       403: { description: "Học viên không thuộc khóa của tôi" }
 */
router.get("/me/students/:memberId", authenticate, authorize("COACH"), coachController.getMyStudent);

router.patch(
  "/wallet/transactions/:txId/review",
  authenticate,
  authorize("MANAGER"),
  validate(z.object({
    action: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().max(500).optional(),
  })),
  walletController.reviewWithdrawal
);

// ─── Coach profile routes ─────────────────────────────────────────────────────

// NOTE: Đặt /cv/pending TRƯỚC /:id để không bị match sai sang /:id
/**
 * @swagger
 * /coaches/cv/pending:
 *   get:
 *     summary: Manager lấy danh sách các HLV đang chờ duyệt CV
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get(
  "/cv/pending",
  authenticate,
  authorize("MANAGER"),
  coachController.listPendingCoachCVs
);

/**
 * @swagger
 * /coaches/{id}:
 *   get:
 *     summary: Get coach by ID
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Coach user ID
 *     responses:
 *       200: { $ref: "#/components/responses/CoachOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", authenticate, coachController.getCoachById);

/**
 * @swagger
 * /coaches/{id}:
 *   patch:
 *     summary: Update coach profile (Manager update any; Coach updates own profile)
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Coach user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               phone: { type: string }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               dateOfBirth: { type: string }
 *               specialization: { type: string }
 *               experienceYears: { type: integer }
 *               bio: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/CoachOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authenticate,
  authorize("MANAGER", "COACH"),
  validate(UpdateCoachSchema),
  coachController.updateCoach
);

// ── Coach: Nộp CV ─────────────────────────────────────────────────────────────
// Dùng authenticateRestricted (BE-9) vì Coach chưa được duyệt có isActive=false
// nhưng vẫn cần token để xác định danh tính khi nộp CV.

/**
 * @swagger
 * /coaches/me/cv:
 *   post:
 *     summary: Coach nộp CV (PDF)
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [cv]
 *             properties:
 *               cv:
 *                 type: string
 *                 format: binary
 *                 description: File PDF CV
 *     responses:
 *       200:
 *         description: OK
 */
router.post(
  "/me/cv",
  authenticateRestricted,
  authorize("COACH"),
  cvUpload,
  coachController.submitCV
);

// ── Manager: Duyệt hoặc từ chối CV Coach ─────────────────────────────────────

/**
 * @swagger
 * /coaches/{profileId}/cv/review:
 *   patch:
 *     summary: Manager duyệt hoặc từ chối CV của Coach
 *     tags: [Coaches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: profileId
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
 *     responses:
 *       200:
 *         description: OK
 */
/**
 * @swagger
 * /coaches/{profileId}/cv/file:
 *   get:
 *     summary: "BE-8: Tải file CV (PDF) — MANAGER hoặc chính HLV"
 *     tags: [Coaches]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "application/pdf" }
 *       403: { description: "Không có quyền" }
 *       404: { description: "Chưa nộp CV / không còn file" }
 */
router.get("/:profileId/cv/file", authenticateRestricted, coachController.downloadCv);

router.patch(
  "/:profileId/cv/review",
  authenticate,
  authorize("MANAGER"),
  validate(
    z.object({
      action: z.enum(["APPROVE", "REJECT"]),
      reason: z.string().max(500).optional(),
    })
  ),
  coachController.reviewCoachCV
);

export default router;
