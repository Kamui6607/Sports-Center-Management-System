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
  authenticate, authorize("MANAGER", "STAFF"),
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
  authenticate, authorize("MANAGER", "STAFF", "COACH"),
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
  authenticate, authorize("MANAGER", "STAFF"),
  validate(UpdateMemberSchema),
  membersController.updateMember
);

/**
 * @swagger
 * /members/{id}/membership-status:
 *   get:
 *     summary: Get member effective tier and active subscription
 *     tags: [Members]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/MembershipStatusOk" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id/membership-status",
  authenticate, authorize("MANAGER", "STAFF"),
  membersController.getMembershipStatus
);

export default router;
