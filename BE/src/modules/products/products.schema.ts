import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(5),
  price: z.number().min(0),
  stockQuantity: z.number().int().min(0),
  isActive: z.boolean().default(true),
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
});
