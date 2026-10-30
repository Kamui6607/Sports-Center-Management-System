const numberCoerce = z.preprocess((val) => {
  if (typeof val === "string" && val.trim() !== "") {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }
  return val;
}, z.number());

const booleanCoerce = z.preprocess((val) => {
  if (typeof val === "string") {
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
  }
  return val;
}, z.boolean());

const imageUrlsCoerce = z.preprocess((val) => {
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return val;
}, z.array(z.string().trim().url().max(500)).max(10));

import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(5),
  price: numberCoerce.pipe(z.number().min(0)),
  stockQuantity: numberCoerce.pipe(z.number().int().min(0)),
  isActive: booleanCoerce.pipe(z.boolean()).default(true),
  /** BE-6: ảnh sản phẩm (URL http/https). */
  imageUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  /** Bộ ảnh phụ. */
  imageUrls: imageUrlsCoerce.optional(),
  /** Giới hạn chống gom hàng: tối đa mỗi đơn / mỗi người mỗi ngày. */
  maxPerOrder: numberCoerce.pipe(z.number().int().min(1).max(999)).optional(),
  maxPerDay: numberCoerce.pipe(z.number().int().min(1).max(9999)).optional(),
  /** Ngưỡng cảnh báo sắp hết hàng. */
  lowStockThreshold: numberCoerce.pipe(z.number().int().min(0).max(100000)).optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const ProductQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  isActive: z.enum(["true", "false", "all"]).optional(),
});

export const OrderItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

/** Một đơn có thể mua nhiều sản phẩm: `items` ít nhất 1 dòng (cùng sản phẩm xuất hiện nhiều lần sẽ được cộng dồn). */
export const CreateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1).max(50),
});

export const CreateProductReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  /** Dòng đơn COMPLETED cần đánh giá (bỏ trống ⇒ tự chọn dòng cũ nhất chưa đánh giá). */
  orderItemId: z.string().min(1).optional(),
});
