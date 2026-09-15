import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreateSportSchema, UpdateSportSchema, SportQuerySchema } from "./sports.schema.js";
import * as sportsController from "./sports.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Sports
 *   description: Manage sports disciplines
 */

/**
 * @swagger
 * /sports:
 *   get:
 *     summary: Get list of sports
 *     tags: [Sports]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Filter by active status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200: { $ref: "#/components/responses/SportListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/", validate(SportQuerySchema, "query"), sportsController.listSports);

/**
 * @swagger
 * /sports/{id}:
 *   get:
 *     summary: View sport details
 *     tags: [Sports]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/SportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", sportsController.getSportById);

/**
 * @swagger
 * /sports:
 *   post:
 *     summary: Create a new sport
 *     tags: [Sports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Yoga"
 *               description:
 *                 type: string
 *                 example: "Yoga class improves flexibility"
 *     responses:
 *       201: { $ref: "#/components/responses/SportCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreateSportSchema),
  sportsController.createSport
);

/**
 * @swagger
 * /sports/{id}:
 *   patch:
 *     summary: Update sport
 *     tags: [Sports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200: { $ref: "#/components/responses/SportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  validate(UpdateSportSchema),
  sportsController.updateSport
);

/**
 * @swagger
 * /sports/{id}:
 *   delete:
 *     summary: Deactivate sport (soft delete)
 *     tags: [Sports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/SportOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete(
  "/:id",
  authenticate,
  authorize("MANAGER"),
  sportsController.deleteSport
);

export default router;
