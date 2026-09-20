import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";
import type { CreateSubscriptionInput, RenewSubscriptionInput } from "./subscriptions.schema.js";

async function autoCreateInvoice(
  memberId: string,
  paymentId: string,
  amount: number
) {
  await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      memberId,
      paymentId,
      subtotal: amount,
      discount: 0,
      total: amount,
      status: "ISSUED",
      issuedAt: new Date(),
    },
  });
}

export async function createSubscription(
  data: CreateSubscriptionInput,
  createdById: string
) {
  // Resolve member (accept userId or profileId)
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: data.memberId }, { userId: data.memberId }] },
    include: { user: true },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);
  
  // BR-16 Check: User must currently be a MEMBER and active
  if (!memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot create subscription: user is not an active MEMBER", 400);
  }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: data.planId } });
  if (!plan || !plan.isActive) throw new AppError("Membership plan not found or inactive", 404);

  const now = new Date();
  const startDate = data.startDate ? new Date(data.startDate) : now;
  const endDate = new Date(startDate);
  
  let remainingDays = 0;
  let isUpgrade = false;
  let oldPlanName = "";

  return prisma.$transaction(async (tx) => {
    // 1. Resolve member's user for snapshot
    const memberUser = await tx.user.findUnique({ where: { id: memberProfile.userId }, select: { fullName: true } });

    // 2. Prevent downgrade and calculate remaining days
    const currentActive = await tx.membershipSubscription.findFirst({
      where: { memberId: memberProfile.id, status: "ACTIVE" },
      include: { plan: true }
    });

    if (currentActive) {
      const tierValue: Record<string, number> = { "FREE": 0, "MEMBERSHIP": 1, "PREMIUM": 2 };
      const currentTierVal = tierValue[currentActive.tier] ?? 0;
      const newTierVal = tierValue[plan.tier] ?? 0;

      if (newTierVal < currentTierVal) {
        throw new AppError("Không thể mua gói thấp hơn hạng hiện tại. Bạn chỉ có thể nâng cấp.", 400);
      }
      if (newTierVal === currentTierVal && plan.durationDays < currentActive.plan.durationDays) {
        throw new AppError(`Bạn đang dùng gói ${currentActive.plan.durationDays} ngày. Không thể mua gói ${plan.durationDays} ngày cùng hạng.`, 400);
      }

      if (newTierVal > currentTierVal) {
        isUpgrade = true;
        oldPlanName = currentActive.plan.name;
      }

      // Tính số ngày còn dư của gói cũ
      if (currentActive.endDate > now) {
        const diffTime = currentActive.endDate.getTime() - now.getTime();
        remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Suspend gói cũ
      await tx.membershipSubscription.update({
        where: { id: currentActive.id },
        data: { status: "SUSPENDED", suspendedAt: now },
      });
    }

    // Cộng số ngày của gói mới + số ngày còn dư của gói cũ
    endDate.setDate(endDate.getDate() + plan.durationDays + remainingDays);

    // 3. Create new subscription
    const subscription = await tx.membershipSubscription.create({
      data: {
        memberId: memberProfile.id,
        planId: plan.id,
        tier: plan.tier,
        startDate,
        endDate,
        status: "ACTIVE",
      },
      include: { plan: true },
    });

    // Create payment
    const payment = await tx.payment.create({
      data: {
        memberId: memberProfile.id,
        subscriptionId: subscription.id,
        amount: plan.price,
        method: data.paymentMethod,
        status: "SUCCESS",
        paidAt: new Date(),
        note: data.note,
        createdById,
      },
    });

    // Auto-create invoice with BR-25 snapshot fields
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        memberId: memberProfile.id,
        paymentId: payment.id,
        subtotal: Number(plan.price),
        discount: 0,
        total: Number(plan.price),
        status: "ISSUED",
        issuedAt: new Date(),
        memberName: memberUser?.fullName ?? null,
        planName: plan.name,
        planTier: plan.tier,
      },
    });

    // Notify user out-of-band so it doesn't fail the transaction
    if (isUpgrade) {
      createNotification(
        memberProfile.userId,
        "PAYMENT_SUCCESS",
        "Nâng cấp gói thành công!",
        `Chúc mừng bạn đã nâng cấp thành công từ gói ${oldPlanName} lên ${plan.name} (${plan.tier}). Số ngày sử dụng còn dư đã được cộng dồn vào thời hạn gói mới.`,
        { metadata: { subscriptionId: subscription.id } }
      ).catch(() => {});
    } else {
      createNotification(
        memberProfile.userId,
        "PAYMENT_SUCCESS",
        "Đăng ký gói thành công!",
        `Gói ${plan.name} (${plan.tier}) của bạn đã được kích hoạt thành công. ${remainingDays > 0 ? "Thời gian dư từ gói cũ đã được cộng dồn." : ""}`,
        { metadata: { subscriptionId: subscription.id } }
      ).catch(() => {});
    }

    return { subscription, payment, invoice };
  });
}

export async function renewSubscription(
  subscriptionId: string,
  data: RenewSubscriptionInput,
  createdById: string
) {
  const existing = await prisma.membershipSubscription.findUnique({
    where: { id: subscriptionId },
    include: { member: { include: { user: true } } },
  });
  if (!existing) throw new AppError("Subscription not found", 404);

  // BR-16 Check: User must currently be a MEMBER and active
  if (!existing.member.user.isActive || existing.member.user.role !== "MEMBER") {
    throw new AppError("Cannot renew subscription: user is no longer an active MEMBER", 400);
  }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: data.planId } });
  if (!plan || !plan.isActive) throw new AppError("Membership plan not found or inactive", 404);

  // New start: after existing endDate if still active, else now
  const now = new Date();
  const startDate =
    existing.status === "ACTIVE" && existing.endDate > now ? existing.endDate : now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  return prisma.$transaction(async (tx) => {
    // BR-25: Get member's name for snapshot
    const memberUser = await tx.user.findFirst({
      where: { memberProfile: { id: existing.memberId } },
      select: { fullName: true },
    });

    const subscription = await tx.membershipSubscription.create({
      data: {
        memberId: existing.memberId,
        planId: plan.id,
        tier: plan.tier,
        startDate,
        endDate,
        status: "ACTIVE",
      },
      include: { plan: true },
    });

    const payment = await tx.payment.create({
      data: {
        memberId: existing.memberId,
        subscriptionId: subscription.id,
        amount: plan.price,
        method: data.paymentMethod,
        status: "SUCCESS",
        paidAt: new Date(),
        note: data.note,
        createdById,
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        memberId: existing.memberId,
        paymentId: payment.id,
        subtotal: Number(plan.price),
        discount: 0,
        total: Number(plan.price),
        status: "ISSUED",
        issuedAt: new Date(),
        memberName: memberUser?.fullName ?? null,
        planName: plan.name,
        planTier: plan.tier,
      },
    });

    return { subscription, payment, invoice };
  });
}

export async function getMemberSubscriptions(memberId: string, query: any, currentUser: any) {
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: memberId }, { userId: memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  // BR-01 Fix: IDOR protection
  if (currentUser.role === "MEMBER" && memberProfile.userId !== currentUser.id) {
    throw new AppError("Forbidden: You can only view your own subscriptions", 403);
  }
  if (currentUser.role === "COACH") {
    // For now, coaches are not allowed to view financial subscriptions of members.
    // If business logic requires it later, we can check if the member is in their classes.
    throw new AppError("Forbidden: Coaches cannot view member financial subscriptions", 403);
  }

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;

  const [total, subscriptions] = await Promise.all([
    prisma.membershipSubscription.count({ where }),
    prisma.membershipSubscription.findMany({
      where,
      skip,
      take: limit,
      include: { plan: true, payments: { include: { invoice: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { subscriptions, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getSubscriptionById(id: string) {
  const sub = await prisma.membershipSubscription.findUnique({
    where: { id },
    include: {
      plan: true,
      member: { include: { user: { select: { fullName: true, email: true } } } },
      payments: { include: { invoice: true } },
    },
  });
  if (!sub) throw new AppError("Subscription not found", 404);
  return sub;
}

export async function updateSubscriptionStatus(id: string, status: string) {
  const now = new Date();

  const sub = await prisma.membershipSubscription.findUnique({
    where: { id },
    include: {
      plan: true,
      member: { include: { user: true } },
      payments: { where: { status: "SUCCESS" }, orderBy: { paidAt: "desc" }, take: 1 },
    },
  });
  if (!sub) throw new AppError("Subscription not found", 404);

  // BR-15: Suspension state machine
  const updateData: any = { status };

  if (status === "SUSPENDED" && sub.status === "ACTIVE") {
    const msLeft = sub.endDate.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    updateData.suspendedAt = now;
    updateData.remainingDays = daysLeft;
  }

  if (status === "ACTIVE" && sub.status === "SUSPENDED") {
    const daysToAdd = sub.remainingDays ?? 0;
    const newEndDate = new Date();
    newEndDate.setDate(now.getDate() + daysToAdd);
    updateData.endDate = newEndDate;
    updateData.suspendedAt = null;
    updateData.remainingDays = null;
  }

  // ── PRORATED REFUND khi Manager hủy ──────────────────────────────────────
  let refundAmount = 0;
  let willRefund = false;

  if (status === "CANCELLED" && sub.status === "ACTIVE") {
    const msLeft = sub.endDate.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    const originalPayment = sub.payments[0];
    if (originalPayment && daysLeft > 0) {
      const dailyRate = Number(originalPayment.amount) / sub.plan.durationDays;
      refundAmount = Math.round(dailyRate * daysLeft);
      willRefund = refundAmount > 0;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Cập nhật trạng thái subscription
      await tx.membershipSubscription.update({
        where: { id },
        data: updateData,
      });

      // 2. Tự động hủy toàn bộ lịch học tương lai của member
      await tx.enrollment.updateMany({
        where: {
          memberId: sub.memberId,
          status: "BOOKED",
          schedule: { startTime: { gt: now } },
        },
        data: { status: "CANCELLED", cancelledAt: now },
      });

      // 3. Tạo bản ghi Payment hoàn tiền nếu đủ điều kiện
      if (willRefund && originalPayment) {
        await tx.payment.update({
          where: { id: originalPayment.id },
          data: {
            status: "REFUNDED",
            note: `Hoàn tiền theo tỷ lệ ngày còn lại: ${daysLeft} ngày / ${sub.plan.durationDays} ngày. Số tiền hoàn: ${refundAmount.toLocaleString("vi-VN")}đ`,
          },
        });
      }
    });

    // 4. Gửi notifications
    if (willRefund) {
      createNotification(
        sub.member.userId,
        "PAYMENT_REFUNDED",
        "Hoàn tiền gói tập",
        `Gói "${sub.plan.name}" đã bị hủy bởi quản lý. Số tiền hoàn: ${refundAmount.toLocaleString("vi-VN")}đ (${daysLeft} ngày còn lại / ${sub.plan.durationDays} ngày). Vui lòng ra quầy lễ tân để nhận hoàn tiền.`,
      ).catch(() => {});
    } else {
      createNotification(
        sub.member.userId,
        "SUBSCRIPTION_CANCELLED",
        "Gói tập của bạn đã bị hủy",
        `Gói "${sub.plan.name}" đã bị hủy bởi quản lý. Gói của bạn đã hết thời hạn nên không phát sinh hoàn tiền. Các lịch học tương lai đã tự động bị hủy. Nếu có thắc mắc, vui lòng liên hệ nhân viên.`,
      ).catch(() => {});
    }

    // Trả về kết quả có thêm thông tin refund
    const result = await prisma.membershipSubscription.findUnique({
      where: { id },
      include: { plan: true, member: { include: { user: true } } },
    });
    return { ...result, refundAmount, willRefund, daysLeft: msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : 0 };
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Các trạng thái khác (SUSPENDED, ACTIVE resume) — xử lý bình thường
  const updated = await prisma.membershipSubscription.update({
    where: { id },
    data: updateData,
    include: {
      plan: true,
      member: { include: { user: true } },
    },
  });

  return updated;
}

/**
 * Member tự hủy gói của mình.
 * Quy tắc hoàn tiền:
 *   - Gói hủy khi còn > 15 ngày sử dụng → hoàn 30% giá trị gốc ban đầu.
 *   - Gói hủy khi còn ≤ 15 ngày sử dụng → KHÔNG hoàn tiền.
 * Sau khi hủy:
 *   - Tất cả booking (BOOKED) trong tương lai của member sẽ tự động bị CANCELLED.
 *   - Gửi Notification cho member.
 */
export async function cancelSubscriptionBySelf(
  subscriptionId: string,
  userId: string,
  reason?: string
) {
  const now = new Date();

  // Tìm subscription và xác minh owner
  const sub = await prisma.membershipSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      member: { include: { user: true } },
      payments: { where: { status: "SUCCESS" }, orderBy: { paidAt: "desc" }, take: 1 },
    },
  });

  if (!sub) throw new AppError("Subscription not found", 404);
  if (sub.member.userId !== userId) throw new AppError("Forbidden: not your subscription", 403);
  if (sub.status !== "ACTIVE") throw new AppError(`Không thể hủy gói đang ở trạng thái ${sub.status}`, 400);

  // Tính số ngày còn lại
  const msLeft = sub.endDate.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  // Tính hoàn tiền
  const REFUND_THRESHOLD_DAYS = 15;
  const REFUND_RATE = 0.3;
  const originalPayment = sub.payments[0];
  const originalAmount = originalPayment ? Number(originalPayment.amount) : 0;
  const refundAmount = daysLeft > REFUND_THRESHOLD_DAYS ? Math.round(originalAmount * REFUND_RATE) : 0;
  const willRefund = refundAmount > 0;

  await prisma.$transaction(async (tx) => {
    // 1. Hủy subscription
    await tx.membershipSubscription.update({
      where: { id: subscriptionId },
      data: { status: "CANCELLED" },
    });

    // 2. Hủy tất cả booking tương lai
    await tx.enrollment.updateMany({
      where: {
        memberId: sub.memberId,
        status: "BOOKED",
        schedule: { startTime: { gt: now } },
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    // 3. Nếu hoàn tiền: đổi payment gốc thành REFUNDED
    if (willRefund && originalPayment) {
      await tx.payment.update({
        where: { id: originalPayment.id },
        data: { status: "REFUNDED", note: `Hoàn 30% do hủy gói (còn ${daysLeft} ngày). Lý do: ${reason ?? "Không có"}` },
      });
    }
  });

  // 4. Gửi notifications
  const refundMsg = willRefund
    ? `Bạn sẽ được hoàn ${refundAmount.toLocaleString("vi-VN")}đ (30% giá trị gói) vì còn ${daysLeft} ngày sử dụng (> 15 ngày). Vui lòng liên hệ nhân viên để nhận hoàn tiền.`
    : `Gói của bạn còn ${daysLeft} ngày (≤ 15 ngày) nên không đủ điều kiện hoàn tiền theo chính sách.`;

  createNotification(
    userId,
    "SUBSCRIPTION_CANCELLED",
    "Gói tập đã được hủy",
    `Gói "${sub.plan.name}" đã bị hủy thành công. ${refundMsg} Các lịch học sắp tới cũng đã tự động bị hủy.`,
  ).catch(() => {});

  return {
    subscriptionId,
    status: "CANCELLED",
    daysLeft,
    refundAmount,
    willRefund,
    message: willRefund
      ? `Hủy thành công. Hoàn ${refundAmount.toLocaleString("vi-VN")}đ (30%) vì còn ${daysLeft} ngày.`
      : `Hủy thành công. Không hoàn tiền vì còn ≤ 15 ngày (còn ${daysLeft} ngày).`,
  };
}
