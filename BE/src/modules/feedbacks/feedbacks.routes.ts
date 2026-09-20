import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreateFeedbackSchema, FeedbackQuerySchema } from "./feedbacks.schema.js";
import * as controller from "./feedbacks.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Feedbacks
 *   description: Member đánh giá Coach sau khi học
 */

/**
 * @swagger
 * /feedbacks:
 *   post:
 *     summary: Member gửi đánh giá cho HLV
 *     description: |
 *       **Business Rules:**
 *       - Chỉ Member đã từng `BOOKED` hoặc `COMPLETED` ít nhất 1 buổi học cùng HLV mới được đánh giá.
 *       - Mỗi cặp (member + coach + class) chỉ có **1 feedback** — gửi lại sẽ cập nhật feedback cũ.
 *       - `isAnonymous: true` → tên member sẽ được ẩn khi hiển thị công khai.
 *     tags: [Feedbacks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [coachId, rating]
 *             properties:
 *               coachId:
 *                 type: string
 *                 format: uuid
 *                 description: CoachProfile ID
 *               classId:
 *                 type: string
 *                 format: uuid
 *                 description: Lớp học liên quan (tuỳ chọn)
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Số sao đánh giá (1–5)
 *                 example: 5
 *               comment:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Nhận xét chi tiết
 *                 example: "HLV rất nhiệt tình, hướng dẫn chi tiết và dễ hiểu!"
 *               isAnonymous:
 *                 type: boolean
 *                 default: false
 *                 description: Ẩn tên khi hiển thị công khai
 *     responses:
 *       201:
 *         description: Gửi đánh giá thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               message: "Cảm ơn bạn đã gửi đánh giá!"
 *               data:
 *                 id: "fb-uuid"
 *                 coachId: "coach-uuid"
 *                 rating: 5
 *                 comment: "HLV rất nhiệt tình!"
 *                 isAnonymous: false
 *                 coach: { user: { fullName: "Nguyễn Văn A" } }
 *                 class: { name: "Morning Yoga" }
 *       403:
 *         description: Member chưa từng học với HLV này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: false
 *               message: "Bạn chỉ có thể đánh giá HLV mà bạn đã hoặc đang học cùng."
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post("/", authenticate, authorize("MEMBER"), validate(CreateFeedbackSchema), controller.createFeedback);

/**
 * @swagger
 * /feedbacks:
 *   get:
 *     summary: Xem danh sách đánh giá của một HLV (public)
 *     description: |
 *       Trả về danh sách feedback và điểm trung bình (averageRating) của HLV.
 *       Các feedback có `isAnonymous: true` sẽ hiển thị tên là **"Ẩn danh"**.
 *     tags: [Feedbacks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: coachId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: CoachProfile ID cần xem đánh giá
 *       - in: query
 *         name: classId
 *         schema: { type: string, format: uuid }
 *         description: Lọc theo lớp học cụ thể (tuỳ chọn)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Danh sách feedbacks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               data:
 *                 feedbacks:
 *                   - id: "fb-uuid-1"
 *                     rating: 5
 *                     comment: "Rất tuyệt vời!"
 *                     isAnonymous: false
 *                     member: { user: { fullName: "Trần Thị B" } }
 *                     coach: { user: { fullName: "Nguyễn Văn A" } }
 *                     class: { name: "Morning Yoga" }
 *                   - id: "fb-uuid-2"
 *                     rating: 4
 *                     comment: "Tốt"
 *                     isAnonymous: true
 *                     member: { user: { fullName: "Ẩn danh" } }
 *                 summary:
 *                   averageRating: 4.5
 *                   totalFeedbacks: 12
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/", authenticate, validate(FeedbackQuerySchema, "query"), controller.listFeedbacksForCoach);

/**
 * @swagger
 * /feedbacks/my:
 *   get:
 *     summary: Member xem danh sách feedback mình đã gửi
 *     tags: [Feedbacks]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách feedback của member
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               data:
 *                 - id: "fb-uuid"
 *                   rating: 5
 *                   comment: "HLV rất tốt!"
 *                   coach: { user: { fullName: "Nguyễn Văn A" } }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/my", authenticate, authorize("MEMBER"), controller.getMyFeedbacks);

/**
 * @swagger
 * /feedbacks/{id}:
 *   delete:
 *     summary: Member xóa feedback của mình
 *     tags: [Feedbacks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Feedback ID
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               data: { message: "Feedback đã được xóa thành công." }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete("/:id", authenticate, authorize("MEMBER"), controller.deleteFeedback);

/**
 * @swagger
 * /feedbacks/{id}/manager:
 *   delete:
 *     summary: Manager xóa feedback vi phạm
 *     tags: [Feedbacks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Feedback ID
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               data: { message: "Feedback đã được xóa bởi quản lý." }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.delete("/:id/manager", authenticate, authorize("MANAGER"), controller.deleteFeedbackByManager);

export default router;
