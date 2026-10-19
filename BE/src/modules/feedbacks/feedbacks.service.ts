import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { hasMemberCompletedClass } from "../enrollments/my-courses.service.js";
import type { CreateFeedbackInput, UpdateFeedbackInput, FeedbackQueryInput } from "./feedbacks.schema.js";

const feedbackInclude = {
  coach: { include: { user: { select: { fullName: true, email: true } } } },
  member: { include: { user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
};

/**
 * Member tạo feedback cho Coach.
 * Business rules (Doc/GYM_SCOPE_CHANGES.md §7):
 *  - Bắt buộc `classId`; khóa phải thuộc HLV được đánh giá.
 *  - Member phải HỌC XONG khóa (mọi buổi chính đã kết thúc + đã thanh toán) mới được đánh giá.
 *  - Mỗi (member, khóa) đánh giá 1 lần và được SỬA LẠI đúng 1 lần (`editCount`); lần sửa thứ 2 ⇒ 409.
 */
export const MAX_FEEDBACK_EDITS = 1;

export async function createFeedback(data: CreateFeedbackInput, userId: string) {
  // Tìm memberProfile từ userId
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  // Tìm coachProfile
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { id: data.coachId },
    include: { user: true },
  });
  if (!coachProfile || !coachProfile.user.isActive) throw new AppError("Coach not found or inactive", 404);

  // Kiểm tra classId (nếu có) thuộc HLV này
  if (data.classId) {
    const classExists = await prisma.class.findFirst({
      where: { id: data.classId, coachId: data.coachId },
    });
    if (!classExists) throw new AppError("Lớp học này không thuộc HLV được chỉ định.", 400);
  }

  // Chỉ được đánh giá SAU KHI học xong khóa: mọi buổi chính đã kết thúc + đã thanh toán.
  if (!(await hasMemberCompletedClass(memberProfile.id, data.classId))) {
    throw new AppError(
      "Bạn chỉ có thể đánh giá sau khi hoàn thành khóa học (mọi buổi đã kết thúc và đã thanh toán).",
      403,
      { code: "COURSE_NOT_COMPLETED", classId: data.classId }
    );
  }

  const existing = await prisma.coachFeedback.findFirst({
    where: { memberId: memberProfile.id, classId: data.classId },
  });
  if (!existing) {
    return prisma.coachFeedback.create({
      data: {
        coachId: data.coachId,
        memberId: memberProfile.id,
        classId: data.classId,
        rating: data.rating,
        comment: data.comment,
        isAnonymous: data.isAnonymous ?? false,
      },
      include: feedbackInclude,
    });
  }

  // Đã đánh giá ⇒ đây là lần SỬA: chỉ cho phép 1 lần (CAS theo editCount chống gửi song song).
  const edited = await prisma.coachFeedback.updateMany({
    where: { id: existing.id, editCount: { lt: MAX_FEEDBACK_EDITS } },
    data: {
      rating: data.rating,
      comment: data.comment,
      isAnonymous: data.isAnonymous ?? false,
      editCount: { increment: 1 },
    },
  });
  if (edited.count === 0) {
    throw new AppError("Bạn đã đánh giá và sửa lại đánh giá khóa học này — không thể sửa thêm.", 409, {
      code: "FEEDBACK_EDIT_LIMIT",
      feedbackId: existing.id,
    });
  }
  return prisma.coachFeedback.findUniqueOrThrow({ where: { id: existing.id }, include: feedbackInclude });
}

/**
 * Lấy danh sách feedback của 1 Coach (công khai cho user đã đăng nhập).
 * - `isAnonymous = true` → KHÔNG trả `memberId`/`member` cho bất kỳ ai (chống truy ngược tác giả);
 *   chính tác giả xem bản của mình qua `GET /feedbacks/my`.
 * - Mọi item kèm `isOwn` để FE biết có thể sửa/xóa.
 */
export async function listFeedbacksForCoach(query: FeedbackQueryInput, actorId?: string) {
  const { coachId, classId } = query;
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  if (!coachId) throw new AppError("coachId là bắt buộc", 400);

  const where: any = { coachId };
  if (classId) where.classId = classId;

  const [total, feedbacks, ownProfile] = await Promise.all([
    prisma.coachFeedback.count({ where }),
    prisma.coachFeedback.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: feedbackInclude,
    }),
    actorId
      ? prisma.memberProfile.findUnique({ where: { userId: actorId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  const ownMemberId = ownProfile?.id ?? null;
  const sanitized = feedbacks.map(({ memberId, member, ...rest }) => {
    const isOwn = Boolean(ownMemberId) && memberId === ownMemberId;
    if (rest.isAnonymous) {
      return { ...rest, isOwn };
    }
    return { ...rest, memberId, member, isOwn };
  });

  // Tính điểm trung bình (toàn HLV — giữ nguyên cho Web) + BE-22: phân bố sao, thống kê riêng khóa.
  const [avgResult, coachDistribution, classSummary] = await Promise.all([
    prisma.coachFeedback.aggregate({ where: { coachId }, _avg: { rating: true }, _count: { rating: true } }),
    ratingDistribution({ coachId }),
    classId ? summarize({ coachId, classId }) : Promise.resolve(null),
  ]);

  return {
    feedbacks: sanitized,
    pagination: buildPaginationMeta(total, page, limit),
    summary: {
      averageRating: avgResult._avg.rating ? Math.round(avgResult._avg.rating * 10) / 10 : null,
      totalFeedbacks: avgResult._count.rating,
      distribution: coachDistribution,
      classSummary,
    },
  };
}

/**
 * Member xem feedback mình đã gửi.
 */
export async function getMyFeedbacks(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  return prisma.coachFeedback.findMany({
    where: { memberId: memberProfile.id },
    orderBy: { createdAt: "desc" },
    include: feedbackInclude,
  });
}

/**
 * Member KHÔNG được tự xóa đánh giá (tránh xóa rồi đánh giá lại vô hạn — luật 1 lần + sửa 1 lần).
 * Đánh giá vi phạm do Manager xóa (`DELETE /feedbacks/:id/manager`).
 */
export async function deleteFeedback(feedbackId: string, userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({ where: { userId } });
  if (!memberProfile) throw new AppError("Member profile not found", 404);

  const feedback = await prisma.coachFeedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw new AppError("Feedback not found", 404);
  if (feedback.memberId !== memberProfile.id) throw new AppError("Forbidden: not your feedback", 403);

  throw new AppError(
    "Không thể xóa đánh giá. Bạn chỉ được sửa lại đánh giá 1 lần; liên hệ Quản lý nếu cần gỡ nội dung.",
    403,
    { code: "FEEDBACK_DELETE_NOT_ALLOWED" }
  );
}

/**
 * Manager xóa feedback vi phạm.
 */
export async function deleteFeedbackByManager(feedbackId: string) {
  const feedback = await prisma.coachFeedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw new AppError("Feedback not found", 404);
  await prisma.coachFeedback.delete({ where: { id: feedbackId } });
  return { message: "Feedback đã được xóa bởi quản lý." };
}

/** BE-22: số đánh giá theo từng mức sao `{ "1": n, ..., "5": n }`. */
async function ratingDistribution(where: { coachId?: string; classId?: string }) {
  const rows = await prisma.coachFeedback.groupBy({ by: ["rating"], where, _count: { rating: true } });
  const result: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of rows) result[String(r.rating)] = r._count.rating;
  return result;
}

/** BE-22: thống kê đánh giá trong phạm vi một khóa. */
async function summarize(where: { coachId?: string; classId: string }) {
  const [agg, distribution] = await Promise.all([
    prisma.coachFeedback.aggregate({ where, _avg: { rating: true }, _count: { rating: true } }),
    ratingDistribution(where),
  ]);
  return {
    classId: where.classId,
    averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
    totalFeedbacks: agg._count.rating,
    distribution,
  };
}
