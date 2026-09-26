import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { UpdateMemberSchema, MemberQuerySchema } from "./members.schema.js";
import * as membersController from "./members.controller.js";

const router = Router();

/**
 * @swagger
 * /members:
 *   get:
 *     summary: List all members
 *     tags: [Members]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: trainingLevel
 *         schema: { type: string, enum: [BEGINNER, INTERMEDIATE, ADVANCED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { $ref: "#/components/responses/MemberListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate, authorize("MANAGER"),
  validate(MemberQuerySchema, "query"),
  membersController.listMembers
);

/**
 * @swagger
 * /members/{id}:
 *   get:
 *     summary: Get member by ID (userId or profileId)
 *     tags: [Members]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/MemberOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id",
  authenticate, authorize("MANAGER", "COACH"),
  membersController.getMemberById
);

/**
 * @swagger
 * /members/{id}:
 *   patch:
 *     summary: Update member info
 *     tags: [Members]
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
 *               fitnessGoal: { type: string }
 *               trainingLevel: { type: string, enum: [BEGINNER, INTERMEDIATE, ADVANCED] }
 *               trainingPreference: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/MemberOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authenticate, authorize("MANAGER"),
  validate(UpdateMemberSchema),
  membersController.updateMember
);

/**
 * @swagger
 * /members/{id}/courses:
 *   get:
 *     summary: Get member's owned courses + spending summary
 *     description: |
 *       Thay cho `GET /members/{id}/membership-status` cũ (Membership đã bị bỏ).
 *       Trả các khóa học member đang SỞ HỮU (`CoursePurchase` ACTIVE + còn hạn) kèm `daysRemaining`
 *       (`null` = khóa không giới hạn thời hạn), cùng `totalPurchases` / `totalSpent`.
 *     tags: [Members]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: memberProfile.id hoặc userId
 *     responses:
 *       200: { $ref: "#/components/responses/CoursePurchaseListOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id/courses",
  authenticate, authorize("MANAGER"),
  membersController.getCourseStatus
);

export default router;
