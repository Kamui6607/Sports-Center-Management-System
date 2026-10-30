import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { getCenter } from "../center/center.service.js";
import { readClassSnapshot, readMembershipSnapshot, type PartySnapshot } from "./purchase-snapshot.js";

/**
 * HÓA ĐƠN chuẩn của một giao dịch (Doc/BUSINESS_HARDENING_PLAN.md §4.1) — BE dựng, Mobile & Web chỉ hiển thị.
 * Mọi con số đọc từ `Payment.amount`, `OrderItem` và `Payment.purchaseSnapshot` (ảnh chụp lúc mua) ⇒ Manager đổi giá,
 * tên khóa/gói/sản phẩm hay thông tin trung tâm sau này KHÔNG làm đổi hóa đơn cũ.
 * Giao dịch cũ thiếu ảnh chụp người bán/người mua ⇒ dùng thông tin hiện tại (ghi chú `partyFromCurrent`).
 */

const METHOD_LABEL: Record<string, string> = {
  SEPAY: "Chuyển khoản VietQR (SePay)",
  BANK_TRANSFER: "Chuyển khoản ngân hàng",
  CASH: "Tiền mặt",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  SUCCESS: "Đã thanh toán",
  FAILED: "Đã hủy / hết hạn",
  REFUNDED: "Đã hoàn tiền",
};

export const REFUND_REASON_LABEL: Record<string, string> = {
  MEMBER_CANCEL_COURSE: "Hủy khóa trước khai giảng ≥ 3 ngày",
  MEMBER_CANCEL_COURSE_LATE: "Hoàn ngoại lệ khi hủy khóa muộn",
  MEMBER_CANCEL_SESSION: "Hủy 1 buổi trước ≥ 24h",
  SESSION_RESCHEDULED: "Hủy buổi bị HLV dời lịch",
  SESSION_CANCELLED: "Buổi học bị hủy (không dạy bù)",
  ORDER_CANCELLED: "Đơn hàng bị hủy",
  ORDER_NOT_PICKED_UP: "Không đến nhận hàng",
  ORDER_LATE_PAYMENT: "Tiền về sau khi đơn đã đóng",
  COURSE_NOT_FULFILLED: "Không ghi danh đủ buổi đã thanh toán",
  MEMBERSHIP_CANCELLED: "Trung tâm hủy gói thành viên",
};

const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: "Đang xử lý",
  COMPLETED: "Đã hoàn",
  REJECTED: "Bị từ chối",
  CANCELLED: "Đã hủy yêu cầu",
};

export interface InvoiceLine {
  no: number;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const money = (v: unknown) => Math.round(Number(v ?? 0));

/** Quyền xem: chủ giao dịch (hội viên của giao dịch / người đặt đơn) hoặc MANAGER. */
async function assertCanView(payment: { memberId: string | null; order: { userId: string } | null }, actor: { id: string; role: string }) {
  if (actor.role === "MANAGER") return;
  if (payment.order?.userId === actor.id) return;
  if (payment.memberId) {
    const member = await prisma.memberProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (member?.id === payment.memberId) return;
  }
  throw new AppError("Forbidden: You can only view your own invoice", 403);
}

export async function getInvoice(paymentId: string, actor: { id: string; role: string }) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      member: { select: { user: { select: { id: true, fullName: true, phone: true, email: true } } } },
      class: { select: { id: true, name: true } },
      order: {
        include: {
          items: { orderBy: { createdAt: "asc" } },
          user: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      },
      membership: { select: { id: true, startDate: true, endDate: true, plan: { select: { name: true, durationDays: true } } } },
      refunds: { orderBy: { createdAt: "asc" } },
      createdBy: { select: { fullName: true } },
    },
  });
  if (!payment) throw new AppError("Payment not found", 404);
  await assertCanView(payment, actor);

  const snap = (payment.purchaseSnapshot ?? {}) as PartySnapshot & { kind?: string };
  const classSnap = readClassSnapshot(payment.purchaseSnapshot);
  const planSnap = readMembershipSnapshot(payment.purchaseSnapshot);
  const kind = payment.orderId ? "ORDER" : payment.classId ? "CLASS" : planSnap || payment.membership ? "MEMBERSHIP" : "OTHER";

  const partyFromCurrent = !snap.seller || !snap.buyer;
  const center = snap.seller ? null : await getCenter();
  const seller = snap.seller ?? {
    name: center!.name,
    address: center!.address,
    hotline: center!.hotline,
    email: center!.email,
  };
  const buyerUser = payment.member?.user ?? payment.order?.user ?? null;
  const buyer = snap.buyer ?? (buyerUser ? { userId: buyerUser.id, fullName: buyerUser.fullName, phone: buyerUser.phone, email: buyerUser.email } : null);

  const total = money(payment.amount);
  let lines: InvoiceLine[] = [];
  let subtotal = total;
  let discount = 0;
  let discountLabel: string | null = null;
  let shippingFee = 0;
  let course: Record<string, unknown> | null = null;
  let membership: Record<string, unknown> | null = null;
  let order: Record<string, unknown> | null = null;

  if (kind === "ORDER" && payment.order) {
    const o = payment.order;
    lines = o.items.map((i, idx) => ({
      no: idx + 1,
      name: i.productName ?? "Sản phẩm",
      description: null,
      unit: "cái",
      quantity: i.quantity,
      unitPrice: money(i.unitPrice),
      amount: money(i.totalAmount),
    }));
    subtotal = money(o.subtotal);
    shippingFee = money(o.shippingFee);
    order = {
      id: o.id,
      code: o.code,
      status: o.status,
      fulfillmentType: o.fulfillmentType,
      recipientName: o.recipientName,
      recipientPhone: o.recipientPhone,
      shippingAddress: o.shippingAddress,
    };
  } else if (kind === "CLASS") {
    const name = classSnap?.name ?? payment.classNameSnapshot ?? payment.class?.name ?? "Khóa học";
    const pricing = classSnap?.pricing;
    const listPrice = pricing?.listPrice ?? total;
    lines = [
      {
        no: 1,
        name: `Khóa học: ${name}`,
        description: pricing ? `Trọn khóa ${pricing.totalSessions} buổi · đơn giá ${pricing.unitPrice.toLocaleString("vi-VN")}đ/buổi` : null,
        unit: "khóa",
        quantity: 1,
        unitPrice: listPrice,
        amount: listPrice,
      },
    ];
    subtotal = listPrice;
    discount = Math.max(0, listPrice - total);
    if (discount > 0 && pricing) {
      discountLabel = pricing.isLate
        ? `Đăng ký muộn: ${pricing.sessionsMissed} buổi đã diễn ra không tính phí (học ${pricing.sessionsPurchased}/${pricing.totalSessions} buổi)`
        : `Khóa còn ${pricing.sessionsPurchased}/${pricing.totalSessions} buổi`;
    }
    course = {
      classId: payment.classId,
      name,
      coachName: classSnap?.coach?.fullName ?? null,
      classType: classSnap?.classType ?? null,
      totalSessions: pricing?.totalSessions ?? classSnap?.totalSessions ?? null,
      sessionsPurchased: pricing?.sessionsPurchased ?? null,
      sessionsMissed: pricing?.sessionsMissed ?? 0,
      unitPrice: pricing?.unitPrice ?? null,
      isLate: pricing?.isLate ?? false,
      startDate: classSnap?.startDate ?? null,
      endDate: classSnap?.endDate ?? null,
    };
  } else if (kind === "MEMBERSHIP") {
    const name = planSnap?.name ?? payment.membership?.plan.name ?? "Gói thành viên";
    const days = planSnap?.durationDays ?? payment.membership?.plan.durationDays ?? null;
    lines = [
      {
        no: 1,
        name: `Gói thành viên: ${name}`,
        description: days ? `Hiệu lực ${days} ngày` : null,
        unit: "gói",
        quantity: 1,
        unitPrice: total,
        amount: total,
      },
    ];
    membership = {
      id: payment.membership?.id ?? null,
      planName: name,
      durationDays: days,
      startDate: payment.membership?.startDate ?? null,
      endDate: payment.membership?.endDate ?? null,
    };
  } else {
    lines = [{ no: 1, name: payment.note ?? "Giao dịch", description: null, unit: "lần", quantity: 1, unitPrice: total, amount: total }];
  }

  const paid = payment.status === "SUCCESS" || payment.status === "REFUNDED";
  const refunds = payment.refunds.map((r) => ({
    id: r.id,
    reason: r.reason,
    reasonLabel: REFUND_REASON_LABEL[r.reason] ?? r.reason,
    amount: money(r.amount),
    grossAmount: r.grossAmount === null ? null : money(r.grossAmount),
    feePercent: r.feePercent,
    status: r.status,
    statusLabel: REFUND_STATUS_LABEL[r.status] ?? r.status,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
  }));
  const refundedAmount = refunds.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount, 0);
  const pendingRefundAmount = refunds.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);

  return {
    id: payment.id,
    invoiceNumber: payment.order?.code ?? payment.transactionCode ?? payment.id.slice(0, 8).toUpperCase(),
    kind,
    status: payment.status,
    statusLabel: STATUS_LABEL[payment.status] ?? payment.status,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
    method: payment.method,
    methodLabel: METHOD_LABEL[payment.method] ?? payment.method,
    transactionCode: payment.transactionCode,
    gatewayTransId: payment.gatewayTransId,
    recordedBy: payment.createdBy?.fullName ?? null,
    seller,
    buyer,
    partyFromCurrent,
    lines,
    subtotal,
    discount,
    discountLabel,
    shippingFee,
    /** Tổng thanh toán = tạm tính − giảm + phí giao hàng (= số tiền của giao dịch). */
    total,
    paidAmount: paid ? total : 0,
    refunds,
    refundedAmount,
    pendingRefundAmount,
    /** Thực trả sau hoàn = đã thanh toán − đã hoàn. */
    netAmount: Math.max(0, (paid ? total : 0) - refundedAmount),
    course,
    membership,
    order,
    note: "Giá, tên mặt hàng và thông tin người bán/người mua được chốt tại thời điểm mua.",
  };
}
