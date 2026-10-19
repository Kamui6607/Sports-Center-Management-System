import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { CreateUserSchema, UpdateUserSchema, UserQuerySchema } from "./users.schema.js";
import * as usersController from "./users.controller.js";

const router = Router();

router.use(authenticate, authorize("MANAGER"));

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [MEMBER, COACH, MANAGER] }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { $ref: "#/components/responses/UserListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/", validate(UserQuerySchema, "query"), usersController.listUsers);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create staff, coach, manager or member account (MEMBER creates the member profile too)
 *     description: |
 *       Với `role = MEMBER`, backend tạo MemberProfile + **auto-provision một MembershipSubscription ACTIVE
 *       với gói FREE** (`maxConcurrentClasses = 0`) trong cùng transaction. COACH/MANAGER KHÔNG được cấp
 *       subscription. Idempotent theo member: nếu member đã có subscription ACTIVE thì không tạo thêm.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName, role]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               fullName: { type: string, minLength: 2 }
 *               phone: { type: string }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               dateOfBirth: { type: string, format: date }
 *               role: { type: string, enum: [MEMBER, COACH], description: "Không tạo được tài khoản MANAGER" }
 *               fitnessGoal: { type: string, description: "Role MEMBER only" }
 *               trainingLevel: { type: string, enum: [BEGINNER, INTERMEDIATE, ADVANCED], description: "Role MEMBER only" }
 *               trainingPreference: { type: string, description: "Role MEMBER only" }
 *     responses:
 *       201: { $ref: "#/components/responses/UserCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/", validate(CreateUserSchema), usersController.createUser);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/UserOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", usersController.getUserById);

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update user (thông tin / vai trò / mở khóa)
 *     description: "Không tự khóa / tự đổi vai trò; không khóa hoặc hạ quyền MANAGER hoạt động cuối (serialize). Đổi vai trò bị chặn khi còn nghĩa vụ (ROLE_CHANGE_BLOCKED). Mở khóa HLV có CV chưa APPROVED ⇒ 409 COACH_CV_NOT_APPROVED."
 *     tags: [Users]
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
 *               fullName: { type: string }
 *               phone: { type: string }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               dateOfBirth: { type: string }
 *               isActive: { type: boolean }
 *               role: { type: string, enum: [MEMBER, COACH, MANAGER] }
 *     responses:
 *       200: { $ref: "#/components/responses/UserOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch("/:id", validate(UpdateUserSchema), usersController.updateUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Khóa tài khoản (khóa mềm isActive=false — KHÔNG xóa dữ liệu, không hủy lớp/hoàn tiền/đơn)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/UserOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete("/:id", usersController.deactivateUser);

/**
 * @swagger
 * /users/{id}/password-reset:
 *   post:
 *     summary: Manager gửi yêu cầu đặt lại mật khẩu (email chứa mã OTP để người dùng TỰ đặt mật khẩu mới)
 *     description: "Không đổi mật khẩu, không trả mật khẩu/mã. Mã 15 phút, dùng một lần, 5 lần sai; cooldown 60s/người nhận. Người dùng hoàn tất bằng PATCH /auth/reset-password { email, otp, newPassword } ⇒ mọi phiên cũ bị thu hồi."
 *     tags: [Users]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       202:
 *         description: Email đã vào hàng đợi (outbox)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 message: "Đã đưa email đặt lại mật khẩu vào hàng đợi gửi."
 *                 data: { queued: true, channel: EMAIL, recipient: "me***@example.com", outboxId: "uuid", expiresAt: "2026-10-17T10:15:00.000Z", expiresInSeconds: 900, resendAfterSeconds: 60 }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: "USER_LOCKED — tài khoản đang khóa" }
 *       429: { description: "RESET_COOLDOWN (kèm retryAfterSeconds) hoặc RATE_LIMITED" }
 *   get:
 *     summary: Trạng thái yêu cầu đặt lại mật khẩu gần nhất (mã còn hạn/đã dùng, email đã gửi chưa) — không lộ mã
 *     tags: [Users]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 message: OK
 *                 data:
 *                   request: { requestedAt: "2026-10-17T10:00:00.000Z", expiresAt: "2026-10-17T10:15:00.000Z", usedAt: null, state: ACTIVE }
 *                   email: { id: "uuid", initiatedBy: MANAGER, status: PENDING, attempts: 0, queuedAt: "2026-10-17T10:00:00.000Z", sentAt: null }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.post(
  "/:id/password-reset",
  rateLimit({ name: "admin-password-reset", windowMs: 60_000, max: 10 }),
  usersController.requestPasswordReset
);
router.get("/:id/password-reset", usersController.getPasswordResetStatus);

/**
 * @swagger
 * /users/{id}/history:
 *   get:
 *     summary: Thống kê dữ liệu nghiệp vụ của tài khoản (quyết định xóa vĩnh viễn được hay chỉ khóa)
 *     tags: [Users]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: { success: true, message: OK, data: { canDeletePermanently: false, history: { enrollments: 3, payments: 1 } } }
 *       404: { $ref: "#/components/responses/NotFound" }
 * /users/{id}/permanent:
 *   delete:
 *     summary: XÓA VĨNH VIỄN tài khoản chưa phát sinh dữ liệu nghiệp vụ (tài khoản có lịch sử ⇒ 409, hãy khóa)
 *     tags: [Users]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ id, email, fullName, deleted: true }" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: "USER_HAS_HISTORY (kèm history) / LAST_ACTIVE_MANAGER" }
 */
router.get("/:id/history", usersController.getUserHistory);
router.delete("/:id/permanent", usersController.deleteUserPermanently);

export default router;
