import { Router, type Request } from "express";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { authenticateRestricted } from "../../middlewares/authenticateRestricted.js";
import { validate } from "../../middlewares/validate.js";
import { avatarUpload } from "../../middlewares/upload.js";
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "./auth.schema.js";
import * as authController from "./auth.controller.js";

// C1: chống dò mật khẩu / OTP — theo IP + email (và trần theo IP). Cần `trust proxy` (app.ts) để req.ip là IP thật sau proxy.
const byIpAndEmail = (req: Request) => `${req.ip}|${String(req.body?.email ?? "").trim().toLowerCase()}`;
const byIp = (req: Request) => req.ip ?? "anonymous";
const loginLimit = rateLimit({ name: "login", windowMs: 15 * 60_000, max: 10, key: byIpAndEmail });
const loginIpLimit = rateLimit({ name: "login-ip", windowMs: 15 * 60_000, max: 50, key: byIp });
const otpLimit = rateLimit({ name: "otp", windowMs: 15 * 60_000, max: 5, key: byIpAndEmail });
const refreshLimit = rateLimit({ name: "refresh", windowMs: 60_000, max: 30, key: byIp });

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new member account
 *     description: |
 *       Tạo tài khoản MEMBER + MemberProfile. **Backend tự động cấp kèm một MembershipSubscription ACTIVE
 *       với gói FREE** (`MembershipPlan.tier = FREE`, `maxConcurrentClasses = 0`) — idempotent, không tạo trùng
 *       nếu member đã có subscription ACTIVE. Vì vậy ngay sau khi đăng ký, `GET /enrollments/my/quota` trả
 *       `hasActiveSubscription = true`, `tier = "FREE"`, `limit = 0`, `used = 0`, `remaining = 0`.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email: { type: string, format: email, description: "Will be converted to lowercase" }
 *               password: { type: string, minLength: 6 }
 *               fullName: { type: string, maxLength: 100 }
 *               phone: { type: string, pattern: "^[0-9+]{9,15}$", description: "Optional, 9-15 digits, can start with +" }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               dateOfBirth: { type: string, format: date, description: "Must be in the past" }
 *     responses:
 *       201: { $ref: "#/components/responses/RegisterCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/register", validate(RegisterSchema), authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive access + refresh tokens
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/LoginOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/login", loginIpLimit, loginLimit, validate(LoginSchema), authController.login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/MessageOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/logout", authenticateRestricted, authController.logout);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Get a new access token using a refresh token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/RefreshOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/refresh-token", refreshLimit, validate(RefreshTokenSchema), authController.refreshToken);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset link (Token is returned in response for testing)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { $ref: "#/components/responses/MessageOk" }
 */
router.post("/forgot-password", otpLimit, validate(ForgotPasswordSchema), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   patch:
 *     summary: "Đặt lại mật khẩu: { token, newPassword } (liên kết Web) HOẶC { email, otp, newPassword } (mã 6 số — Mobile)"
 *     description: "Thành công ⇒ thu hồi mọi refresh token, ngắt socket và access token phát hành trước thời điểm đổi bị từ chối."
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               token: { type: string }
 *               email: { type: string, format: email }
 *               otp: { type: string, pattern: "^[0-9]{6}$" }
 *               newPassword: { type: string, minLength: 6 }
 *     responses:
 *       200: { $ref: "#/components/responses/MessageOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 */
router.patch("/reset-password", otpLimit, validate(ResetPasswordSchema), authController.resetPassword);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     responses:
 *       200: { $ref: "#/components/responses/ProfileOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/me", authenticateRestricted, authController.getMe);

/**
 * @swagger
 * /auth/me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string, maxLength: 100 }
 *               phone: { type: string, pattern: "^[0-9+]{9,15}$", description: "Optional, 9-15 digits, can start with +" }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               dateOfBirth: { type: string, format: date, description: "Must be in the past" }
 *               fitnessGoal: { type: string, description: "Ghi chú mục tiêu tự do" }
 *               fitnessGoals: { type: array, items: { type: string }, description: "Mã mục tiêu từ GET /classes/goal-options (tối đa 5)" }
 *               trainingLevel: { type: string, enum: [BEGINNER, INTERMEDIATE, ADVANCED] }
 *               trainingPreference: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/ProfileOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch("/me", authenticateRestricted, validate(UpdateProfileSchema), authController.updateMe);

/**
 * @swagger
 * /auth/me/avatar:
 *   post:
 *     summary: Upload avatar image for the current user profile
 *     description: |
 *       Upload ảnh đại diện (chọn từ file) dạng `multipart/form-data`, field name **avatar**.
 *       Chấp nhận jpeg / jpg / png / webp / gif, dung lượng tối đa **5MB**.
 *       Nơi lưu ảnh phụ thuộc env `AVATAR_STORAGE`:
 *       - `local` (mặc định khi chưa có credentials): lưu `uploads/avatars/`, phục vụ tĩnh qua `GET /uploads/avatars/<filename>`;
 *       - `cloudinary` (tự bật khi điền đủ `CLOUDINARY_*`): ảnh resize 512x512, nén q_auto/f_auto,
 *         lưu 1 asset/user nên thay ảnh mới GHI ĐÈ ảnh cũ (không sinh rác).
 *       URL được lưu vào `User.avatarUrl` và trả về trong `GET /auth/me`.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Image file (jpeg, jpg, png, webp, gif), max 5MB
 *     responses:
 *       200: { $ref: "#/components/responses/ProfileOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/me/avatar", authenticateRestricted, avatarUpload, authController.uploadAvatar);

/**
 * @swagger
 * /auth/me/change-password:
 *   patch:
 *     summary: Change current user password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 6 }
 *     responses:
 *       200: { $ref: "#/components/responses/MessageOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/me/change-password",
  authenticateRestricted,
  validate(ChangePasswordSchema),
  authController.changePassword
);

export default router;
