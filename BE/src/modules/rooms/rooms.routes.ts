import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreateRoomSchema, UpdateRoomSchema, RoomQuerySchema, RoomIdSchema, TransferSchedulesSchema } from "./rooms.schema.js";
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
 *         name: areaType
 *         schema:
 *           type: string
 *           enum: [POOL, INDOOR, OUTDOOR]
 *         description: Filter by area type (POOL | INDOOR | OUTDOOR)
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
 *               - areaType
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
 *               areaType:
 *                 type: string
 *                 enum: [POOL, INDOOR, OUTDOOR]
 *                 example: "INDOOR"
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
 *               areaType:
 *                 type: string
 *                 enum: [POOL, INDOOR, OUTDOOR]
 *                 description: "New area type. Upcoming schedules must use a matching Class."
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

/**
 * @swagger
 * /rooms/{roomId}/transfer-schedules/preview:
 *   post:
 *     summary: Preview bulk transfer of upcoming schedules to another room (no DB changes)
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *         description: Source room (damaged room)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetRoomId]
 *             properties:
 *               targetRoomId: { type: string, description: "Target room ID" }
 *               from: { type: string, format: date-time, description: "Optional lower bound (default now)" }
 *               to: { type: string, format: date-time, description: "Optional upper bound" }
 *               reason: { type: string, maxLength: 500, description: "Transfer reason, e.g. Room damaged" }
 *     responses:
 *       200: { description: "Preview with totalSchedules/validSchedules/invalidSchedules/canTransfer/conflicts" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:roomId/transfer-schedules/preview",
  authenticate,
  authorize("MANAGER", "STAFF"),
  validate(RoomIdSchema, "params"),
  validate(TransferSchedulesSchema),
  roomsController.previewTransferSchedules
);

/**
 * @swagger
 * /rooms/{roomId}/transfer-schedules:
 *   post:
 *     summary: Bulk transfer upcoming SCHEDULED schedules to another room (atomic, all-or-nothing)
 *     description: "Validates areaType/capacity/room+coach conflicts per schedule, re-checks inside a Prisma transaction, then notifies enrolled members with SCHEDULE_ROOM_CHANGED."
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *         description: Source room (damaged room)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetRoomId]
 *             properties:
 *               targetRoomId: { type: string, description: "Target room ID" }
 *               from: { type: string, format: date-time, description: "Optional lower bound (default now)" }
 *               to: { type: string, format: date-time, description: "Optional upper bound" }
 *               reason: { type: string, maxLength: 500, description: "Transfer reason, e.g. Room damaged" }
 *     responses:
 *       200: { description: "Transferred with sourceRoom/targetRoom/transferredCount/schedules" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:roomId/transfer-schedules",
  authenticate,
  authorize("MANAGER", "STAFF"),
  validate(RoomIdSchema, "params"),
  validate(TransferSchedulesSchema),
  roomsController.transferSchedules
);

export default router;
