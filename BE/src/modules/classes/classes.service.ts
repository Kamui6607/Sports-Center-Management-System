import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { broadcastNotification, createNotification } from "../notifications/notifications.service.js";
import { evaluateCourseEligibility } from "../enrollments/course-enrollment.service.js";
import { cleanNotificationsForClass } from "../notifications/notifications.service.js";
import { buildClassSummaries, getMemberPurchase, withClassSummaries } from "./class-summary.service.js";
import { computeGoalMatch, FITNESS_GOALS, GYM_FITNESS, type GoalMatch } from "../../config/fitness-goals.js";
import { foldVietnamese } from "../../utils/i18n.js";
import { resubmitActivityPlan } from "../class-schedules/class-schedules.service.js";
import type { ClassDraftInput } from "./classes.schema.js";
import { isPastSaleWindow, saleProgressOf } from "./course-sale.js";
import type { TrainingLevel } from "@prisma/client";

/** Người gọi API (null = Guest — BE-1). */
type Actor = { id: string; role: string } | undefined;

/** HLV phụ trách lớp (mỗi lớp đúng 1 HLV — Class.coachId). */
const CLASS_COACH_INCLUDE = {
  include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
};

const classInclude = {
  coach: CLASS_COACH_INCLUDE,
  _count: { select: { schedules: true } },
};

/**
 * Số lượt giữ chỗ (Enrollment) của từng lớp — đếm qua ClassSchedule vì Enrollment chỉ gắn với buổi học.
 * Trả kèm vào `_count.enrollments` để response giữ nguyên định dạng cũ cho FE.
 */
async function countEnrollmentsByClass(classIds: string[]): Promise<Map<string, number>> {
  if (classIds.length === 0) return new Map();
  const rows = await prisma.classSchedule.findMany({
    where: { classId: { in: classIds } },
    select: { classId: true, _count: { select: { enrollments: true } } },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.classId, (map.get(r.classId) ?? 0) + r._count.enrollments);
  return map;
}

function withEnrollmentCount<T extends { id: string; _count: { schedules: number } }>(cls: T, counts: Map<string, number>) {
  return { ...cls, _count: { ...cls._count, enrollments: counts.get(cls.id) ?? 0 } };
}

async function withEnrollmentCountOne<T extends { id: string; _count: { schedules: number } }>(cls: T) {
  return withEnrollmentCount(cls, await countEnrollmentsByClass([cls.id]));
}

/** Mục tiêu + trình độ của hội viên (để tính độ phù hợp khóa học). */
async function memberGoalsOf(actor?: Actor) {
  if (actor?.role !== "MEMBER") return null;
  return prisma.memberProfile.findUnique({
    where: { userId: actor.id },
    select: { fitnessGoals: true, trainingLevel: true },
  });
}

function withGoalMatch<T extends { goalTags: string[]; targetLevel: TrainingLevel | null }>(
  cls: T,
  member: { fitnessGoals: string[]; trainingLevel: TrainingLevel | null } | null
): T & { goalMatch: GoalMatch | null } {
  return { ...cls, goalMatch: member ? computeGoalMatch(member, cls) : null };
}

/** Danh mục mục tiêu tập luyện (công khai) — Coach gắn cho khóa, Member chọn cho hồ sơ. */
export function listGoalOptions() {
  return FITNESS_GOALS.map((g) => ({ ...g }));
}

export async function listClasses(query: any, actor?: Actor) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.fitness) where.fitness = { equals: String(query.fitness).trim(), mode: "insensitive" };
  if (query.classType) where.classType = query.classType;
  if (query.areaType) where.areaType = query.areaType;
  if (query.goal) where.goalTags = { has: query.goal };
  if (query.coachId) where.coachId = query.coachId;
  if (query.status) {
    where.status = query.status;
  }

  // Coach xem list: mặc định thấy class APPROVED + class của chính mình (mọi status)
  if (actor?.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
    if (coachProfile && query.createdByMe === "true") {
      where.coachId = coachProfile.id;
    } else if (coachProfile && !query.status) {
      where.OR = [{ status: "APPROVED" }, { coachId: coachProfile.id }];
    } else if (query.status === "DRAFT") {
      // Bản nháp chỉ chủ khóa thấy.
      where.coachId = coachProfile?.id ?? "__none__";
    }
  } else if (actor?.role === "MEMBER") {
    // Member chỉ thấy class APPROVED (bỏ qua tham số status/createdByMe).
    where.status = "APPROVED";
    where.isActive = true;
    delete where.coachId;
    if (query.coachId) where.coachId = query.coachId;
  } else if (!actor) {
    // BE-1: Guest chỉ thấy khóa đang mở bán (bỏ qua mọi tham số status/createdByMe/isActive).
    where.status = "APPROVED";
    where.isActive = true;
    delete where.coachId;
  }
  // Bản nháp là của riêng Coach — Manager/Member không thấy (kể cả khi lọc status=DRAFT).
  if (actor?.role !== "COACH") {
    if (where.status === "DRAFT") where.id = "__none__";
    else if (!where.status) where.status = { not: "DRAFT" };
  }

  const member = await memberGoalsOf(actor);
  const matchMine = query.matchMyGoals === "true" && member;
  if (matchMine) {
    where.goalTags = member.fitnessGoals.length ? { hasSome: member.fitnessGoals } : { has: "__none__" };
  }

  // Chỉ lấy khóa có buổi học SCHEDULED sắp tới chưa diễn ra (Mobile)
  if (query.hasUpcomingSchedules === "true") {
    where.schedules = {
      some: {
        status: "SCHEDULED",
        startTime: { gt: new Date() },
      },
    };
  }

  // Member/Guest chỉ thấy khóa ĐANG MỞ BÁN hoặc HẾT CHỖ — khóa đã kết thúc / ngừng nhận học viên mới bị ẩn
  // (Doc/BUSINESS_HARDENING_PLAN.md §1.1). BE tự lọc, không phụ thuộc tham số của client.
  if (!actor || actor.role === "MEMBER") {
    const now = new Date();
    const candidates = await prisma.class.findMany({
      where: { ...where, schedules: { some: { status: "SCHEDULED", startTime: { gt: now } } } },
      select: { id: true, capacity: true, status: true, isActive: true, price: true },
    });
    const sums = await buildClassSummaries(candidates, now);
    where.id = {
      in: candidates.filter((c) => ["ON_SALE", "FULL"].includes(sums.get(c.id)?.saleState ?? "")).map((c) => c.id),
    };
  }

  // Tìm không dấu: so khớp tên đã bỏ dấu (PostgreSQL chưa bật unaccent) — số khóa học nhỏ nên lọc trong bộ nhớ.
  if (query.search && String(query.search).trim()) {
    const needle = foldVietnamese(String(query.search));
    const candidates = await prisma.class.findMany({ where, select: { id: true, name: true } });
    where.id = { in: candidates.filter((c) => foldVietnamese(c.name).includes(needle)).map((c) => c.id) };
  }

  const [total, classes] = await Promise.all([
    prisma.class.count({ where }),
    prisma.class.findMany({
      where, skip, take: limit,
      include: classInclude,
      orderBy: { name: "asc" },
    }),
  ]);
  const counts = await countEnrollmentsByClass(classes.map((c) => c.id));
  // BE-12: kèm `summary` (lịch, chỗ trống, học viên) + điểm HLV; Guest không thấy email HLV.
  const withSummary = (
    await withClassSummaries(
      classes.map((c) => withEnrollmentCount(c, counts)),
      { hideCoachEmail: !actor }
    )
  ).map((c) => withGoalMatch(c, member));
  if (matchMine) withSummary.sort((a, b) => (b.goalMatch?.score ?? 0) - (a.goalMatch?.score ?? 0));
  return { classes: withSummary, pagination: buildPaginationMeta(total, page, limit) };
}

/**
 * CHỈ Coach tạo lớp (route chỉ mở cho COACH). Coach tạo ⇒ là HLV phụ trách lớp (Class.coachId),
 * lớp ở trạng thái PENDING chờ Manager duyệt.
 */
export async function createClass(data: any, actor: { id: string; role: string }) {
  if (actor.role !== "COACH") throw new AppError("Chỉ Coach được tạo lớp học", 403);

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  const newClass = await prisma.$transaction(async (tx) => {
    const cls = await tx.class.create({
      data: {
        ...data,
        fitness: data.fitness || GYM_FITNESS,
        status: "PENDING",
        coachId: coachProfile.id,
      },
      include: classInclude,
    });

    // Tạo ví HLV nếu chưa có (nhận 85% doanh thu khi có học viên mua lớp)
    await tx.coachWallet.upsert({
      where: { coachId: coachProfile.id },
      create: { coachId: coachProfile.id, balance: 0 },
      update: {},
    });

    return cls;
  });

  // Thông báo cho tất cả Manager rằng có class mới chờ duyệt
  const managers = await prisma.user.findMany({
    where: { role: { name: "MANAGER" }, isActive: true },
    select: { id: true },
  });
  broadcastNotification(
    managers.map((m) => m.id),
    "CLASS_APPROVED", // tái dùng type; FE phân biệt qua title
    `Khóa học mới chờ duyệt: ${newClass.name}`,
    `Coach đã tạo khóa học "${newClass.name}" và đang chờ xác nhận của bạn.`,
    { metadata: { classId: newClass.id } }
  ).catch(() => {});

  return withEnrollmentCountOne(newClass);
}

/**
 * Manager duyệt hoặc từ chối class do Coach tạo.
 */
export async function reviewClass(classId: string, action: "APPROVE" | "REJECT", reason?: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { coach: { select: { userId: true } } },
  });
  if (!cls) throw new AppError("Class not found", 404);
  if (cls.status !== "PENDING") {
    throw new AppError(`Class is already ${cls.status} — cannot review again`, 400);
  }

  // Không duyệt khóa đã quá giờ khai giảng / không còn buổi / đã qua hạn mở bán (khóa vừa duyệt đã "chết").
  if (action === "APPROVE") {
    const sessions = await prisma.classSchedule.findMany({
      where: { classId },
      select: { id: true, startTime: true, status: true, makeupForId: true },
    });
    const progress = saleProgressOf(sessions, new Date());
    if (progress.remainingSessions === 0 || progress.passedSessions > 0 || isPastSaleWindow(progress)) {
      throw new AppError(
        "Khóa học đã quá giờ khai giảng hoặc không còn buổi sắp diễn ra — không thể duyệt. Hãy từ chối để HLV chỉnh lịch và gửi lại.",
        409,
        { code: "CLASS_REVIEW_TOO_LATE", ...progress }
      );
    }
  }

  const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
  // CAS theo status: hai Manager bấm cùng lúc ⇒ người sau nhận 409 (không duyệt/thông báo hai lần).
  const done = await prisma.class.updateMany({
    where: { id: classId, status: "PENDING" },
    // BE-2: lưu lý do từ chối để Coach xem & sửa (xóa khi duyệt).
    data: { status: newStatus, rejectReason: action === "REJECT" ? reason?.trim() || null : null },
  });
  if (done.count === 0) {
    throw new AppError("Khóa học đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409, { code: "CLASS_ALREADY_REVIEWED" });
  }
  const updated = await prisma.class.findUniqueOrThrow({ where: { id: classId }, include: classInclude });

  // Thông báo cho Coach phụ trách lớp biết kết quả
  const notifType = action === "APPROVE" ? "CLASS_APPROVED" : "CLASS_REJECTED";
  const title =
    action === "APPROVE"
      ? `Khóa học được duyệt: ${cls.name}`
      : `Khóa học bị từ chối: ${cls.name}`;
  const body =
    action === "APPROVE"
      ? `Khóa học "${cls.name}" của bạn đã được Manager phê duyệt. Hãy thêm lịch học để bắt đầu!`
      : `Khóa học "${cls.name}" của bạn bị từ chối.${reason ? ` Lý do: ${reason}` : ""}`;
  createNotification(cls.coach.userId, notifType, title, body, {
    metadata: { classId },
  }).catch(() => {});

  // Nếu APPROVED: broadcast cho Members
  if (action === "APPROVE") {
    prisma.memberProfile
      .findMany({ where: { user: { isActive: true, role: { name: "MEMBER" } } }, select: { userId: true } })
      .then((members) =>
        broadcastNotification(
          members.map((m) => m.userId),
          "NEW_CLASS",
          `Lớp học mới: ${cls.name}`,
          `Lớp "${cls.name}" vừa được mở. Đặt chỗ ngay!`,
          { metadata: { classId } }
        )
      )
      .catch(() => {});
  }

  return withEnrollmentCountOne(updated);
}


export async function getClassById(id: string, actor?: Actor) {
  const cls = await prisma.class.findUnique({
    where: { id },
    include: {
      ...classInclude,
      schedules: {
        where: { status: "SCHEDULED", startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        take: 10,
        include: { room: true, _count: { select: { enrollments: true } } },
      },
    },
  });
  if (!cls) throw new AppError("Class not found", 404);
  // BE-1: Guest chỉ xem được khóa đang mở bán.
  if (!actor && (cls.status !== "APPROVED" || !cls.isActive)) throw new AppError("Class not found", 404);
  // Bản nháp chỉ chủ khóa xem được.
  if (cls.status === "DRAFT" && (actor?.role !== "COACH" || cls.coach.user.id !== actor.id)) {
    throw new AppError("Class not found", 404);
  }
  const [withSummary] = await withClassSummaries([await withEnrollmentCountOne(cls)], { hideCoachEmail: !actor });
  return withGoalMatch(withSummary, await memberGoalsOf(actor));
}

/**
 * BE-11: danh mục bộ môn = các giá trị `Class.fitness` (không trùng, bỏ hoa/thường) của khóa đã duyệt.
 * Công khai (Guest dùng để lọc khóa học; Coach chọn khi tạo khóa hoặc nhập bộ môn mới).
 */
export async function listFitness() {
  const rows = await prisma.class.findMany({
    where: { status: { in: ["APPROVED", "COMPLETED"] }, isActive: true },
    select: { fitness: true },
    distinct: ["fitness"],
  });
  const byKey = new Map<string, string>();
  for (const r of rows) {
    const name = r.fitness.trim();
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "vi"));
}

export async function updateClass(id: string, data: any, actor?: { id: string; role: string }) {
  const cls = await prisma.class.findUnique({
    where: { id },
    include: { coach: { select: { userId: true } } },
  });
  if (!cls) throw new AppError("Class not found", 404);

  if (cls.status === "DRAFT") {
    throw new AppError("Bản nháp chỉ được sửa trong màn tạo khóa học của HLV.", 400, { code: "CLASS_IS_DRAFT" });
  }
  // Coach chỉ được sửa class PENDING của chính mình
  if (actor?.role === "COACH") {
    if (cls.coach.userId !== actor.id) {
      throw new AppError("Forbidden: You can only edit your own classes", 403);
    }
    if (cls.status !== "PENDING") {
      throw new AppError("Cannot edit a class that has already been reviewed by Manager", 400);
    }
  }

  if (data.isActive === false && cls.isActive === true) {
    const upcoming = await prisma.classSchedule.count({
      where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
    });
    if (upcoming > 0) throw new AppError("Cannot deactivate class with upcoming schedules", 400);
    cleanNotificationsForClass(id).catch(() => {});
  }

  // A11: KHÔNG cho giảm sức chứa xuống dưới số chỗ đã giữ ở các buổi sắp tới.
  if (data.capacity !== undefined && data.capacity < cls.capacity) {
    const upcomingSchedules = await prisma.classSchedule.findMany({
      where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
      select: {
        id: true,
        _count: {
          select: { enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } } },
        },
      },
    });
    const maxBooked = upcomingSchedules.reduce((max, s) => Math.max(max, s._count.enrollments), 0);
    if (data.capacity < maxBooked) {
      throw new AppError(
        `Không thể giảm sức chứa lớp xuống ${data.capacity}: ${maxBooked} chỗ đang được giữ ở các buổi sắp tới.`,
        400,
        { code: "CLASS_CAPACITY_BELOW_BOOKED", capacity: data.capacity, minCapacity: maxBooked }
      );
    }
  }

  // Không được để upcoming SCHEDULED tồn tại ở Room không còn phù hợp với areaType mới.
  if (data.areaType !== undefined && data.areaType !== cls.areaType) {
    const mismatched = await prisma.classSchedule.count({
      where: {
        classId: id,
        status: "SCHEDULED",
        startTime: { gte: new Date() },
        room: { areaType: { not: data.areaType } },
      },
    });
    if (mismatched > 0) {
      throw new AppError(
        `Cannot change Class area type to "${data.areaType}" because ${mismatched} upcoming schedule(s) use a Room with a different area type`,
        400
      );
    }
  }

  const updated = await prisma.class.update({ where: { id }, data, include: classInclude });
  return withEnrollmentCountOne(updated);
}

export async function deleteClass(id: string) {
  const cls = await prisma.class.findUnique({ where: { id } });
  if (!cls) throw new AppError("Class not found", 404);
  const upcoming = await prisma.classSchedule.count({
    where: { classId: id, status: "SCHEDULED", startTime: { gte: new Date() } },
  });
  if (upcoming > 0) throw new AppError("Cannot deactivate class with upcoming schedules", 400);
  cleanNotificationsForClass(id).catch(() => {});
  return prisma.class.update({ where: { id }, data: { isActive: false } });
}

// ─────────────────────────────────────────
// COURSE PLAN (gom lịch trình của Class thành 1 "khóa học")
// ─────────────────────────────────────────

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
/** Thứ 2..Chủ nhật theo ISO 1..7. */
const WEEKDAY_LABELS_VI = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

const vnWeekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIME_ZONE,
  weekday: "short",
});
const vnClockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const VN_WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

/** Thứ trong tuần (ISO 1..7) theo giờ Việt Nam. */
function vnWeekdayIso(date: Date): number {
  return VN_WEEKDAY_TO_ISO[vnWeekdayFormatter.format(date).slice(0, 3)] ?? 1;
}

/** Giờ HH:mm theo giờ Việt Nam (không phụ thuộc timezone của server). */
function vnClock(date: Date): string {
  return vnClockFormatter.format(date);
}

function vnWeekdayLabel(iso: number): string {
  return WEEKDAY_LABELS_VI[iso - 1] ?? `Thứ ${iso + 1}`;
}

type CourseSlot = {
  weekday: number;
  weekdayLabel: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  roomId: string;
  roomName: string;
  sessionCount: number;
  firstSessionStart: Date;
  lastSessionStart: Date;
  sessionIds: string[];
};

/**
 * GET /classes/:id/course-plan — "nguyên cái lịch trình" của Class dưới dạng MỘT khóa học.
 *
 * Trả về:
 * - `course.slots[]`: các khung lịch lặp lại (Thứ + giờ + phòng) để FE hiển thị kiểu
 *   "Thứ 2 · 18:00–19:30 · Phòng Yoga" thay vì liệt kê từng buổi rời rạc.
 * - `course`: tổng số buổi, buổi đầu/cuối, các thứ, các phòng, độ khả dụng (còn chỗ ít nhất).
 * - `sessions[]`: từng buổi (đã có nhãn thứ/giờ VN) + sức chứa còn lại + trạng thái đặt của member.
 * - `registration` (chỉ khi caller là MEMBER): điều kiện đăng ký trọn khóa theo đúng bộ luật
 *   all-or-nothing dùng chung với `POST /enrollments/bulk` (blockers + gói tập + quota + penalty).
 */
export async function getClassCoursePlan(
  classId: string,
  actor?: { id: string; role: string }
) {
  const now = new Date();

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      goalTags: true,
      targetLevel: true,
      startDate: true,
      endDate: true,
      fitness: true,
      classType: true,
      areaType: true,
      capacity: true,
      isActive: true,
      status: true,
      price: true,
      coach: { select: { userId: true } },
    },
  });
  if (!cls) throw new AppError("Class not found", 404);
  if (cls.status === "DRAFT" && (actor?.role !== "COACH" || cls.coach.userId !== actor.id)) {
    throw new AppError("Class not found", 404);
  }
  // BE-1: Guest chỉ xem lộ trình của khóa đang mở bán.
  if (!actor && (cls.status !== "APPROVED" || !cls.isActive)) throw new AppError("Class not found", 404);

  // Khóa học = toàn bộ buổi SCHEDULED chưa bắt đầu, sắp theo thời gian.
  const schedules = await prisma.classSchedule.findMany({
    where: { classId, status: "SCHEDULED", startTime: { gt: now } },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      roomId: true,
      makeupForId: true,
      originalStartTime: true,
      rescheduleReason: true,
      room: { select: { id: true, name: true, areaType: true, location: true, floor: true, directions: true } },
      _count: {
        select: {
          enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } },
        },
      },
    },
  });

  const memberProfile =
    actor?.role === "MEMBER"
      ? await prisma.memberProfile.findUnique({
          where: { userId: actor.id },
          select: { id: true },
        })
      : null;

  // Preview điều kiện đăng ký trọn khóa — cùng nguồn luật với POST /enrollments/bulk.
  const eligibility = memberProfile
    ? await evaluateCourseEligibility(
        prisma,
        memberProfile.id,
        { id: cls.id, classType: cls.classType, capacity: cls.capacity },
        schedules.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          roomId: s.roomId,
          room: { id: s.room.id, name: s.room.name },
        }))
      )
    : null;
  const eligibilityBySchedule = new Map(
    (eligibility?.sessions ?? []).map((s) => [s.scheduleId, s])
  );

  const sessions = schedules.map((s) => {
    const state = eligibilityBySchedule.get(s.id);
    const bookedCount = state?.bookedCount ?? s._count.enrollments;
    const remainingSlots = Math.max(0, cls.capacity - bookedCount);
    const isFull = remainingSlots === 0;
    const myEnrollmentStatus = state?.myEnrollment?.status ?? null;
    const alreadyRegistered =
      myEnrollmentStatus === "BOOKED" || myEnrollmentStatus === "COMPLETED";
    const weekday = vnWeekdayIso(s.startTime);

    return {
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMinutes: Math.round((s.endTime.getTime() - s.startTime.getTime()) / 60000),
      weekday,
      weekdayLabel: vnWeekdayLabel(weekday),
      timeLabel: `${vnClock(s.startTime)} – ${vnClock(s.endTime)}`,
      status: s.status,
      room: {
        id: s.room.id,
        name: s.room.name,
        areaType: s.room.areaType,
        location: s.room.location,
        floor: s.room.floor,
        directions: s.room.directions,
      },
      isMakeup: s.makeupForId !== null,
      /** Buổi đã bị HLV dời lịch: giờ ban đầu + lý do. */
      originalStartTime: s.originalStartTime,
      rescheduleReason: s.rescheduleReason,
      bookedCount,
      remainingSlots,
      isFull,
      isBookable: !isFull,
      canBook: !isFull && !alreadyRegistered,
      myEnrollmentId: state?.myEnrollment?.id ?? null,
      myEnrollmentStatus,
      conflictWith: state?.conflictWith ?? null,
    };
  });

  // Gom các buổi lặp lại cùng (thứ + giờ bắt đầu/kết thúc + phòng) thành 1 khung lịch.
  const slotMap = new Map<string, CourseSlot>();
  for (const session of sessions) {
    const key = `${session.weekday}|${vnClock(session.startTime)}|${vnClock(session.endTime)}|${session.room.id}`;
    const existing = slotMap.get(key);
    if (existing) {
      existing.sessionCount += 1;
      existing.lastSessionStart = session.startTime;
      existing.sessionIds.push(session.id);
      continue;
    }
    slotMap.set(key, {
      weekday: session.weekday,
      weekdayLabel: session.weekdayLabel,
      startTime: vnClock(session.startTime),
      endTime: vnClock(session.endTime),
      durationMinutes: session.durationMinutes,
      roomId: session.room.id,
      roomName: session.room.name,
      sessionCount: 1,
      firstSessionStart: session.startTime,
      lastSessionStart: session.startTime,
      sessionIds: [session.id],
    });
  }

  const slots = [...slotMap.values()].sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime) ||
      a.roomName.localeCompare(b.roomName)
  );
  const weekdays = [...new Set(sessions.map((s) => s.weekday))].sort((a, b) => a - b);
  const rooms = [
    ...new Map(
      sessions.map((s) => [s.room.id, { id: s.room.id, name: s.room.name, areaType: s.room.areaType }])
    ).values(),
  ];

  const registeredCount = sessions.filter(
    (s) => s.myEnrollmentStatus === "BOOKED" || s.myEnrollmentStatus === "COMPLETED"
  ).length;

  // BE-13: tình trạng mua của Member (đã mua / đang chờ thanh toán / chưa mua).
  const purchase = memberProfile ? await getMemberPurchase(memberProfile.id, cls.id, now) : null;

  // Trạng thái mở bán + báo giá nếu mua ngay (đăng ký muộn ⇒ giá theo số buổi còn lại).
  const saleSummary = (await buildClassSummaries([cls], now)).get(cls.id)!;
  const sale = {
    state: saleSummary.saleState,
    label: saleSummary.saleStateLabel,
    heldSeats: saleSummary.heldSeats,
    quote: saleSummary.quote,
  };
  if (eligibility && purchase?.status === "NONE" && sale.state !== "ON_SALE") {
    eligibility.blockers.unshift({
      code: sale.state === "FULL" ? "COURSE_FULL" : sale.state === "SALE_CLOSED" ? "COURSE_SALE_CLOSED" : "COURSE_ENDED",
      message:
        sale.state === "FULL"
          ? "Khóa học đã hết chỗ (gồm cả chỗ đang được giữ cho người đang thanh toán)."
          : sale.state === "SALE_CLOSED"
            ? "Khóa học đã diễn ra quá nửa chặng hoặc còn quá ít buổi nên ngừng nhận học viên mới."
            : "Khóa học đã kết thúc hoặc chưa mở bán.",
    });
  }

  const firstSession = sessions[0];
  const lastSession = sessions[sessions.length - 1];
  const memberGoals = await memberGoalsOf(actor);
  const pastSessionCount = await prisma.classSchedule.count({
    where: { classId, status: { not: "CANCELLED" }, startTime: { lte: now } },
  });

  return {
    course:
      sessions.length === 0
        ? null
        : {
            classId: cls.id,
            className: cls.name,
            description: cls.description,
            goal: cls.goal,
            goalTags: cls.goalTags,
            targetLevel: cls.targetLevel,
            startDate: cls.startDate,
            endDate: cls.endDate,
            pastSessionCount,
            fitness: cls.fitness,
            classType: cls.classType,
            areaType: cls.areaType,
            capacity: cls.capacity,
            totalSessions: sessions.length,
            firstSessionStart: firstSession.startTime,
            lastSessionStart: lastSession.startTime,
            lastSessionEnd: lastSession.endTime,
            weekdays,
            weekdayLabels: weekdays.map(vnWeekdayLabel),
            timeSlots: [
              ...new Map(
                slots.map((slot) => [
                  `${slot.startTime}-${slot.endTime}`,
                  {
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    durationMinutes: slot.durationMinutes,
                  },
                ])
              ).values(),
            ],
            rooms,
            slots,
            availability: {
              minRemainingSlots:
                sessions.length === 0 ? 0 : Math.min(...sessions.map((s) => s.remainingSlots)),
              fullSessionCount: sessions.filter((s) => s.isFull).length,
              isFullyBookable: sessions.every((s) => s.isBookable),
            },
          },
    sessions,
    sale,
    goalMatch: memberGoals ? computeGoalMatch(memberGoals, cls) : null,
    registration: memberProfile
      ? {
          eligible: (eligibility?.blockers.length ?? 0) === 0,
          blockers: eligibility?.blockers ?? [],
          /** @deprecated L14 — gói hội viên đã bỏ (BE trả "gói ảo PREMIUM"); giữ vì Web còn đọc. */
          subscription: eligibility?.subscription ?? null,
          /** @deprecated L14 — xem `subscription`. */
          quota: eligibility?.quota ?? null,
          purchase,
          penalty: eligibility?.penalty ?? null,
          registeredSessions: registeredCount,
          remainingSessionsToRegister: sessions.length - registeredCount,
          isFullyRegistered: sessions.length > 0 && registeredCount === sessions.length,
        }
      : null,
  };
}


// ─────────────────────────────────────────
// BẢN NHÁP KHÓA HỌC (Doc/GYM_SCOPE_CHANGES.md §10.2)
// ─────────────────────────────────────────

/** Số bản nháp tối đa một HLV giữ cùng lúc. */
export const MAX_DRAFTS_PER_COACH = 10;

function draftColumns(data: ClassDraftInput) {
  const out: Record<string, unknown> = {};
  if (data.name !== undefined) out.name = data.name;
  if (data.description !== undefined) out.description = data.description || null;
  if (data.goal !== undefined) out.goal = data.goal || null;
  if (data.goalTags !== undefined) out.goalTags = [...new Set(data.goalTags)];
  if (data.targetLevel !== undefined) out.targetLevel = data.targetLevel;
  if (data.capacity !== undefined) out.capacity = data.capacity;
  if (data.classType !== undefined) out.classType = data.classType;
  if (data.price !== undefined) out.price = data.price;
  if (data.draftData !== undefined) out.draftData = data.draftData as object;
  return out;
}

async function ownDraft(classId: string, actor: { id: string; role: string }) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, include: { coach: { select: { userId: true } } } });
  if (!cls || cls.coach.userId !== actor.id) throw new AppError("Không tìm thấy bản nháp.", 404, { code: "DRAFT_NOT_FOUND" });
  if (cls.status !== "DRAFT") {
    throw new AppError("Khóa học này đã được gửi duyệt, không còn là bản nháp.", 409, { code: "CLASS_NOT_DRAFT", classStatus: cls.status });
  }
  return cls;
}

/** HLV tạo bản nháp (wizard lưu lần đầu) — chưa giữ phòng, chưa tạo buổi. */
export async function createDraft(data: ClassDraftInput, actor: { id: string; role: string }) {
  if (actor.role !== "COACH") throw new AppError("Chỉ Coach được tạo khóa học", 403);
  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);
  const drafts = await prisma.class.count({ where: { coachId: coachProfile.id, status: "DRAFT" } });
  if (drafts >= MAX_DRAFTS_PER_COACH) {
    throw new AppError(`Bạn đang có ${drafts} bản nháp — hãy hoàn tất hoặc xóa bớt (tối đa ${MAX_DRAFTS_PER_COACH}).`, 409, {
      code: "DRAFT_LIMIT",
      max: MAX_DRAFTS_PER_COACH,
    });
  }
  const cls = await prisma.class.create({
    data: {
      name: "",
      fitness: GYM_FITNESS,
      capacity: 12,
      areaType: "INDOOR",
      ...draftColumns(data),
      status: "DRAFT",
      coachId: coachProfile.id,
    },
    include: classInclude,
  });
  return withEnrollmentCountOne(cls);
}

/** Tự lưu bản nháp (ghi đè các field được gửi). */
export async function updateDraft(classId: string, data: ClassDraftInput, actor: { id: string; role: string }) {
  await ownDraft(classId, actor);
  const cls = await prisma.class.update({ where: { id: classId }, data: draftColumns(data), include: classInclude });
  return withEnrollmentCountOne(cls);
}

/** Xóa bản nháp (chưa có buổi/giao dịch nên xóa hẳn). */
export async function deleteDraft(classId: string, actor: { id: string; role: string }) {
  await ownDraft(classId, actor);
  await prisma.class.delete({ where: { id: classId } });
  return { id: classId, deleted: true };
}

/** Gửi duyệt bản nháp: kiểm tra đầy đủ, giữ phòng, tạo buổi ⇒ PENDING (cùng luật với tạo kế hoạch). */
export async function submitDraft(classId: string, plan: any, actor: { id: string; role: string }) {
  await ownDraft(classId, actor);
  if (!plan?.class?.goalTags?.length) {
    throw new AppError("Chọn ít nhất 1 mục tiêu cho khóa học trước khi gửi duyệt.", 400, {
      code: "CLASS_GOALS_REQUIRED",
    });
  }
  return resubmitActivityPlan(classId, plan, actor, { fromDraft: true });
}
