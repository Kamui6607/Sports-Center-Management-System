import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authenticateIncludingInactive } from "../../middlewares/authenticateIncludingInactive.js";
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
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
// Dùng authenticateIncludingInactive vì Coach vừa đăng ký có isActive=false
// nhưng vẫn cần token để xác định danh tính khi nộp CV.

router.post(
  "/me/cv",
  authenticateIncludingInactive,
  authorize("COACH"),
  cvUpload,
  coachController.submitCV
);

// ── Manager: Duyệt hoặc từ chối CV Coach ─────────────────────────────────────

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
