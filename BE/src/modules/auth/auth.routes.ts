import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { validate } from "../../middlewares/validate.js";
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
} from "./auth.schema.js";
import * as authController from "./auth.controller.js";

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
router.post("/login", validate(LoginSchema), authController.login);

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
router.post("/logout", authenticate, authController.logout);

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
router.post("/refresh-token", validate(RefreshTokenSchema), authController.refreshToken);

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
router.get("/me", authenticate, authController.getMe);

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
 *               fitnessGoal: { type: string }
 *               trainingLevel: { type: string, enum: [BEGINNER, INTERMEDIATE, ADVANCED] }
 *               trainingPreference: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/ProfileOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch("/me", authenticate, validate(UpdateProfileSchema), authController.updateMe);

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
  authenticate,
  validate(ChangePasswordSchema),
  authController.changePassword
);

export default router;
