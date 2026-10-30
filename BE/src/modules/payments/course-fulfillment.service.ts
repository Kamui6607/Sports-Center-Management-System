import type { Payment, Prisma } from "@prisma/client";
import { enqueueNotification } from "../notifications/outbox.service.js";
import { createCourseShortfallRefundTx } from "../refunds/refunds.service.js";
import { creditCoachWallet } from "./payments.service.js";
import { enrollPaidCourse, type CourseFulfillment } from "./course-purchase.service.js";

export interface CourseFulfillmentResult extends CourseFulfillment {
  /** Yêu cầu hoàn phần thiếu (nếu có) — caller báo Manager sau commit. */
  refund: { id: string; amount: number } | null;
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/**
 * Hoàn tất một giao dịch mua khóa ĐÃ THU TIỀN: ghi danh (có sức chứa) → cộng 85% ví HLV → nếu thiếu buổi
 * so với số buổi đã tính tiền thì tạo yêu cầu hoàn phần thiếu + báo hội viên. Dùng chung cho webhook,
 * đối soát, Manager kích hoạt lại và ghi nhận tay.
 */
export async function fulfillCoursePaymentTx(
  tx: Prisma.TransactionClient,
  payment: Pick<Payment, "id" | "amount" | "classId" | "memberId" | "purchaseSnapshot" | "classNameSnapshot">,
  memberUserId: string,
  now = new Date()
): Promise<CourseFulfillmentResult> {
  const fulfillment = await enrollPaidCourse(tx, payment, now);
  await creditCoachWallet(tx, payment.classId!, payment.id, Number(payment.amount));
  if (fulfillment.shortfall <= 0) return { ...fulfillment, refund: null };

  const paid = Math.round(Number(payment.amount));
  const amount =
    fulfillment.enrolled === 0 || fulfillment.expected <= 0
      ? paid
      : Math.round((paid * fulfillment.shortfall) / fulfillment.expected);
  const className = payment.classNameSnapshot ?? "khóa học";
  const refund = await createCourseShortfallRefundTx(
    tx,
    payment,
    amount,
    fulfillment.enrolled === 0
      ? `Không ghi danh được buổi nào của khóa "${className}" khi tiền về — hoàn toàn bộ.`
      : `Chỉ ghi danh được ${fulfillment.enrolled}/${fulfillment.expected} buổi đã tính tiền — hoàn ${fulfillment.shortfall} buổi.`
  );
  if (refund) {
    await enqueueNotification(tx, {
      userId: memberUserId,
      type: "PAYMENT_REFUNDED",
      title: "Trung tâm sẽ hoàn tiền cho bạn",
      body:
        fulfillment.enrolled === 0
          ? `Khóa "${className}" không còn chỗ/không còn buổi khi tiền về. Trung tâm sẽ hoàn ${vnd(Number(refund.amount))} — vui lòng cập nhật số tài khoản trong mục Hoàn tiền.`
          : `Bạn được ghi danh ${fulfillment.enrolled}/${fulfillment.expected} buổi của khóa "${className}". Phần ${fulfillment.shortfall} buổi không ghi danh được (${vnd(Number(refund.amount))}) sẽ được hoàn lại.`,
      metadata: { paymentId: payment.id, classId: payment.classId, refundId: refund.id },
    });
  }
  return { ...fulfillment, refund: refund ? { id: refund.id, amount: Number(refund.amount) } : null };
}
