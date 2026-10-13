import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import * as controller from "./locations.controller.js";
import { AppError } from "../../middlewares/errorHandler.js";

const router = Router();
router.use(authenticate, rateLimit({ name: "locations", windowMs: 60_000, max: 120 }));

// Mã địa danh phải là số nguyên dương — chặn chèn đường dẫn vào URL gọi nguồn dữ liệu.
router.param("code", (_req, _res, next, value) => {
  if (!/^\d{1,6}$/.test(String(value))) return next(new AppError("Mã địa danh không hợp lệ", 400));
  next();
});

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: Danh mục Tỉnh/Thành, Quận/Huyện, Phường/Xã cho dropdown địa chỉ
 */

/**
 * @swagger
 * /locations/provinces:
 *   get:
 *     summary: Danh sách Tỉnh/Thành (địa giới 2 cấp, kèm `deliverable` = trong khu vực giao hàng)
 *     description: Dùng `name` của mục được chọn làm `province` khi gọi `POST /shop/addresses` (khớp kiểm tra khu vực giao).
 *     tags: [Locations]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ code, name, deliverable }]" }
 *       503: { description: Nguồn danh mục tạm thời không khả dụng (LOCATIONS_UNAVAILABLE) }
 * /locations/provinces/{code}/wards:
 *   get:
 *     summary: Phường/Xã của một Tỉnh/Thành (cấp 2)
 *     tags: [Locations]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: integer }, description: "code từ /locations/provinces" }
 *     responses:
 *       200: { description: "[{ code, name }]" }
 *       404: { description: Không thấy mã }
 * /locations/provinces/{code}/districts:
 *   get:
 *     summary: Quận/Huyện (TÙY CHỌN, cấp cũ) của Tỉnh/Thành
 *     description: Gợi ý theo địa giới cũ; có thể trả `[]` nếu tỉnh đã sáp nhập không khớp. `district` khi tạo địa chỉ không bắt buộc.
 *     tags: [Locations]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "[{ code, name }] hoặc []" }
 *       404: { description: Không thấy mã }
 */
router.get("/provinces", controller.listProvinces);
router.get("/provinces/:code/districts", controller.listDistricts);
router.get("/provinces/:code/wards", controller.listWards);

export default router;
