import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreateRoomSchema, UpdateRoomSchema, RoomQuerySchema } from "./rooms.schema.js";
import * as roomsController from "./rooms.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Rooms
 *   description: Manage training rooms
 */

/**
 * @swagger
 * /rooms:
 *   get:
 *     summary: Get list of rooms
 *     tags: [Rooms]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by room name
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
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
 *       200: { $ref: "#/components/responses/RoomListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate,
  validate(RoomQuerySchema, "query"),
  roomsController.listRooms
);

/**
 * @swagger
 * /rooms/{id}:
 *   get:
 *     summary: View room details
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/RoomOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/:id", authenticate, roomsController.getRoomById);

/**
 * @swagger
 * /rooms:
 *   post:
 *     summary: Create a new room
 *     tags: [Rooms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - capacity
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Yoga Room A"
 *               capacity:
 *                 type: integer
 *                 example: 20
 *               location:
 *                 type: string
 *                 example: "Floor 1"
 *     responses:
 *       201: { $ref: "#/components/responses/RoomCreated" }
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
  validate(CreateRoomSchema),
  roomsController.createRoom
);

/**
 * @swagger
 * /rooms/{id}:
 *   patch:
 *     summary: Update room info
 *     tags: [Rooms]
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
 *               capacity:
 *                 type: integer
 *               location:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200: { $ref: "#/components/responses/RoomOk" }
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
  validate(UpdateRoomSchema),
  roomsController.updateRoom
);

/**
 * @swagger
 * /rooms/{id}:
 *   delete:
 *     summary: Deactivate room (soft delete)
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { $ref: "#/components/responses/RoomOk" }
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
  roomsController.deleteRoom
);

export default router;
