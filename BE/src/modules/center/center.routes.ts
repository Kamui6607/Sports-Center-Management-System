import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { UpdateCenterSchema } from "./center.schema.js";
import * as controller from "./center.controller.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Center
 *   description: Thông tin trung tâm Gym (địa chỉ, giờ mở cửa, hotline) — để hội viên/HLV biết nơi tập
 */

/**
 * @swagger
 * /center:
 *   get:
 *     summary: Thông tin trung tâm (công khai)
 *     description: "Trả `mapLink` = `mapUrl` hoặc link tìm địa chỉ trên Google Maps."
 *     tags: [Center]
 *     security: []
 *     responses:
 *       200: { description: "{ id, name, address, mapUrl, mapLink, hotline, email, openingHours, parkingNote, description }" }
 *   put:
 *     summary: MANAGER cập nhật thông tin trung tâm
 *     tags: [Center]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, address]
 *             properties:
 *               name: { type: string, example: "Pulse Gym Center" }
 *               address: { type: string, example: "123 Nguyễn Văn Linh, Phường Tân Phong, TP. Hồ Chí Minh" }
 *               mapUrl: { type: string, example: "https://maps.app.goo.gl/abc" }
 *               hotline: { type: string, example: "0909123456" }
 *               email: { type: string, example: "lienhe@pulsegym.vn" }
 *               openingHours: { type: string, example: "05:30 – 22:00 hằng ngày" }
 *               parkingNote: { type: string, example: "Gửi xe máy miễn phí tại tầng hầm B1" }
 *               description: { type: string }
 *     responses:
 *       200: { description: Đã cập nhật }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/", controller.getCenter);
router.put("/", authenticate, authorize("MANAGER"), validate(UpdateCenterSchema), controller.updateCenter);

export default router;
