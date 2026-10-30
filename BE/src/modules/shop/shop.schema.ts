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
  district: z.string().trim().max(100).nullable().optional(),
  ward: z.string().trim().max(100).nullable().optional(),
  /** Mã địa danh (GET /locations/...) để mở lại dropdown đúng mục đã chọn. */
  provinceCode: z.number().int().positive().nullable().optional(),
  wardCode: z.number().int().positive().nullable().optional(),
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
  /** SEPAY (mặc định): chuyển khoản trước. CASH: trả tiền khi nhận tại quầy — chỉ với PICKUP. */
  paymentMethod: z.enum(["SEPAY", "CASH"]).default("SEPAY"),
  /** PICKUP: ngày dự định đến lấy "YYYY-MM-DD" (giờ VN), trong [hôm nay, hôm nay + SHOP_PICKUP_MAX_DAYS_AHEAD]. Bỏ trống = hôm nay. */
  pickupDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày nhận hàng dạng YYYY-MM-DD").optional(),
  /** DELIVERY: địa chỉ trong sổ địa chỉ của chính người mua. */
  addressId: z.string().min(1).optional(),
  recipientName: z.string().trim().min(2).max(100).optional(),
  recipientPhone: phone.optional(),
  note: z.string().trim().max(500).optional(),
});

const cashOnlyPickup = (b: { fulfillmentType: string; paymentMethod?: string }) => b.paymentMethod !== "CASH" || b.fulfillmentType === "PICKUP";
const cashOnlyPickupError = { message: "Thanh toán tại quầy chỉ áp dụng khi nhận tại quầy", path: ["paymentMethod"] };

export const CheckoutPreviewSchema = CheckoutBase.refine((b) => b.mode !== "BUY_NOW" || (b.items?.length ?? 0) > 0, {
  message: "Mua ngay cần ít nhất 1 sản phẩm",
  path: ["items"],
}).refine(cashOnlyPickup, cashOnlyPickupError);
export type CheckoutInput = Omit<z.infer<typeof CheckoutBase>, "paymentMethod"> & {
  paymentMethod?: "SEPAY" | "CASH";
  expectedTotal?: number;
};

export const CheckoutSchema = CheckoutBase.extend({
  /** Tổng tiền khách ĐÃ XEM ở bước xem trước — server tự tính lại, lệch ⇒ 409 PRICE_CHANGED. */
  expectedTotal: z.number().int().min(0),
  /** Có thể gửi qua body thay cho header `Idempotency-Key`. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).refine((b) => b.mode !== "BUY_NOW" || (b.items?.length ?? 0) > 0, {
  message: "Mua ngay cần ít nhất 1 sản phẩm",
  path: ["items"],
}).refine(cashOnlyPickup, cashOnlyPickupError);

// ── Đơn của tôi ──────────────────────────────────────────────────────────────

export const OrderQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  /** Nhóm (PENDING|ACTIVE|COMPLETED|CLOSED) hoặc một trạng thái cụ thể. */
  status: z.string().trim().max(40).optional(),
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]).optional(),
  search: z.string().trim().max(100).optional(),
  /** Manager: hàng đợi xử lý — PICKUP_TODAY (khách hẹn lấy hôm nay), AWAITING_PICKUP (sẵn sàng, chờ khách — hạn gần nhất trước), LATE_PICKUP (quá hạn nhưng còn nhận trễ được), REFUND_PENDING (đang chờ hoàn), STALE_REFUND (chờ hoàn quá hạn). */
  queue: z.enum(["PICKUP_TODAY", "AWAITING_PICKUP", "LATE_PICKUP", "REFUND_PENDING", "STALE_REFUND"]).optional(),
  /** U4 (Manager): khoảng ngày tạo đơn, ISO có múi giờ. */
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export const CancelOrderSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const RequestRefundSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  /** Tên hoặc mã ngân hàng nhận tiền hoàn (VD: MBBank, VCB, Techcombank...). */
  bankName: z.string().trim().max(100).optional(),
  /** Số tài khoản ngân hàng nhận tiền hoàn. */
  bankAccountNumber: z.string().trim().max(50).optional(),
  /** Tên chủ tài khoản ngân hàng (không dấu hoặc có dấu). */
  bankAccountName: z.string().trim().max(100).optional(),
});

/** Đổi ngày / gia hạn lấy hàng tại quầy (giới hạn số lần + số ngày dời). */
export const ReschedulePickupSchema = z.object({
  pickupDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày nhận hàng dạng YYYY-MM-DD"),
});

/** Khách bổ sung / sửa số tài khoản nhận tiền hoàn của đơn (yêu cầu hoàn đang chờ). */
export const RefundBankSchema = z.object({
  bankName: z.string().trim().min(2).max(100),
  bankAccountNumber: z.string().trim().regex(/^[0-9 ]{6,30}$/, "Số tài khoản chỉ gồm chữ số"),
  bankAccountName: z.string().trim().min(2).max(100),
});

export const ReviewOrderItemSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  isAnonymous: z.boolean().optional(),
});

export const UpdateReviewOrderItemSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional(),
  isAnonymous: z.boolean().optional(),
});

// ── Manager ──────────────────────────────────────────────────────────────────

export const ManagerStatusSchema = z.object({
  status: z.enum(["CANCELLED", "READY_FOR_PICKUP", "PROCESSING", "SHIPPING", "DELIVERED", "COMPLETED", "NOT_PICKED_UP", "REFUND_REQUESTED"]),
  reason: z.string().trim().max(500).optional(),
  trackingCode: z.string().trim().min(3).max(100).optional(),
  carrier: z.string().trim().max(100).optional(),
});

export const PickupVerifySchema = z.object({ code: z.string().trim().min(6).max(200) });

export const PickupConfirmSchema = z
  .object({
    /** Mã nhận hàng / nội dung QR. Bỏ trống ⇒ giao không mã (bắt buộc `manualReason`). */
    code: z.string().trim().min(6).max(200).optional(),
    phoneLast4: z.string().trim().regex(/^\d{4}$/, "Nhập đúng 4 số cuối SĐT"),
    /** Đơn trả tại quầy: Manager xác nhận ĐÃ THU đủ tiền mặt (bắt buộc true với đơn CASH chưa thanh toán). */
    cashCollected: z.boolean().optional(),
    /** Khách không có mã: lý do + đã đối chiếu giấy tờ (ghi vào lịch sử đơn). */
    manualReason: z.string().trim().min(5).max(300).optional(),
  })
  .refine((b) => !!b.code || !!b.manualReason, { message: "Nhập mã nhận hàng hoặc lý do giao không mã", path: ["code"] });

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
