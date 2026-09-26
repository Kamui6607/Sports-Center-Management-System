import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Mã lỗi 403: Member chưa sở hữu (chưa mua) khóa học. */
export const COURSE_NOT_PURCHASED_CODE = "COURSE_NOT_PURCHASED";

/**
 * Lượt mua khóa học đang hiệu lực của member với một Class:
 * `status = ACTIVE`, đã tới `startDate`, và còn hạn (`endDate = null` nghĩa là vĩnh viễn).
 *
 * Thay thế hoàn toàn `findActiveSubscription` cũ: quyền vào lớp giờ đến từ việc MUA KHÓA HỌC,
 * không còn từ gói tập (Membership).
 */
export async function findActiveCoursePurchase(
  db: DbClient,
  memberProfileId: string,
  classId: string,
  now: Date = new Date()
) {
  return db.coursePurchase.findFirst({
    where: {
      memberId: memberProfileId,
      classId,
      status: "ACTIVE",
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    // Lượt mua mới nhất đại diện khi member mua lại cùng một khóa.
    orderBy: { createdAt: "desc" },
    include: { class: { select: { id: true, name: true } } },
  });
}

/**
 * Chốt chặn quyền vào lớp (thay cho kiểm tra gói tập + quota cũ):
 * - Chưa mua khóa học            → 403 `COURSE_NOT_PURCHASED`.
 * - Khóa học hết hạn trước buổi học → 403 kèm ngày hết hạn & ngày học.
 *
 * Lưu ý: quota "số lớp song song" đã bị bỏ cùng MembershipPlan — member được đặt mọi buổi
 * của NHỮNG khóa học mình đã mua, không giới hạn số lớp cùng lúc.
 */
export async function assertCourseAccess(
  db: DbClient,
  memberProfileId: string,
  target: { classId: string; classLabel?: string; startTime: Date },
  now: Date = new Date()
) {
  const purchase = await findActiveCoursePurchase(db, memberProfileId, target.classId, now);
  const classLabel = target.classLabel ?? purchase?.class.name ?? "này";

  if (!purchase) {
    throw new AppError(
      `Bạn chưa sở hữu khóa học "${classLabel}". Vui lòng mua khóa học để đặt lịch.`,
      403,
      { code: COURSE_NOT_PURCHASED_CODE, classId: target.classId }
    );
  }

  if (purchase.endDate && purchase.endDate < target.startTime) {
    const expiredDate = purchase.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const classDate = target.startTime.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    throw new AppError(
      `Khóa học "${classLabel}" của bạn hết hạn ngày ${expiredDate}, trước khi buổi học diễn ra ngày ${classDate}. Vui lòng mua lại khóa học để đặt lịch.`,
      403
    );
  }

  return purchase;
}
