import { z } from "zod";

const quantity = z.number().int().min(1).max(999);
const phone = z
  .string()
  .trim()
  .regex(/^(\+?84|0)\d{9,10}$/, "Số điện thoại không hợp lệ");

// ── Giỏ hàng ─────────────────────────────────────────────────────────────────

export const AddCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: quantity.default(1),
});

export const UpdateCartItemSchema = z.object({ quantity });

// ── Sổ địa chỉ ───────────────────────────────────────────────────────────────

export const AddressSchema = z.object({
  recipientName: z.string().trim().min(2).max(100),
  phone,
  province: z.string().trim().min(2).max(100),
  district: z.string().trim().min(2).max(100),
  ward: z.string().trim().max(100).nullable().optional(),
  street: z.string().trim().min(3).max(255),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof AddressSchema>;

export const UpdateAddressSchema = AddressSchema.partial();

// ── Checkout ─────────────────────────────────────────────────────────────────

const CheckoutBase = z.object({
  /** CART: đặt các dòng trong giỏ (`productIds` để chọn dòng, bỏ trống = cả giỏ). BUY_NOW: `items` (không đụng giỏ). */
  mode: z.enum(["CART", "BUY_NOW"]),
  productIds: z.array(z.string().min(1)).max(50).optional(),
  items: z
    .array(z.object({ productId: z.string().min(1), quantity }))
    .min(1)
    .max(50)
    .optional(),
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
  /** DELIVERY: địa chỉ trong sổ địa chỉ của chính người mua. */
  addressId: z.string().min(1).optional(),
  recipientName: z.string().trim().min(2).max(100).optional(),
  recipientPhone: phone.optional(),
  note: z.string().trim().max(500).optional(),
});

export const CheckoutPreviewSchema = CheckoutBase.refine((b) => b.mode !== "BUY_NOW" || (b.items?.length ?? 0) > 0, {
  message: "Mua ngay cần ít nhất 1 sản phẩm",
  path: ["items"],
});
export type CheckoutInput = z.infer<typeof CheckoutBase> & { expectedTotal?: number };

export const CheckoutSchema = CheckoutBase.extend({
  /** Tổng tiền khách ĐÃ XEM ở bước xem trước — server tự tính lại, lệch ⇒ 409 PRICE_CHANGED. */
  expectedTotal: z.number().int().min(0),
  /** Có thể gửi qua body thay cho header `Idempotency-Key`. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).refine((b) => b.mode !== "BUY_NOW" || (b.items?.length ?? 0) > 0, {
  message: "Mua ngay cần ít nhất 1 sản phẩm",
  path: ["items"],
});

// ── Đơn của tôi ──────────────────────────────────────────────────────────────

export const OrderQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  /** Nhóm (PENDING|ACTIVE|COMPLETED|CLOSED) hoặc một trạng thái cụ thể. */
  status: z.string().trim().max(40).optional(),
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export const CancelOrderSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const RequestRefundSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const ReviewOrderItemSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

// ── Manager ──────────────────────────────────────────────────────────────────

export const ManagerStatusSchema = z.object({
  status: z.enum(["CANCELLED", "READY_FOR_PICKUP", "PROCESSING", "SHIPPING", "DELIVERED", "COMPLETED", "NOT_PICKED_UP", "REFUND_REQUESTED"]),
  reason: z.string().trim().max(500).optional(),
  trackingCode: z.string().trim().min(3).max(100).optional(),
  carrier: z.string().trim().max(100).optional(),
});

export const PickupVerifySchema = z.object({ code: z.string().trim().min(6).max(200) });

export const PickupConfirmSchema = z.object({
  code: z.string().trim().min(6).max(200),
  phoneLast4: z.string().trim().regex(/^\d{4}$/, "Nhập đúng 4 số cuối SĐT"),
});

export const InventoryQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
});

export const InventoryChangeSchema = z
  .object({
    type: z.enum(["IN", "ADJUST"]),
    /** IN: số dương; ADJUST: delta có dấu (âm = giảm do hư hỏng/kiểm kê). */
    quantity: z.number().int().min(-100_000).max(100_000),
    note: z.string().trim().min(3).max(500),
  })
  .refine((b) => (b.type === "IN" ? b.quantity > 0 : b.quantity !== 0), {
    message: "Số lượng không hợp lệ",
    path: ["quantity"],
  });

export const ReviewQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  productId: z.string().optional(),
  hidden: z.enum(["true", "false"]).optional(),
});

export const ReviewVisibilitySchema = z.object({
  isHidden: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
