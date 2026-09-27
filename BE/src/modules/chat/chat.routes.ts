import { Router } from "express";
import { getMessages, sendMessage, markAsRead, getUnreadCount, getConversations, getContacts, downloadAttachment } from "./chat.controller.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { chatUploadSingle } from "../../middlewares/upload.js";

const router = Router();

// Allow all authenticated users (Member, Coach, Staff, Manager) to use chat APIs
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Real-time messaging and chat history (Manager & Staff)
 */

/**
 * @swagger
 * /chat/contacts:
 *   get:
 *     summary: Get eligible chat contacts
 *     description: Retrieves a list of users the current user is allowed to chat with based on their role.
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: Contacts retrieved successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 * */
router.get("/contacts", getContacts);

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: Get list of conversations
 *     description: Retrieves a list of users the current user has chatted with, along with the latest message and unread count per user.
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/conversations", getConversations);

/**
 * @swagger
 * /chat/messages:
 *   get:
 *     summary: Get chat messages
 *     description: Fetches message history with a specific target user, or the global chat room if targetId is omitted.
 *     tags: [Chat]
 *     parameters:
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: Optional ID of the user to get private messages with
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/messages", getMessages);

/**
 * @swagger
 * /chat/messages:
 *   post:
 *     summary: Send a message
 *     description: Send a text message, an image/file, or both. If sending a file, it must be sent as multipart/form-data.
 *     tags: [Chat]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: ID of the receiver for 1-1 chat. If omitted, it sends to the global chat.
 *               content:
 *                 type: string
 *                 description: Text content of the message
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File or image to upload
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/messages", chatUploadSingle("file"), sendMessage);

/**
 * @swagger
 * /chat/attachments/{id}:
 *   get:
 *     summary: Tải file đính kèm của tin nhắn (yêu cầu đăng nhập + phân quyền)
 *     description: |
 *       D03 — file chat KHÔNG còn phục vụ tĩnh công khai. Quyền tải:
 *       - chủ file (người gửi), người nhận, hoặc MANAGER;
 *       - tin nhắn PHÒNG CHUNG (`receiverId = null`) → mọi user đã đăng nhập.
 *       Sai quyền ⇒ 403; không tồn tại ⇒ 404. Response `Content-Type` theo MIME đã xác thực
 *       lúc upload + `X-Content-Type-Options: nosniff`.
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: File stream }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/attachments/:id", downloadAttachment);

/**
 * @swagger
 * /chat/messages/read:
 *   patch:
 *     summary: Mark messages as read
 *     description: Marks all unread messages from a specific sender as read in bulk.
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetId:
 *                 type: string
 *                 description: ID of the sender whose messages are being read
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.patch("/messages/read", markAsRead);

/**
 * @swagger
 * /chat/messages/unread-count:
 *   get:
 *     summary: Get global unread message count
 *     description: Returns the total number of unread messages across all conversations for the current user.
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/messages/unread-count", getUnreadCount);

export default router;
