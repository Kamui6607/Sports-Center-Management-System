import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import * as notificationsController from "./notifications.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Manage user notifications
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get my notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [
 *             "MEMBER_REGISTERED", "CHAT_MESSAGE",
 *             "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_CANCELLED",
 *             "UPCOMING_CLASS", "SCHEDULE_CANCELLED", "SCHEDULE_UPDATED",
 *             "ENROLLMENT_CONFIRMED", "ENROLLMENT_CANCELLED",
 *             "TRAINING_PLAN_ASSIGNED", "NEW_CLASS", "COACH_CHANGED",
 *             "PAYMENT_SUCCESS", "PAYMENT_REFUNDED", "PAYMENT_FAILED"
 *           ]
 *         description: Filter by notification type
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Filter by read status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: A list of notifications
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/", authenticate, notificationsController.getMyNotifications);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get count of unread notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/unread-count", authenticate, notificationsController.getUnreadCount);

/**
 * @swagger
 * /notifications/mark-all-read:
 *   patch:
 *     summary: Mark all my notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch("/mark-all-read", authenticate, notificationsController.markAllRead);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a specific notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch("/:id/read", authenticate, notificationsController.markRead);

/**
 * @swagger
 * /notifications/trigger-upcoming-reminders:
 *   post:
 *     summary: Manually trigger upcoming class reminders (within 24h)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reminders triggered successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/trigger-upcoming-reminders",
  authenticate,
  authorize("MANAGER", "STAFF"),
  notificationsController.triggerUpcomingReminders
);

export default router;

