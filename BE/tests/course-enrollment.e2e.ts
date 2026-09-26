/**
 * E2E THẬT (HTTP + PostgreSQL) cho luồng "ĐĂNG KÝ TRỌN KHÓA" (all-or-nothing):
 * - `GET  /classes/:id/course-plan`  → gom toàn bộ buổi sắp diễn ra thành 1 khóa học
 *   (khung lịch lặp lại + availability + preview điều kiện đăng ký).
 * - `POST /enrollments/bulk`         → đăng ký TẤT CẢ buổi sắp diễn ra của Class;
 *   chỉ cần 1 buổi/điều kiện fail ⇒ 409 COURSE_ENROLLMENT_FAILED + rollback toàn bộ.
 *
 * Chạy: cd BE && npm run test:e2e:course   (hoặc: npx tsx tests/course-enrollment.e2e.ts)
 *
 * Nguyên tắc: fixture (user / class / schedule) tạo trực tiếp qua Prisma,
 * hành vi nghiệp vụ gọi qua HTTP API thật; dọn sạch fixture ở cuối kể cả khi fail.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eCourse!2026";
const COURSE_CODE = "COURSE_ENROLLMENT_FAILED";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let baseUrl = "";

type HttpResult = { status: number; body: any };

async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// ─── Report helpers ───────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function safe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function check(name: string, condition: boolean, detail?: unknown): boolean {
  if (condition) {
    passed++;
    console.log(`  [OK]   ${name}`);
  } else {
    const msg = `${name}${detail === undefined ? "" : ` — ${safe(detail)}`}`;
    failures.push(msg);
    console.log(`  [FAIL] ${msg}`);
  }
  return condition;
}

// ─── Fixture tracking ─────────────────────────────────────────────────────
const created = {
  userIds: [] as string[],
  memberProfileIds: [] as string[],
  classIds: [] as string[],
  roomIds: [] as string[],
  planIds: [] as string[],
};

type FixtureUser = { id: string; email: string; token: string; memberProfileId: string };

async function createUser(
  role: "MEMBER" | "COACH" | "STAFF" | "MANAGER",
  tag: string,
  hashedPassword: string
): Promise<FixtureUser> {
  const email = `e2e-course-${RUN}-${tag.toLowerCase()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: `E2E Course ${tag} ${RUN}`,
      role,
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : {}),
      ...(role === "COACH" ? { coachProfile: { create: {} } } : {}),
      ...(role === "MANAGER" ? { managerProfile: { create: {} } } : {}),
    },
    include: { memberProfile: true },
  });
  created.userIds.push(user.id);
  const memberProfileId = user.memberProfile?.id ?? "";
  if (memberProfileId) created.memberProfileIds.push(memberProfileId);

  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const token = login.body?.data?.accessToken as string | undefined;
  if (login.status !== 200 || !token) {
    throw new Error(`Login failed for fixture ${email}: ${safe(login)}`);
  }
  return { id: user.id, email, token, memberProfileId };
}

let roomId = "";

async function setupRoom(): Promise<void> {
  const room = await prisma.room.create({
    data: { name: `E2E Course Room ${RUN}`, capacity: 50, areaType: "INDOOR", location: "E2E" },
  });
  roomId = room.id;
  created.roomIds.push(room.id);
}

/** Buổi tương lai lúc `hour` giờ địa phương, cách `daysAhead` ngày. */
function futureSlot(daysAhead: number, hour = 18): { start: Date; end: Date } {
  const start = new Date(Date.now() + daysAhead * DAY);
  start.setHours(hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + HOUR) };
}

async function createClass(
  tag: string,
  slots: { start: Date; end: Date }[],
  opts: { capacity?: number; classType?: "REGULAR" | "PREMIUM"; roomId?: string } = {}
): Promise<{ classId: string; className: string; scheduleIds: string[] }> {
  const cls = await prisma.class.create({
    data: {
      name: `E2E Course ${tag} ${RUN}`,
      areaType: "INDOOR",
      capacity: opts.capacity ?? 20,
      classType: opts.classType ?? "REGULAR",
    },
  });
  created.classIds.push(cls.id);

  const scheduleIds: string[] = [];
  for (const slot of slots) {
    const schedule = await prisma.classSchedule.create({
      data: {
        classId: cls.id,
        roomId: opts.roomId ?? roomId,
        startTime: slot.start,
        endTime: slot.end,
        status: "SCHEDULED",
      },
    });
    scheduleIds.push(schedule.id);
  }
  return { classId: cls.id, className: cls.name, scheduleIds };
}

// ─── API helpers ──────────────────────────────────────────────────────────
const coursePlan = (token: string, classId: string) =>
  http("GET", `/classes/${classId}/course-plan`, { token });
const enrollWholeCourse = (token: string, classId: string, memberId?: string) =>
  http("POST", "/enrollments/bulk", { token, body: { classId, ...(memberId ? { memberId } : {}) } });
const book = (token: string, scheduleId: string) =>
  http("POST", "/enrollments", { token, body: { scheduleId } });
const cancel = (token: string, enrollmentId: string) =>
  http("DELETE", `/enrollments/${enrollmentId}`, { token });
const quota = (token: string) => http("GET", "/enrollments/my/quota", { token });

async function createPlan(managerToken: string, payload: Record<string, unknown>): Promise<any> {
  const res = await http("POST", "/membership-plans", { token: managerToken, body: payload });
  if (res.status !== 201) throw new Error(`createPlan failed: ${safe(res)}`);
  created.planIds.push(res.body.data.id);
  return res.body.data;
}

async function subscribe(managerToken: string, memberProfileId: string, planId: string): Promise<void> {
  const res = await http("POST", "/subscriptions", {
    token: managerToken,
    body: { memberId: memberProfileId, planId, paymentMethod: "CASH" },
  });
  if (res.status !== 201) throw new Error(`subscribe failed: ${safe(res)}`);
}

const bookedCountOfClass = (memberProfileId: string, classId: string) =>
  prisma.enrollment.count({ where: { memberId: memberProfileId, classId, status: "BOOKED" } });

function blockersOf(res: HttpResult): any[] {
  const details = res.body?.errors?.details;
  return Array.isArray(details) ? details : [];
}

/** Kiểm tra 409 all-or-nothing: đúng code tổng + details có code mong đợi + message đọc được. */
function expectCourseFailure(label: string, res: HttpResult, expectedCodes: string[]): any[] {
  check(`${label} → HTTP 409`, res.status === 409, res.body);
  check(`${label} → errors.code = ${COURSE_CODE}`, res.body?.errors?.code === COURSE_CODE, res.body?.errors);
  const details = blockersOf(res);
  check(`${label} → có errors.details[]`, details.length > 0, res.body?.errors);
  for (const code of expectedCodes) {
    check(
      `${label} → details chứa code ${code}`,
      details.some((d) => d?.code === code),
      details.map((d) => d?.code)
    );
  }
  check(
    `${label} → mọi detail có message cho FE`,
    details.every((d) => typeof d?.message === "string" && d.message.length > 0),
    details
  );
  return details;
}

// ─── Scenarios ────────────────────────────────────────────────────────────
type Ctx = {
  manager: FixtureUser;
  plans: { membership3: any; membership1: any; short5: any };
};

/** 1) + 2) + 3) course-plan gom lịch trình → đăng ký trọn khóa → idempotent. */
async function scenarioPlanThenEnroll(ctx: Ctx, member: FixtureUser, coach: FixtureUser): Promise<void> {
  section("1) GET /classes/:id/course-plan — gom toàn bộ buổi thành 1 khóa học");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const cls = await createClass("S1", [futureSlot(3, 18), futureSlot(10, 18), futureSlot(17, 18)]);

  const planRes = await coursePlan(member.token, cls.classId);
  check("course-plan → HTTP 200", planRes.status === 200, planRes.body);
  const plan = planRes.body?.data;
  check("course.totalSessions = 3", plan?.course?.totalSessions === 3, plan?.course);
  check(
    "course.slots gom 3 buổi cùng (thứ + giờ + phòng) thành 1 khung lịch",
    plan?.course?.slots?.length === 1,
    plan?.course?.slots
  );
  const slot = plan?.course?.slots?.[0];
  check("slots[0].sessionCount = 3", slot?.sessionCount === 3, slot);
  check("slots[0] giờ 18:00–19:00 và đúng phòng fixture", slot?.startTime === "18:00" && slot?.endTime === "19:00" && slot?.roomId === roomId, slot);
  check("course.weekdays = 1 thứ (lặp hằng tuần)", plan?.course?.weekdays?.length === 1, plan?.course?.weekdays);
  check("course.weekdayLabels[0] có nhãn tiếng Việt", typeof plan?.course?.weekdayLabels?.[0] === "string", plan?.course?.weekdayLabels);
  check(
    "availability: còn 20 chỗ/buổi, chưa buổi nào full",
    plan?.course?.availability?.minRemainingSlots === 20 &&
      plan?.course?.availability?.fullSessionCount === 0 &&
      plan?.course?.availability?.isFullyBookable === true,
    plan?.course?.availability
  );
  check(
    "sessions[] có 3 buổi kèm weekdayLabel/timeLabel/remainingSlots và canBook = true",
    plan?.sessions?.length === 3 &&
      plan.sessions.every((s: any) => s.weekdayLabel && s.timeLabel && s.remainingSlots === 20 && s.isFull === false && s.canBook === true),
    plan?.sessions
  );
  check(
    "registration hợp lệ: eligible = true, không blocker, chưa đăng ký buổi nào",
    plan?.registration?.eligible === true &&
      plan?.registration?.blockers?.length === 0 &&
      plan?.registration?.isFullyRegistered === false &&
      plan?.registration?.remainingSessionsToRegister === 3,
    plan?.registration
  );
  check("registration.quota khớp gói (limit 3, used 0)", plan?.registration?.quota?.limit === 3 && plan?.registration?.quota?.used === 0, plan?.registration?.quota);

  const coachPlan = await coursePlan(coach.token, cls.classId);
  check(
    "COACH xem course-plan → 200 nhưng registration = null (không lộ dữ liệu hội viên)",
    coachPlan.status === 200 && coachPlan.body?.data?.registration === null,
    { status: coachPlan.status, registration: coachPlan.body?.data?.registration }
  );

  section("2) POST /enrollments/bulk — đăng ký trọn khóa thành công (1 quota cho cả khóa)");
  const bulk = await enrollWholeCourse(member.token, cls.classId);
  check("bulk → HTTP 201", bulk.status === 201, bulk.body);
  const summary = bulk.body?.data?.summary;
  check("summary: enrolledNow = 3, totalSessions = 3, alreadyBooked = 0", summary?.enrolledNow === 3 && summary?.totalSessions === 3 && summary?.alreadyBooked === 0, summary);
  check(
    "sessions[].status = BOOKED cho cả 3 buổi",
    Array.isArray(bulk.body?.data?.sessions) && bulk.body.data.sessions.every((s: any) => s.status === "BOOKED"),
    bulk.body?.data?.sessions
  );
  check("bulk trả quota sau khi ghi (used = 1)", bulk.body?.data?.quota?.used === 1, bulk.body?.data?.quota);
  check("DB: 3 buổi BOOKED", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 3);
  const q1 = await quota(member.token);
  check("Quota: cả khóa chỉ chiếm 1 quota (used 1, remaining 2)", q1.body?.data?.used === 1 && q1.body?.data?.remaining === 2, q1.body?.data);

  const afterPlan = await coursePlan(member.token, cls.classId);
  check("course-plan sau khi đăng ký: isFullyRegistered = true", afterPlan.body?.data?.registration?.isFullyRegistered === true, afterPlan.body?.data?.registration);
  check(
    "course-plan: sessions[].canBook = false + myEnrollmentStatus = BOOKED",
    afterPlan.body?.data?.sessions?.every((s: any) => s.canBook === false && s.myEnrollmentStatus === "BOOKED"),
    afterPlan.body?.data?.sessions
  );

  section("3) Idempotent — gọi lại bulk không lỗi, không tạo trùng");
  const again = await enrollWholeCourse(member.token, cls.classId);
  check("bulk lần 2 → HTTP 201", again.status === 201, again.body);
  check("summary: enrolledNow = 0, alreadyBooked = 3", again.body?.data?.summary?.enrolledNow === 0 && again.body?.data?.summary?.alreadyBooked === 3, again.body?.data?.summary);
  check("DB vẫn đúng 3 buổi BOOKED", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 3);
  check("quota.used vẫn = 1", (await quota(member.token)).body?.data?.used === 1);
}

/** 4) 409 SESSION_FULL — rollback toàn bộ, buổi còn trống cũng không được tạo. */
async function scenarioSessionFullRollback(ctx: Ctx, member: FixtureUser, filler: FixtureUser): Promise<void> {
  section("4) 409 SESSION_FULL — all-or-nothing: không buổi nào được tạo");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const cls = await createClass("S4", [futureSlot(3, 9), futureSlot(10, 9)], { capacity: 1 });
  await prisma.enrollment.create({
    data: { memberId: filler.memberProfileId, classId: cls.classId, scheduleId: cls.scheduleIds[0], status: "BOOKED" },
  });

  const res = await enrollWholeCourse(member.token, cls.classId);
  const details = expectCourseFailure("Bulk khi 1 buổi đã đầy", res, ["SESSION_FULL"]);
  const fullBlocker = details.find((d) => d?.code === "SESSION_FULL");
  check("detail SESSION_FULL trỏ đúng buổi bị đầy", fullBlocker?.sessionId === cls.scheduleIds[0], fullBlocker);
  check("detail SESSION_FULL kèm bookedCount/capacity", fullBlocker?.details?.bookedCount === 1 && fullBlocker?.details?.capacity === 1, fullBlocker);
  check("ROLLBACK: buổi còn trống KHÔNG có enrollment", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 0);
  check("DB: chỉ còn enrollment của filler", (await prisma.enrollment.count({ where: { classId: cls.classId, status: "BOOKED" } })) === 1);
}

/** 5) 409 TIME_CONFLICT — trùng giờ với buổi đã đặt ở Class khác. */
async function scenarioTimeConflictRollback(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("5) 409 TIME_CONFLICT — trùng giờ với buổi đã đặt ở lớp khác");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const slotA = futureSlot(4, 7);
  const slotB = futureSlot(11, 7);
  const cls = await createClass("S5", [slotA, slotB]);
  const other = await createClass("S5-other", [
    { start: new Date(slotA.start.getTime() + 30 * 60 * 1000), end: new Date(slotA.start.getTime() + 90 * 60 * 1000) },
  ]);

  const booked = await book(member.token, other.scheduleIds[0]);
  check("Đặt trước 1 buổi lớp khác (trùng 30 phút) → 201", booked.status === 201, booked.body);

  const res = await enrollWholeCourse(member.token, cls.classId);
  const details = expectCourseFailure("Bulk khi trùng giờ", res, ["TIME_CONFLICT"]);
  const conflict = details.find((d) => d?.code === "TIME_CONFLICT");
  check("TIME_CONFLICT trỏ đúng buổi trùng của khóa mới", conflict?.sessionId === cls.scheduleIds[0], conflict);
  check("TIME_CONFLICT nêu tên lớp đang giữ", conflict?.details?.className === other.className, conflict);
  check("ROLLBACK: lớp mới không có enrollment nào", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 0);
  check("Quota vẫn = 1 (chỉ lớp đặt tay)", (await quota(member.token)).body?.data?.used === 1);
}

/** 6) 409 SUBSCRIPTION_ENDS_BEFORE_COURSE_END — gói không phủ buổi cuối của khóa. */
async function scenarioSubscriptionExpiry(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("6) 409 SUBSCRIPTION_ENDS_BEFORE_COURSE_END — gói hết hạn giữa khóa");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.short5.id);

  const cls = await createClass("S6", [futureSlot(2, 12), futureSlot(4, 12), futureSlot(9, 12)]);
  const res = await enrollWholeCourse(member.token, cls.classId);
  const details = expectCourseFailure("Bulk khi gói hết hạn trước buổi cuối", res, [
    "SUBSCRIPTION_ENDS_BEFORE_COURSE_END",
  ]);
  const blocker = details.find((d) => d?.code === "SUBSCRIPTION_ENDS_BEFORE_COURSE_END");
  check(
    "blocker kèm coveredSessions = 2 / totalSessions = 3 để FE mời gia hạn",
    blocker?.details?.coveredSessions === 2 && blocker?.details?.totalSessions === 3,
    blocker
  );
  check("ROLLBACK: không buổi nào được tạo", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 0);
}

/** 7) 409 CONCURRENT_CLASS_LIMIT_REACHED — vượt quota lớp học song song. */
async function scenarioQuotaLimit(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("7) 409 CONCURRENT_CLASS_LIMIT_REACHED — vượt quota lớp học song song");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership1.id);

  const held = await createClass("S7-held", [futureSlot(3, 15)]);
  const target = await createClass("S7-target", [futureSlot(10, 15), futureSlot(17, 15)]);

  const heldBook = await book(member.token, held.scheduleIds[0]);
  check("Giữ 1 lớp với limit = 1 → 201", heldBook.status === 201, heldBook.body);

  const res = await enrollWholeCourse(member.token, target.classId);
  const details = expectCourseFailure("Bulk lớp thứ 2 khi quota đã đầy", res, [
    "CONCURRENT_CLASS_LIMIT_REACHED",
  ]);
  const blocker = details.find((d) => d?.code === "CONCURRENT_CLASS_LIMIT_REACHED");
  check("blocker kèm limit/used để FE giải thích", blocker?.details?.limit === 1 && blocker?.details?.used === 1, blocker);
  check("ROLLBACK: lớp mới không có buổi nào", (await bookedCountOfClass(member.memberProfileId, target.classId)) === 0);
}

/** 8) 409 PREMIUM_REQUIRED — lớp PREMIUM nhưng gói MEMBERSHIP. */
async function scenarioPremiumRequired(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("8) 409 PREMIUM_REQUIRED — lớp PREMIUM với gói MEMBERSHIP");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const cls = await createClass("S8", [futureSlot(3, 17)], { classType: "PREMIUM" });
  expectCourseFailure("Bulk lớp PREMIUM với gói thường", await enrollWholeCourse(member.token, cls.classId), [
    "PREMIUM_REQUIRED",
  ]);
  check("ROLLBACK: không tạo enrollment", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 0);
}

/** 9) Authorization + STAFF đặt hộ + lớp không còn buổi sắp tới. */
async function scenarioAuthorizationAndEmptyCourse(
  ctx: Ctx,
  member: FixtureUser,
  coach: FixtureUser,
  staff: FixtureUser
): Promise<void> {
  section("9) Authorization + STAFF đặt hộ + lớp không còn buổi sắp tới");
  const cls = await createClass("S9", [futureSlot(6, 11)]);

  const coachRes = await enrollWholeCourse(coach.token, cls.classId);
  check("COACH gọi bulk → 403", coachRes.status === 403, coachRes.body);

  const staffNoMember = await enrollWholeCourse(staff.token, cls.classId);
  check("STAFF thiếu memberId → 400", staffNoMember.status === 400, staffNoMember.body);

  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);
  const staffRes = await enrollWholeCourse(staff.token, cls.classId, member.id);
  check("STAFF đặt hộ (memberId = userId) → 201", staffRes.status === 201, staffRes.body);
  check("DB: buổi của hội viên được tạo", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 1);

  const empty = await createClass("S9-empty", []);
  const planRes = await coursePlan(member.token, empty.classId);
  check("course-plan lớp không có buổi sắp tới → course = null", planRes.body?.data?.course === null, planRes.body?.data?.course);
  check(
    "registration.eligible = false + blocker NO_UPCOMING_SESSION",
    planRes.body?.data?.registration?.eligible === false &&
      planRes.body?.data?.registration?.blockers?.[0]?.code === "NO_UPCOMING_SESSION",
    planRes.body?.data?.registration
  );
  const bulkEmpty = await enrollWholeCourse(member.token, empty.classId);
  check("bulk lớp không có buổi → 400", bulkEmpty.status === 400, bulkEmpty.body);
}

/** 10) Hủy 1 buổi rồi đăng ký lại trọn khóa → buổi đó REACTIVATED (BR-07), không tạo row mới. */
async function scenarioReactivate(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("10) Hủy 1 buổi rồi bulk lại → REACTIVATED, không tạo enrollment trùng");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const cls = await createClass("S10", [futureSlot(3, 20), futureSlot(10, 20)]);
  const first = await enrollWholeCourse(member.token, cls.classId);
  check("Bulk lần đầu → 201 (2 buổi)", first.status === 201 && first.body?.data?.summary?.enrolledNow === 2, first.body?.data?.summary);

  const enrollmentId = first.body?.data?.sessions?.find((s: any) => s.scheduleId === cls.scheduleIds[0])?.enrollmentId as string;
  const cancelled = await cancel(member.token, enrollmentId);
  check("Hủy 1 buổi → 200", cancelled.status === 200, cancelled.body);

  const again = await enrollWholeCourse(member.token, cls.classId);
  check("Bulk lại → 201, enrolledNow = 1", again.status === 201 && again.body?.data?.summary?.enrolledNow === 1, again.body?.data?.summary);
  const reactivated = again.body?.data?.sessions?.find((s: any) => s.scheduleId === cls.scheduleIds[0]);
  check("Buổi đã hủy trả về REACTIVATED cùng enrollmentId", reactivated?.status === "REACTIVATED" && reactivated?.enrollmentId === enrollmentId, reactivated);

  const row = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  check(
    "DB: enrollment quay lại BOOKED và chỉ có 1 row cho buổi đó",
    row?.status === "BOOKED" &&
      (await prisma.enrollment.count({ where: { memberId: member.memberProfileId, scheduleId: cls.scheduleIds[0] } })) === 1
  );
}

/** 11) 409 ATTENDANCE_PENALTY_ACTIVE — hình phạt chuyên cần chặn cả khóa (kể cả preview). */
async function scenarioAttendancePenalty(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("11) 409 ATTENDANCE_PENALTY_ACTIVE — hình phạt chuyên cần chặn đăng ký trọn khóa");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const cls = await createClass("S11", [futureSlot(3, 13), futureSlot(10, 13)]);
  await prisma.attendancePenalty.create({
    data: {
      memberId: member.memberProfileId,
      classId: cls.classId,
      reason: "E2E chuyên cần thấp",
      attendanceRate: 50,
      sampleSize: 4,
      blockedUntil: new Date(Date.now() + 7 * DAY),
      status: "APPLIED",
      decidedAt: new Date(),
    },
  });

  const planRes = await coursePlan(member.token, cls.classId);
  check(
    "course-plan cảnh báo trước: eligible = false + blocker ATTENDANCE_PENALTY_ACTIVE",
    planRes.body?.data?.registration?.eligible === false &&
      planRes.body?.data?.registration?.blockers?.some((b: any) => b?.code === "ATTENDANCE_PENALTY_ACTIVE"),
    planRes.body?.data?.registration
  );

  const res = await enrollWholeCourse(member.token, cls.classId);
  const details = expectCourseFailure("Bulk khi đang bị hình phạt chuyên cần", res, [
    "ATTENDANCE_PENALTY_ACTIVE",
  ]);
  const blocker = details.find((d) => d?.code === "ATTENDANCE_PENALTY_ACTIVE");
  check(
    "blocker kèm attendanceRate/sampleSize/blockedUntil",
    blocker?.details?.attendanceRate === 50 &&
      blocker?.details?.sampleSize === 4 &&
      typeof blocker?.details?.blockedUntil === "string",
    blocker
  );
  check("ROLLBACK: không tạo enrollment", (await bookedCountOfClass(member.memberProfileId, cls.classId)) === 0);
}

// ─── Cleanup + runner ─────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  const memberIds = created.memberProfileIds;
  if (memberIds.length > 0) {
    // Thứ tự theo FK: enrollment/attendance/penalty → invoice → payment → subscription → member.
    await prisma.enrollment.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.attendance.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.attendancePenalty.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.invoice.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.membershipSubscription.deleteMany({ where: { memberId: { in: memberIds } } });
  }
  if (created.classIds.length > 0) {
    // Class cascade ClassSchedule / Enrollment / Attendance / ClassMember.
    await prisma.class.deleteMany({ where: { id: { in: created.classIds } } });
  }
  if (created.roomIds.length > 0) await prisma.room.deleteMany({ where: { id: { in: created.roomIds } } });
  if (created.planIds.length > 0) await prisma.membershipPlan.deleteMany({ where: { id: { in: created.planIds } } });
  if (created.userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
}

async function main(): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`E2E course-enrollment suite — run=${RUN} | api=${baseUrl}/api/v1`);

  const hashed = await hashPassword(PASSWORD);
  try {
    await setupRoom();
    const manager = await createUser("MANAGER", "manager", hashed);
    const coach = await createUser("COACH", "coach", hashed);
    const staff = await createUser("STAFF", "staff", hashed);
    const members: FixtureUser[] = [];
    for (let i = 1; i <= 9; i++) members.push(await createUser("MEMBER", `member${i}`, hashed));
    const filler = await createUser("MEMBER", "filler", hashed);

    const membership3 = await createPlan(manager.token, {
      name: `E2E Course M3 ${RUN}`,
      price: 300000,
      durationDays: 90,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 3,
    });
    const membership1 = await createPlan(manager.token, {
      name: `E2E Course M1 ${RUN}`,
      price: 300000,
      durationDays: 90,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 1,
    });
    const short5 = await createPlan(manager.token, {
      name: `E2E Course Short5 ${RUN}`,
      price: 100000,
      durationDays: 5,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 3,
    });

    const ctx: Ctx = { manager, plans: { membership3, membership1, short5 } };

    await scenarioPlanThenEnroll(ctx, members[0], coach);
    await scenarioSessionFullRollback(ctx, members[1], filler);
    await scenarioTimeConflictRollback(ctx, members[2]);
    await scenarioSubscriptionExpiry(ctx, members[3]);
    await scenarioQuotaLimit(ctx, members[4]);
    await scenarioPremiumRequired(ctx, members[5]);
    await scenarioAuthorizationAndEmptyCourse(ctx, members[6], coach, staff);
    await scenarioReactivate(ctx, members[7]);
    await scenarioAttendancePenalty(ctx, members[8]);
  } catch (err) {
    failures.push(`Lỗi không mong đợi: ${(err as Error).message}`);
    console.error("\nUNEXPECTED ERROR:", err);
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      await cleanup();
      console.log("  Đã dọn sạch fixture E2E.");
    } catch (err) {
      failures.push(`Cleanup thất bại: ${(err as Error).message}`);
      console.error("  Cleanup thất bại:", err);
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log("\n=== KẾT QUẢ ===");
  console.log(`PASS: ${passed} | FAIL: ${failures.length}`);
  if (failures.length > 0) {
    console.log("Các check thất bại:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("Toàn bộ kịch bản đăng ký trọn khóa PASS.");
  }
}

main().catch(async (err) => {
  console.error("Suite lỗi nghiêm trọng:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});





