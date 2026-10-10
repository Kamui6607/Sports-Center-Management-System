import { Prisma, type OrderStatus } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { enqueueNotification } from "../notifications/outbox.service.js";

type Tx = Prisma.TransactionClient;

/**
 * Máy trạng thái đơn hàng (Doc/SHOP_FLOW_DESIGN.md §3) — MỌI chuyển hợp lệ của hệ thống.
 * Ai được kích hoạt chuyển nào do service kiểm tra thêm (`MANAGER_TRANSITIONS`, endpoint của khách…).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "EXPIRED", "CANCELLED"],
  PAID: ["READY_FOR_PICKUP", "PROCESSING", "REFUND_REQUESTED"],
  PROCESSING: ["SHIPPING", "REFUND_REQUESTED"],
  READY_FOR_PICKUP: ["COMPLETED", "NOT_PICKED_UP", "REFUND_REQUESTED"],
  SHIPPING: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
  NOT_PICKED_UP: ["REFUNDED"],
  // Từ chối hoàn tiền ⇒ quay về trạng thái ngay trước REFUND_REQUESTED.
  REFUND_REQUESTED: ["REFUNDED", "PAID", "PROCESSING", "READY_FOR_PICKUP"],
  REFUNDED: [],
};

/** Chuyển Manager được bấm trực tiếp qua `POST /shop/manage/orders/:id/status` (theo hình thức nhận). */
export const MANAGER_TRANSITIONS: Record<"PICKUP" | "DELIVERY", Partial<Record<OrderStatus, OrderStatus[]>>> = {
  PICKUP: {
    PENDING_PAYMENT: ["CANCELLED"],
    PAID: ["READY_FOR_PICKUP", "REFUND_REQUESTED"],
    READY_FOR_PICKUP: ["NOT_PICKED_UP", "REFUND_REQUESTED"],
  },
  DELIVERY: {
    PENDING_PAYMENT: ["CANCELLED"],
    PAID: ["PROCESSING", "REFUND_REQUESTED"],
    PROCESSING: ["SHIPPING", "REFUND_REQUESTED"],
    SHIPPING: ["DELIVERED"],
    DELIVERED: ["COMPLETED"],
  },
};

/** Cột mốc thời gian ghi khi vào trạng thái. */
const TIMESTAMP: Partial<Record<OrderStatus, keyof Prisma.OrderUncheckedUpdateManyInput>> = {
  PAID: "paidAt",
  PROCESSING: "processingAt",
  READY_FOR_PICKUP: "readyAt",
  SHIPPING: "shippedAt",
  DELIVERED: "deliveredAt",
  COMPLETED: "completedAt",
  CANCELLED: "cancelledAt",
  EXPIRED: "expiredAt",
  NOT_PICKED_UP: "notPickedUpAt",
  REFUNDED: "refundedAt",
};

/** Nhãn tiếng Việt của trạng thái (thông báo, lỗi). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  PROCESSING: "Đang chuẩn bị hàng",
  READY_FOR_PICKUP: "Sẵn sàng nhận tại quầy",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn tất",
  EXPIRED: "Hết hạn thanh toán",
  CANCELLED: "Đã hủy",
  NOT_PICKED_UP: "Quá hạn nhận hàng",
  REFUND_REQUESTED: "Chờ hoàn tiền",
  REFUNDED: "Đã hoàn tiền",
};

function defaultNotice(code: string, to: OrderStatus): { title: string; body: string } {
  const body: Record<OrderStatus, string> = {
    PENDING_PAYMENT: `Đơn ${code} đã được tạo, vui lòng chuyển khoản trong thời hạn giữ hàng.`,
    PAID: `Đơn ${code} đã được thanh toán. Trung tâm sẽ chuẩn bị hàng cho bạn.`,
    PROCESSING: `Đơn ${code} đang được chuẩn bị để giao.`,
    READY_FOR_PICKUP: `Đơn ${code} đã sẵn sàng. Mang mã nhận hàng tới quầy để nhận.`,
    SHIPPING: `Đơn ${code} đang được giao tới bạn.`,
    DELIVERED: `Đơn ${code} đã được giao. Bấm "Đã nhận hàng" để hoàn tất.`,
    COMPLETED: `Đơn ${code} đã hoàn tất. Hãy đánh giá sản phẩm bạn đã mua nhé!`,
    EXPIRED: `Đơn ${code} đã hết hạn thanh toán, hàng giữ cho bạn đã được nhả.`,
    CANCELLED: `Đơn ${code} đã bị hủy.`,
    NOT_PICKED_UP: `Đơn ${code} đã quá hạn nhận hàng tại quầy.`,
    REFUND_REQUESTED: `Đơn ${code} đang chờ Quản lý duyệt hoàn tiền.`,
    REFUNDED: `Đơn ${code} đã được hoàn tiền.`,
  };
  return { title: `Đơn hàng ${code}: ${ORDER_STATUS_LABEL[to]}`, body: body[to] };
}

export interface TransitionOptions {
  actorId?: string | null;
  reason?: string | null;
  /** Field cập nhật thêm cùng lúc (trackingCode, cancelReason…). */
  data?: Prisma.OrderUncheckedUpdateManyInput;
  /** false ⇒ không gửi thông báo; object ⇒ ghi đè tiêu đề/nội dung. */
  notify?: false | { title?: string; body?: string };
}

/**
 * Chuyển trạng thái đơn (trong transaction): kiểm tra bảng chuyển hợp lệ → CAS
 * `UPDATE … WHERE id AND status = from` (hai thao tác đồng thời: chỉ một thắng, kẻ thua nhận 409) →
 * ghi `OrderStatusHistory` → outbox thông báo cho người mua (caller flush sau commit).
 */
export async function transitionOrderTx(
  tx: Tx,
  order: { id: string; code: string; userId: string; status: OrderStatus },
  to: OrderStatus,
  opts: TransitionOptions = {}
): Promise<void> {
  const from = order.status;
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      `Không thể chuyển đơn từ "${ORDER_STATUS_LABEL[from]}" sang "${ORDER_STATUS_LABEL[to]}".`,
      409,
      { code: "ORDER_INVALID_TRANSITION", from, to }
    );
  }
  const now = new Date();
  const stamp = TIMESTAMP[to];
  const updated = await tx.order.updateMany({
    where: { id: order.id, status: from },
    data: { ...(opts.data ?? {}), status: to, ...(stamp ? { [stamp]: now } : {}) },
  });
  if (updated.count === 0) {
    throw new AppError("Đơn hàng vừa được cập nhật bởi thao tác khác, vui lòng tải lại.", 409, {
      code: "ORDER_STATE_CHANGED",
    });
  }
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: from, toStatus: to, actorId: opts.actorId ?? null, reason: opts.reason ?? null },
  });
  if (opts.notify !== false) {
    const notice = { ...defaultNotice(order.code, to), ...(opts.notify ?? {}) };
    await enqueueNotification(tx, {
      userId: order.userId,
      type: "ORDER_UPDATED",
      title: notice.title,
      body: notice.body,
      reason: opts.reason ?? undefined,
      metadata: { orderId: order.id, orderCode: order.code, status: to, fromStatus: from },
    });
  }
  order.status = to;
}
