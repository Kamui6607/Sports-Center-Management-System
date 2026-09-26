/**
 * E2E THẬT (HTTP + PostgreSQL) cho luật quota lớp học song song theo `MembershipPlan.maxConcurrentClasses`.
 *
 * Chạy:  cd BE && npm run test:e2e        (hoặc: npx tsx tests/enrollment-quota.e2e.ts)
 *
 * Nguyên tắc:
 * - Fixture (user / class / schedule / attendance) tạo trực tiếp qua Prisma.
 * - Hành vi nghiệp vụ (đặt chỗ, chuyển buổi, hủy, quota, penalty, CRUD gói) gọi qua HTTP API thật.
 * - Mọi fixture có tiền tố E2E + mã RUN riêng và được dọn sạch ở cuối (kể cả khi test fail).
 *
 * Kịch bản: quota MEMBERSHIP = 3, DISTINCT Class (nhiều buổi cùng Class = 1 quota), cancel,
 * transfer cùng Class, schedule đã bắt đầu/COMPLETED, AttendancePenalty, downgrade
 * (grandfathering), concurrency 2 request, authorization + không rò quota member khác,
 * member không có gói ACTIVE, và backfill của migration.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";
import { ensureActiveFreeSubscription } from "../src/modules/subscriptions/free-subscription.service.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eQuota!2026";
const QUOTA_CODE = "CONCURRENT_CLASS_LIMIT_REACHED";
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
  const email = `e2e-quota-${RUN}-${tag.toLowerCase()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: `E2E Quota ${tag} ${RUN}`,
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
    data: { name: `E2E Quota Room ${RUN}`, capacity: 50, areaType: "INDOOR", location: "E2E" },
  });
  roomId = room.id;
  created.roomIds.push(room.id);
}

/** Slot tương lai KHÔNG chồng giờ với bất kỳ slot nào khác (tránh lỗi trùng giờ khi test quota). */
const FUTURE_BASE = new Date(Date.now() + 3 * DAY);
let slotCursor = 0;

function nextFutureSlot(): { start: Date; end: Date } {
  const start = new Date(FUTURE_BASE.getTime() + slotCursor++ * 90 * 60 * 1000);
  return { start, end: new Date(start.getTime() + HOUR) };
}

async function createClass(
  tag: string,
  scheduleCount: number,
  opts: { capacity?: number; classType?: "REGULAR" | "PREMIUM" } = {}
): Promise<{ classId: string; className: string; scheduleIds: string[] }> {
  const cls = await prisma.class.create({
    data: {
      name: `E2E ${tag} ${RUN}`,
      areaType: "INDOOR",
      capacity: opts.capacity ?? 20,
      classType: opts.classType ?? "REGULAR",
    },
  });
  created.classIds.push(cls.id);

  const scheduleIds: string[] = [];
  for (let i = 0; i < scheduleCount; i++) {
    const { start, end } = nextFutureSlot();
    const schedule = await prisma.classSchedule.create({
      data: { classId: cls.id, roomId, startTime: start, endTime: end, status: "SCHEDULED" },
    });
    scheduleIds.push(schedule.id);
  }
  return { classId: cls.id, className: cls.name, scheduleIds };
}

/** Buổi đã kết thúc trong quá khứ — dùng để dựng dữ liệu chuyên cần / buổi đã hoàn thành. */
async function createPastSchedule(
  classId: string,
  daysAgo: number,
  status: "SCHEDULED" | "COMPLETED" = "COMPLETED"
): Promise<string> {
  const start = new Date(Date.now() - daysAgo * DAY);
  const schedule = await prisma.classSchedule.create({
    data: { classId, roomId, startTime: start, endTime: new Date(start.getTime() + HOUR), status },
  });
  return schedule.id;
}

// ─── API action helpers ───────────────────────────────────────────────────
const book = (token: string, scheduleId: string) =>
  http("POST", "/enrollments", { token, body: { scheduleId } });
const cancel = (token: string, enrollmentId: string) =>
  http("DELETE", `/enrollments/${enrollmentId}`, { token });
const transfer = (token: string, enrollmentId: string, targetScheduleId: string) =>
  http("POST", `/enrollments/${enrollmentId}/transfer`, { token, body: { targetScheduleId } });
const quota = (token: string, query = "") =>
  http("GET", `/enrollments/my/quota${query}`, { token });

function expectQuota(
  label: string,
  res: HttpResult,
  expected: {
    tier: string | null;
    limit: number;
    used: number;
    remaining: number;
    hasActiveSubscription?: boolean;
  }
): void {
  const data = res.body?.data;
  const expectedHasSub = expected.hasActiveSubscription ?? expected.tier !== null;
  check(`${label} → HTTP 200`, res.status === 200, res.body);
  check(
    `${label} → hasActiveSubscription = ${expectedHasSub}`,
    data?.hasActiveSubscription === expectedHasSub,
    data
  );
  check(`${label} → tier = ${String(expected.tier)}`, data?.tier === expected.tier, data);
  check(`${label} → limit = ${expected.limit}`, data?.limit === expected.limit, data);
  check(`${label} → used = ${expected.used} (DISTINCT Class)`, data?.used === expected.used, data);
  check(`${label} → remaining = ${expected.remaining}`, data?.remaining === expected.remaining, data);
  check(
    `${label} → classes.length = ${expected.used}`,
    Array.isArray(data?.classes) && data.classes.length === expected.used,
    data?.classes
  );
  if (expected.tier === null) {
    // Regression: thiếu subscription KHÔNG được trả tier "FREE".
    check(`${label} → KHÔNG trả tier "FREE" khi thiếu subscription`, data?.tier !== "FREE", data);
  }
}

function expectQuotaError(
  label: string,
  res: HttpResult,
  expected: { limit: number; used: number }
): void {
  const errors = res.body?.errors;
  check(`${label} → HTTP 403 (không dùng 409)`, res.status === 403, res.body);
  check(`${label} → errors.code = ${QUOTA_CODE}`, errors?.code === QUOTA_CODE, errors);
  check(`${label} → errors.tier là string`, typeof errors?.tier === "string", errors);
  check(`${label} → errors.limit = ${expected.limit}`, errors?.limit === expected.limit, errors);
  check(`${label} → errors.used = ${expected.used}`, errors?.used === expected.used, errors);
  check(`${label} → errors.remaining = 0`, errors?.remaining === 0, errors);
}

async function createPlan(managerToken: string, payload: Record<string, unknown>): Promise<any> {
  const res = await http("POST", "/membership-plans", { token: managerToken, body: payload });
  if (res.status !== 201) throw new Error(`createPlan failed: ${safe(res)}`);
  created.planIds.push(res.body.data.id);
  return res.body.data;
}

async function subscribe(
  managerToken: string,
  memberProfileId: string,
  planId: string,
  startDate?: Date
): Promise<string> {
  const res = await http("POST", "/subscriptions", {
    token: managerToken,
    body: {
      memberId: memberProfileId,
      planId,
      paymentMethod: "CASH",
      ...(startDate ? { startDate: startDate.toISOString() } : {}),
    },
  });
  if (res.status !== 201) throw new Error(`subscribe failed: ${safe(res)}`);
  return res.body.data.subscription.id as string;
}

/** Đếm DISTINCT Class đang giữ theo ĐÚNG định nghĩa quota (đối chiếu độc lập với API). */
async function distinctFutureBookedClasses(memberProfileId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: {
      memberId: memberProfileId,
      status: "BOOKED",
      schedule: { status: "SCHEDULED", startTime: { gt: new Date() } },
    },
    select: { classId: true },
  });
  return [...new Set(rows.map((r) => r.classId))];
}

const bookedCountOfClass = (memberProfileId: string, classId: string) =>
  prisma.enrollment.count({ where: { memberId: memberProfileId, classId, status: "BOOKED" } });

// ─── Scenarios ────────────────────────────────────────────────────────────
type Ctx = {
  manager: FixtureUser;
  plans: {
    membership3: any;
    membership2: any;
    membership1: any;
    premium6: any;
    long180: any;
  };
};

/** Helper: track user/profile vừa tạo qua API để cleanup. */
function trackCreatedUser(res: HttpResult): { userId?: string; memberProfileId?: string } {
  const userId = res.body?.data?.id as string | undefined;
  const memberProfileId = res.body?.data?.memberProfile?.id as string | undefined;
  if (userId) created.userIds.push(userId);
  if (memberProfileId) created.memberProfileIds.push(memberProfileId);
  return { userId, memberProfileId };
}

/** 0) Migration backfill + MembershipPlan CRUD expose maxConcurrentClasses cho MANAGER. */
async function scenarioPlanConfig(ctx: Ctx): Promise<void> {
  section("0) MembershipPlan.maxConcurrentClasses — migration backfill + CRUD (MANAGER)");

  const plans = await prisma.membershipPlan.findMany({
    select: { id: true, name: true, tier: true, maxConcurrentClasses: true },
  });
  check(
    "Mọi MembershipPlan có maxConcurrentClasses là integer >= 0 (không NULL)",
    plans.length > 0 && plans.every((p) => Number.isInteger(p.maxConcurrentClasses) && p.maxConcurrentClasses >= 0),
    plans
  );
  console.log(`  (info) ${plans.length} plan trong DB — tier:quota = ${safe(plans.map((p) => `${p.tier}:${p.maxConcurrentClasses}`))}`);

  const seeded = new Map(plans.map((p) => [p.id, p]));
  const basic = seeded.get("plan-basic-001");
  const premium = seeded.get("plan-premium-001");
  const seededFree = seeded.get("plan-free-001");
  if (basic) check("Backfill: plan-basic-001 (MEMBERSHIP) = 3", basic.maxConcurrentClasses === 3, basic);
  else console.log("  (info) seed plan-basic-001 không có trong DB — bỏ qua check backfill");
  if (premium) check("Backfill: plan-premium-001 (PREMIUM) = 6", premium.maxConcurrentClasses === 6, premium);

  const freePlans = plans.filter((p) => p.tier === "FREE");
  check(
    "Đúng 1 FREE plan trong hệ thống, quota = 0, không duplicate",
    freePlans.length === 1 && freePlans[0].maxConcurrentClasses === 0,
    freePlans
  );
  if (seededFree) check("Seed FREE plan (plan-free-001) quota = 0", seededFree.maxConcurrentClasses === 0, seededFree);

  // Manager cấu hình lại quota qua PATCH rồi đọc lại.
  const patched = await http("PATCH", `/membership-plans/${ctx.plans.membership1.id}`, {
    token: ctx.manager.token,
    body: { maxConcurrentClasses: 2 },
  });
  check(
    "PATCH /membership-plans/:id { maxConcurrentClasses: 2 } → 200",
    patched.status === 200 && patched.body?.data?.maxConcurrentClasses === 2,
    patched.body
  );
  const detail = await http("GET", `/membership-plans/${ctx.plans.membership1.id}`);
  check("GET /membership-plans/:id trả maxConcurrentClasses = 2", detail.body?.data?.maxConcurrentClasses === 2, detail.body);
  const revert = await http("PATCH", `/membership-plans/${ctx.plans.membership1.id}`, {
    token: ctx.manager.token,
    body: { maxConcurrentClasses: 1 },
  });
  check("PATCH trả quota về 1 (chuẩn bị test limit 1)", revert.body?.data?.maxConcurrentClasses === 1, revert.body);
  const list = await http("GET", "/membership-plans?limit=100");
  check(
    "GET /membership-plans trả maxConcurrentClasses trong list",
    Array.isArray(list.body?.data) && list.body.data.some((p: any) => p.maxConcurrentClasses === 1),
    list.body?.data?.length
  );

  // Validation: âm / không nguyên bị chặn.
  const negative = await http("POST", "/membership-plans", {
    token: ctx.manager.token,
    body: { name: `E2E Invalid Negative ${RUN}`, price: 1000, durationDays: 30, tier: "MEMBERSHIP", maxConcurrentClasses: -1 },
  });
  check("POST quota = -1 → 400 validation", negative.status === 400, negative.body);
  const decimal = await http("POST", "/membership-plans", {
    token: ctx.manager.token,
    body: { name: `E2E Invalid Decimal ${RUN}`, price: 1000, durationDays: 30, tier: "MEMBERSHIP", maxConcurrentClasses: 2.5 },
  });
  check("POST quota = 2.5 → 400 validation (phải là integer)", decimal.status === 400, decimal.body);
}

/** 1) Quota MEMBERSHIP = 3: book A/B/C ok — Class D bị 403 quota. */
async function scenarioMembershipLimit3(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("1) Quota MEMBERSHIP = 3 — Class A/B/C ok, Class D bị 403");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const clsA = await createClass("S1-A", 2);
  const clsB = await createClass("S1-B", 1);
  const clsC = await createClass("S1-C", 1);
  const clsD = await createClass("S1-D", 1);

  const rA = await book(member.token, clsA.scheduleIds[0]);
  const rB = await book(member.token, clsB.scheduleIds[0]);
  const rC = await book(member.token, clsC.scheduleIds[0]);
  check("Book Class A → 201", rA.status === 201, rA.body);
  check("Book Class B → 201", rB.status === 201, rB.body);
  check("Book Class C → 201", rC.status === 201, rC.body);

  expectQuota("Quota sau A/B/C", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 3, remaining: 0,
  });

  const rD = await book(member.token, clsD.scheduleIds[0]);
  expectQuotaError("Book Class D", rD, { limit: 3, used: 3 });
  check("Class D không bị tạo enrollment BOOKED", (await bookedCountOfClass(member.memberProfileId, clsD.classId)) === 0);

  // Class đã giữ: thêm buổi khác TRONG CÙNG Class A vẫn được (quota không tăng).
  const rA2 = await book(member.token, clsA.scheduleIds[1]);
  check("Book buổi 2 của Class A (đã giữ) → 201 dù quota đã đầy", rA2.status === 201, rA2.body);
  expectQuota("Quota sau khi thêm buổi cùng Class A", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 3, remaining: 0,
  });
  check("DB độc lập: DISTINCT Class đang giữ = 3", (await distinctFutureBookedClasses(member.memberProfileId)).length === 3);
}

/** 2) + 3) DISTINCT Class: nhiều buổi cùng Class = 1 quota; transfer cùng Class không đổi quota. */
async function scenarioDistinctClassAndTransfer(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("2) Nhiều buổi cùng Class = 1 quota (limit = 1) & 3) Transfer cùng Class: quota 1 → 1");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership1.id);

  const clsM = await createClass("S2-M", 3);
  const clsN = await createClass("S2-N", 1);

  const rM1 = await book(member.token, clsM.scheduleIds[0]);
  check("Book M1 → 201", rM1.status === 201, rM1.body);
  expectQuota("Quota sau M1", await quota(member.token), { tier: "MEMBERSHIP", limit: 1, used: 1, remaining: 0 });

  const rM2 = await book(member.token, clsM.scheduleIds[1]);
  check("Book M2 (cùng Class M, khác buổi) → 201", rM2.status === 201, rM2.body);
  expectQuota("Quota sau M1 + M2 (cùng Class)", await quota(member.token), { tier: "MEMBERSHIP", limit: 1, used: 1, remaining: 0 });
  check(
    "DB: Class M có 2 buổi BOOKED nhưng quota vẫn = 1",
    (await bookedCountOfClass(member.memberProfileId, clsM.classId)) === 2
  );
  const qM = await quota(member.token);
  check(
    "classes trả đủ field cho FE (classId/className/futureBookedScheduleCount/scheduleId/scheduleStartTime/enrollmentId)",
    qM.body?.data?.classes?.length === 1 &&
      qM.body.data.classes[0].classId === clsM.classId &&
      typeof qM.body.data.classes[0].className === "string" &&
      typeof qM.body.data.classes[0].futureBookedScheduleCount === "number" &&
      typeof qM.body.data.classes[0].scheduleId === "string" &&
      typeof qM.body.data.classes[0].scheduleStartTime === "string" &&
      typeof qM.body.data.classes[0].enrollmentId === "string",
    qM.body?.data?.classes
  );
  check(
    "classes[0].futureBookedScheduleCount = 2 (2 buổi cùng Class, used vẫn 1)",
    qM.body?.data?.classes?.[0]?.futureBookedScheduleCount === 2 && qM.body?.data?.used === 1,
    qM.body?.data?.classes?.[0]
  );

  const rN = await book(member.token, clsN.scheduleIds[0]);
  expectQuotaError("Book Class N khi quota đã đầy", rN, { limit: 1, used: 1 });

  const tr = await transfer(member.token, rM1.body.data.id, clsM.scheduleIds[2]);
  check("Transfer M1 → M3 (cùng Class) → 200", tr.status === 200, tr.body);
  expectQuota("Quota sau transfer (1 → 1)", await quota(member.token), { tier: "MEMBERSHIP", limit: 1, used: 1, remaining: 0 });
  const qAfterTransfer = await quota(member.token);
  check(
    "Transfer vẫn giữ đúng Class M",
    qAfterTransfer.body?.data?.classes?.[0]?.classId === clsM.classId,
    qAfterTransfer.body?.data?.classes
  );
  check(
    "DB: M1 = CANCELLED, M3 = BOOKED",
    (await prisma.enrollment.findUnique({ where: { id: rM1.body.data.id } }))?.status === "CANCELLED" &&
      (await prisma.enrollment.count({ where: { memberId: member.memberProfileId, scheduleId: clsM.scheduleIds[2], status: "BOOKED" } })) === 1
  );
  const rN2 = await book(member.token, clsN.scheduleIds[0]);
  expectQuotaError("Sau transfer vẫn không book được Class N (transfer không trả quota)", rN2, { limit: 1, used: 1 });

  // §14: cancel MỘT trong nhiều buổi cùng Class → Class vẫn còn buổi tương lai → quota GIỮ NGUYÊN.
  const cancelM3 = await cancel(member.token, tr.body.data.id);
  check("Cancel M3 (Class M vẫn còn M2 future BOOKED) → 200", cancelM3.status === 200, cancelM3.body);
  expectQuota("Quota sau cancel M3", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 1, used: 1, remaining: 0,
  });
  check(
    "Class M vẫn còn 1 buổi tương lai BOOKED (M2)",
    (await bookedCountOfClass(member.memberProfileId, clsM.classId)) === 1
  );

  // Cancel buổi CUỐI của Class M → quota giảm và Class N mới book được.
  const cancelM2 = await cancel(member.token, rM2.body.data.id);
  check("Cancel M2 (buổi cuối của Class M) → 200", cancelM2.status === 200, cancelM2.body);
  expectQuota("Quota sau khi Class M hết buổi tương lai", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 1, used: 0, remaining: 1,
  });
  const bookNAfterFree = await book(member.token, clsN.scheduleIds[0]);
  check("Book Class N sau khi giải phóng quota → 201", bookNAfterFree.status === 201, bookNAfterFree.body);
}

/** 4) Cancel: BOOKED → CANCELLED làm giảm `used` và mở lại quota. */
async function scenarioCancel(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("4) Cancel Class B → used 3 → 2 → book thêm Class D được");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const clsA = await createClass("S4-A", 1);
  const clsB = await createClass("S4-B", 1);
  const clsC = await createClass("S4-C", 1);
  const clsD = await createClass("S4-D", 1);

  const rA = await book(member.token, clsA.scheduleIds[0]);
  const rB = await book(member.token, clsB.scheduleIds[0]);
  const rC = await book(member.token, clsC.scheduleIds[0]);
  check("Book A/B/C → 201", [rA, rB, rC].every((r) => r.status === 201), [rA.status, rB.status, rC.status]);
  check("DB: 3 DISTINCT Class đang giữ", (await distinctFutureBookedClasses(member.memberProfileId)).length === 3);

  const cB = await cancel(member.token, rB.body.data.id);
  check("Cancel Class B → 200", cB.status === 200, cB.body);
  expectQuota("Quota sau cancel B", await quota(member.token), { tier: "MEMBERSHIP", limit: 3, used: 2, remaining: 1 });

  const rD = await book(member.token, clsD.scheduleIds[0]);
  check("Book Class D sau khi giải phóng quota → 201", rD.status === 201, rD.body);
  expectQuota("Quota sau khi book D", await quota(member.token), { tier: "MEMBERSHIP", limit: 3, used: 3, remaining: 0 });
}

/** 5) Buổi đã bắt đầu / COMPLETED không tính quota; Class còn buổi tương lai BOOKED vẫn tính 1. */
async function scenarioPastAndCompleted(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("5) Schedule đã bắt đầu / COMPLETED không tính quota");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership2.id);

  // Class A: 1 buổi quá khứ (COMPLETED, enrollment BOOKED) + 1 buổi tương lai BOOKED → vẫn count 1.
  const clsA = await createClass("S5-A", 1);
  const pastA = await createPastSchedule(clsA.classId, 2, "COMPLETED");
  await prisma.enrollment.create({
    data: { memberId: member.memberProfileId, classId: clsA.classId, scheduleId: pastA, status: "BOOKED" },
  });
  const bookA = await book(member.token, clsA.scheduleIds[0]);
  check("Class A: book buổi tương lai → 201", bookA.status === 201, bookA.body);

  // Class C: chỉ có buổi COMPLETED + enrollment COMPLETED → không tính.
  const clsC = await createClass("S5-C", 0);
  const pastC = await createPastSchedule(clsC.classId, 3, "COMPLETED");
  await prisma.enrollment.create({
    data: { memberId: member.memberProfileId, classId: clsC.classId, scheduleId: pastC, status: "COMPLETED" },
  });

  // Class E: buổi đã BẮT ĐẦU nhưng schedule còn SCHEDULED, enrollment BOOKED → không tính.
  const clsE = await createClass("S5-E", 0);
  const pastE = await createPastSchedule(clsE.classId, 4, "SCHEDULED");
  await prisma.enrollment.create({
    data: { memberId: member.memberProfileId, classId: clsE.classId, scheduleId: pastE, status: "BOOKED" },
  });

  expectQuota("Quota chỉ tính Class A (còn buổi tương lai)", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 2, used: 1, remaining: 1,
  });
  const q1 = await quota(member.token);
  check(
    "classes chỉ gồm Class A (không có C/E)",
    q1.body?.data?.classes?.length === 1 && q1.body.data.classes[0].classId === clsA.classId,
    q1.body?.data?.classes
  );

  const clsF = await createClass("S5-F", 1);
  const rF = await book(member.token, clsF.scheduleIds[0]);
  check("Book Class F (còn 1 slot) → 201", rF.status === 201, rF.body);
  expectQuota("Quota sau F", await quota(member.token), { tier: "MEMBERSHIP", limit: 2, used: 2, remaining: 0 });

  const clsG = await createClass("S5-G", 1);
  expectQuotaError("Book Class G → 403 quota", await book(member.token, clsG.scheduleIds[0]), { limit: 2, used: 2 });

  // Class A hết buổi tương lai → không còn được tính (dù vẫn còn enrollment quá khứ BOOKED).
  const cancelA = await cancel(member.token, bookA.body.data.id);
  check("Cancel buổi tương lai của Class A → 200", cancelA.status === 200, cancelA.body);
  expectQuota("Quota sau khi Class A hết buổi tương lai", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 2, used: 1, remaining: 1,
  });
  const q2 = await quota(member.token);
  check("classes chuyển sang Class F", q2.body?.data?.classes?.[0]?.classId === clsF.classId, q2.body?.data?.classes);
}

/** 6) AttendancePenalty: thu hồi chỗ của Class A làm giảm quota; Class khác vẫn book bình thường. */
async function scenarioPenalty(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("6) AttendancePenalty: Class A bị thu hồi → used giảm; Class A vẫn block, Class khác book được");
  // Gói phủ cả quá khứ (để chuyên cần được tính) lẫn tương lai (để đặt lớp).
  const coveredFrom = new Date(Date.now() - 60 * DAY);
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.long180.id, coveredFrom);

  const clsP = await createClass("S6-P", 1);
  const clsQ = await createClass("S6-Q", 1);
  const clsR = await createClass("S6-R", 1);

  // 5 buổi quá khứ của Class P: enrollment BOOKED + điểm danh ABSENT (rate 0% < 70%, sample = 5).
  for (let i = 0; i < 5; i++) {
    const past = await createPastSchedule(clsP.classId, 5 + i, "COMPLETED");
    await prisma.enrollment.create({
      data: { memberId: member.memberProfileId, classId: clsP.classId, scheduleId: past, status: "BOOKED" },
    });
    await prisma.attendance.create({
      data: { scheduleId: past, memberId: member.memberProfileId, status: "ABSENT" },
    });
  }

  const bookP = await book(member.token, clsP.scheduleIds[0]);
  const bookQ = await book(member.token, clsQ.scheduleIds[0]);
  check("Book Class P (buổi tương lai) → 201", bookP.status === 201, bookP.body);
  check("Book Class Q → 201", bookQ.status === 201, bookQ.body);
  expectQuota("Quota trước penalty (P + Q)", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 2, remaining: 1,
  });

  const apply = await http("POST", "/attendance/penalties/apply", {
    token: ctx.manager.token,
    body: { memberId: member.memberProfileId, classId: clsP.classId, reason: "E2E quota penalty test" },
  });
  check("MANAGER apply penalty cho Class P → 200", apply.status === 200, apply.body);
  check("Penalty thu hồi đúng 1 chỗ tương lai của Class P", apply.body?.data?.releasedCount === 1, apply.body?.data);

  expectQuota("Quota sau penalty (Class P bị cancel)", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 1, remaining: 2,
  });
  const qAfterPenalty = await quota(member.token);
  check(
    "Class P không còn trong quota",
    qAfterPenalty.body?.data?.classes?.every((c: any) => c.classId !== clsP.classId),
    qAfterPenalty.body?.data?.classes
  );

  // Đặt lại đúng buổi của Class P: bị chặn bởi penalty (KHÔNG phải quota).
  const rebookP = await book(member.token, clsP.scheduleIds[0]);
  check("Đặt lại Class P → 403 do penalty đang hiệu lực", rebookP.status === 403, rebookP.body);
  check("403 này KHÔNG phải lỗi quota", rebookP.body?.errors?.code !== QUOTA_CODE, rebookP.body?.errors);
  check("Thông báo nêu rõ đang bị tạm khoá", String(rebookP.body?.message ?? "").includes("tạm khoá"), rebookP.body?.message);

  // Class khác vẫn đặt được nếu quota cho phép (penalty không ăn quota của Class khác).
  const bookR = await book(member.token, clsR.scheduleIds[0]);
  check("Book Class R (Class khác) → 201", bookR.status === 201, bookR.body);
  expectQuota("Quota sau khi book R", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 2, remaining: 1,
  });
}

/** 7) Downgrade PREMIUM (6) → MEMBERSHIP (3): không tự hủy lớp đang giữ, chỉ chặn book mới. */
async function scenarioDowngrade(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("7) Downgrade 6 → 3 (grandfathering): không hủy lớp cũ, chặn book Class mới tới khi used < limit");
  const subscriptionId = await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.premium6.id);

  const classes: { classId: string; scheduleIds: string[] }[] = [];
  for (let i = 1; i <= 7; i++) classes.push(await createClass(`S7-G${i}`, 1));

  const enrollments: HttpResult[] = [];
  for (let i = 0; i < 6; i++) enrollments.push(await book(member.token, classes[i].scheduleIds[0]));
  check("Book đủ 6 Class với gói PREMIUM (limit 6) → 201 hết", enrollments.every((r) => r.status === 201), enrollments.map((r) => r.status));
  expectQuota("Quota trước downgrade", await quota(member.token), { tier: "PREMIUM", limit: 6, used: 6, remaining: 0 });

  // "Đổi gói" ở tầng dữ liệu (luồng mua gói hiện tại chặn downgrade): plan ACTIVE thành MEMBERSHIP limit 3.
  await prisma.membershipSubscription.update({
    where: { id: subscriptionId },
    data: { planId: ctx.plans.membership3.id, tier: "MEMBERSHIP" },
  });

  expectQuota("Quota sau downgrade (used > limit, không auto-cancel)", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 6, remaining: 0,
  });
  check(
    "6 enrollment cũ vẫn BOOKED (grandfathering)",
    (await prisma.enrollment.count({ where: { memberId: member.memberProfileId, status: "BOOKED" } })) === 6
  );

  expectQuotaError("Book Class G7 khi used = 6 > limit = 3", await book(member.token, classes[6].scheduleIds[0]), { limit: 3, used: 6 });

  await cancel(member.token, enrollments[5].body.data.id); // G6
  expectQuota("Cancel G6 → used 5", await quota(member.token), { tier: "MEMBERSHIP", limit: 3, used: 5, remaining: 0 });
  expectQuotaError("Book G7 khi used = 5", await book(member.token, classes[6].scheduleIds[0]), { limit: 3, used: 5 });

  await cancel(member.token, enrollments[4].body.data.id); // G5
  await cancel(member.token, enrollments[3].body.data.id); // G4
  expectQuota("Cancel G5 + G4 → used 3", await quota(member.token), { tier: "MEMBERSHIP", limit: 3, used: 3, remaining: 0 });
  expectQuotaError("Book G7 khi used = 3 = limit", await book(member.token, classes[6].scheduleIds[0]), { limit: 3, used: 3 });

  await cancel(member.token, enrollments[2].body.data.id); // G3
  expectQuota("Cancel G3 → used 2, remaining 1", await quota(member.token), { tier: "MEMBERSHIP", limit: 3, used: 2, remaining: 1 });
  const bookG7 = await book(member.token, classes[6].scheduleIds[0]);
  check("Book G7 khi used = 2 < limit → 201", bookG7.status === 201, bookG7.body);
  expectQuota("Quota sau khi book G7", await quota(member.token), { tier: "MEMBERSHIP", limit: 3, used: 3, remaining: 0 });
}

/** 8) Concurrency: 2 request đồng thời của cùng member chỉ 1 request được dùng slot quota cuối. */
async function scenarioConcurrency(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("8) Concurrency: used = 2, limit = 3 → 2 request song song, đúng 1 thắng");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);

  const cls1 = await createClass("S8-C1", 1);
  const cls2 = await createClass("S8-C2", 1);
  const cls3 = await createClass("S8-C3", 1);
  const cls4 = await createClass("S8-C4", 1);

  const b1 = await book(member.token, cls1.scheduleIds[0]);
  const b2 = await book(member.token, cls2.scheduleIds[0]);
  check("Book 2 Class đầu → 201", b1.status === 201 && b2.status === 201, [b1.status, b2.status]);
  expectQuota("Quota trước khi bắn 2 request song song", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 2, remaining: 1,
  });

  const [r1, r2] = await Promise.all([
    book(member.token, cls3.scheduleIds[0]),
    book(member.token, cls4.scheduleIds[0]),
  ]);
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  check("Song song: đúng 1 request 201 (thắng) + 1 request 403 (thua)", statuses[0] === 201 && statuses[1] === 403, statuses);
  const loser = r1.status === 403 ? r1 : r2;
  expectQuotaError("Request thua", loser, { limit: 3, used: 3 });

  const after = await quota(member.token);
  check("Sau transaction: used = 3 và used <= limit", after.body?.data?.used === 3 && after.body.data.used <= after.body.data.limit, after.body?.data);
  check(
    "DB độc lập: DISTINCT Class đang giữ = 3 (không bao giờ thành 4)",
    (await distinctFutureBookedClasses(member.memberProfileId)).length === 3
  );
}

/** 9) Authorization: quota là dữ liệu riêng của MEMBER, không rò sang member khác. */
async function scenarioAuthorization(
  ctx: Ctx,
  member: FixtureUser,
  other: FixtureUser,
  coach: FixtureUser,
  staff: FixtureUser
): Promise<void> {
  section("9) Authorization GET /enrollments/my/quota + không rò quota member khác");
  await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.membership3.id);
  const cls = await createClass("S9-A", 1);
  const b = await book(member.token, cls.scheduleIds[0]);
  check("Member book 1 Class → 201", b.status === 201, b.body);

  // Member khác có Class riêng, để chắc chắn không bị lộ sang nhau.
  await subscribe(ctx.manager.token, other.memberProfileId, ctx.plans.membership3.id);
  const otherCls = await createClass("S9-B", 1);
  await book(other.token, otherCls.scheduleIds[0]);

  const mine = await quota(member.token);
  expectQuota("Member xem quota của mình", mine, { tier: "MEMBERSHIP", limit: 3, used: 1, remaining: 2 });
  check(
    "Chỉ trả Class của chính member",
    mine.body?.data?.classes?.length === 1 && mine.body.data.classes[0].classId === cls.classId,
    mine.body?.data?.classes
  );

  check("COACH → 403", (await quota(coach.token)).status === 403);
  check("STAFF → 403", (await quota(staff.token)).status === 403);
  check("MANAGER → 403 (giữ convention /enrollments/my là MEMBER-only)", (await quota(ctx.manager.token)).status === 403);
  check("Không token → 401", (await http("GET", "/enrollments/my/quota")).status === 401);

  // Truyền memberId của member khác: endpoint bỏ qua tham số, vẫn trả quota của chính mình.
  const spoof = await quota(member.token, `?memberId=${other.memberProfileId}`);
  const spoofClassIds = (spoof.body?.data?.classes ?? []).map((c: any) => c.classId);
  check(
    "?memberId=<member khác> → vẫn chỉ trả quota của chính mình",
    spoofClassIds.length === 1 && spoofClassIds[0] === cls.classId,
    spoof.body?.data
  );
  check("Quota của member khác không xuất hiện trong response", !spoofClassIds.includes(otherCls.classId), spoofClassIds);

  // MEMBER không được tự sửa MembershipPlan.
  const memberPatch = await http("PATCH", `/membership-plans/${ctx.plans.membership3.id}`, {
    token: member.token,
    body: { maxConcurrentClasses: 99 },
  });
  check("MEMBER PATCH /membership-plans/:id → 403", memberPatch.status === 403, memberPatch.body);
  const memberPost = await http("POST", "/membership-plans", {
    token: member.token,
    body: { name: `E2E Hack ${RUN}`, price: 1000, durationDays: 30, tier: "MEMBERSHIP", maxConcurrentClasses: 99 },
  });
  check("MEMBER POST /membership-plans → 403", memberPost.status === 403, memberPost.body);
  const planNow = await prisma.membershipPlan.findUnique({ where: { id: ctx.plans.membership3.id } });
  check("Quota gói MEMBERSHIP vẫn = 3 sau khi MEMBER thử sửa", planNow?.maxConcurrentClasses === 3, planNow?.maxConcurrentClasses);
}

/** 10) Không có MembershipSubscription ACTIVE: limit = 0, remaining = 0 (không đổi logic subscription). */
async function scenarioNoActiveSubscription(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("10) Member không có gói ACTIVE → limit = 0, remaining = 0");
  const subscriptionId = await subscribe(ctx.manager.token, member.memberProfileId, ctx.plans.long180.id);
  expectQuota("Quota khi còn gói ACTIVE", await quota(member.token), {
    tier: "MEMBERSHIP", limit: 3, used: 0, remaining: 3,
  });

  const cls = await createClass("S10-A", 1);
  const rBook = await book(member.token, cls.scheduleIds[0]);
  check("Book Class khi còn gói → 201", rBook.status === 201, rBook.body);

  // Gói rời khỏi ACTIVE (SUSPENDED) nhưng booking tương lai vẫn còn (không flow nào auto-cancel ở đây).
  await prisma.membershipSubscription.update({
    where: { id: subscriptionId },
    data: { status: "SUSPENDED", suspendedAt: new Date() },
  });

  expectQuota("Quota khi KHÔNG còn subscription ACTIVE", await quota(member.token), {
    tier: null, limit: 0, used: 1, remaining: 0,
  });
  const after = await quota(member.token);
  check(
    "hasActiveSubscription = false + tier = null (KHÔNG dùng FREE)",
    after.body?.data?.hasActiveSubscription === false && after.body?.data?.tier === null,
    after.body?.data
  );
  check(
    "Class vẫn được liệt kê (used của member), chỉ limit về 0",
    after.body?.data?.classes?.[0]?.classId === cls.classId,
    after.body?.data?.classes
  );
}

/** 11) PATCH MembershipPlan: đổi `tier` KHÔNG tự đổi quota (config per plan, không derived từ tier). */
async function scenarioPlanPatchSemantics(ctx: Ctx): Promise<void> {
  section("11) PATCH /membership-plans/:id — tier đổi nhưng maxConcurrentClasses giữ nguyên");

  const plan = await createPlan(ctx.manager.token, {
    name: `E2E TierPatch ${RUN}`,
    price: 300000,
    durationDays: 30,
    tier: "MEMBERSHIP",
    maxConcurrentClasses: 3,
  });
  check("Tạo plan MEMBERSHIP + quota 3", plan.tier === "MEMBERSHIP" && plan.maxConcurrentClasses === 3, plan);

  const tierOnly = await http("PATCH", `/membership-plans/${plan.id}`, {
    token: ctx.manager.token,
    body: { tier: "PREMIUM" },
  });
  check("PATCH { tier: PREMIUM } → 200", tierOnly.status === 200, tierOnly.body);
  check("tier → PREMIUM", tierOnly.body?.data?.tier === "PREMIUM", tierOnly.body?.data);
  check(
    "quota GIỮ NGUYÊN 3 (regression: không tự đổi 3 → 6)",
    tierOnly.body?.data?.maxConcurrentClasses === 3,
    tierOnly.body?.data
  );
  const reread = await http("GET", `/membership-plans/${plan.id}`);
  check("GET lại plan: quota vẫn 3", reread.body?.data?.maxConcurrentClasses === 3, reread.body?.data);

  const both = await http("PATCH", `/membership-plans/${plan.id}`, {
    token: ctx.manager.token,
    body: { tier: "PREMIUM", maxConcurrentClasses: 6 },
  });
  check(
    "PATCH { tier: PREMIUM, maxConcurrentClasses: 6 } → update CẢ HAI",
    both.status === 200 && both.body?.data?.tier === "PREMIUM" && both.body?.data?.maxConcurrentClasses === 6,
    both.body?.data
  );

  const backTier = await http("PATCH", `/membership-plans/${plan.id}`, {
    token: ctx.manager.token,
    body: { tier: "MEMBERSHIP" },
  });
  check(
    "PATCH tier về MEMBERSHIP → quota vẫn 6 (không bị kéo về 3)",
    backTier.body?.data?.tier === "MEMBERSHIP" && backTier.body?.data?.maxConcurrentClasses === 6,
    backTier.body?.data
  );

  const explicit = await createPlan(ctx.manager.token, {
    name: `E2E Explicit4 ${RUN}`,
    price: 300000,
    durationDays: 30,
    tier: "PREMIUM",
    maxConcurrentClasses: 4,
  });
  check("CREATE PREMIUM + explicit 4 → 4 (default 6 không ghi đè explicit)", explicit.maxConcurrentClasses === 4, explicit);
}

/** 12) Auto FREE subscription: register + manager tạo MEMBER + idempotent + không cấp cho role khác. */
async function scenarioAccountProvisioning(ctx: Ctx): Promise<void> {
  section("12) Auto FREE subscription cho Member mới (register / manager tạo user) + idempotent");

  // --- 12a) Register qua API thật ---
  const email = `e2e-quota-${RUN}-newbie@example.com`;
  const reg = await http("POST", "/auth/register", {
    body: { email, password: PASSWORD, fullName: `E2E Newbie ${RUN}` },
  });
  check("POST /auth/register → 201", reg.status === 201, reg.body);
  const { memberProfileId: newProfileId } = trackCreatedUser(reg);
  check("MemberProfile được tạo cùng account", Boolean(newProfileId), reg.body?.data);

  const subs = await prisma.membershipSubscription.findMany({
    where: { memberId: newProfileId },
    include: { plan: true },
  });
  check("Member mới có đúng 1 subscription", subs.length === 1, subs.length);
  check("Subscription status = ACTIVE", subs[0]?.status === "ACTIVE", subs[0]);
  check("Subscription tier = FREE", subs[0]?.tier === "FREE", subs[0]?.tier);
  check("Plan của subscription có tier FREE", subs[0]?.plan?.tier === "FREE", subs[0]?.plan);
  check("Plan FREE có maxConcurrentClasses = 0", subs[0]?.plan?.maxConcurrentClasses === 0, subs[0]?.plan);

  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const token = login.body?.data?.accessToken as string | undefined;
  check("Login account mới → 200 có accessToken", login.status === 200 && Boolean(token), login.body);

  expectQuota("Quota member mới (FREE)", await quota(token!), {
    tier: "FREE", limit: 0, used: 0, remaining: 0, hasActiveSubscription: true,
  });

  const cls = await createClass("S12-A", 1);
  const bookFree = await book(token!, cls.scheduleIds[0]);
  expectQuotaError("Member FREE book Class → 403 quota", bookFree, { limit: 0, used: 0 });
  check("403 của member FREE có errors.tier = FREE (không phải null)", bookFree.body?.errors?.tier === "FREE", bookFree.body?.errors);

  // --- 12b) Idempotent: provisioning chạy lại (kể cả 2 lần song song) không tạo duplicate ---
  const rerun = await Promise.all([
    prisma.$transaction((tx) => ensureActiveFreeSubscription(tx, newProfileId!)),
    prisma.$transaction((tx) => ensureActiveFreeSubscription(tx, newProfileId!)),
  ]);
  check(
    "ensureActiveFreeSubscription chạy lại → created = false (không tạo thêm)",
    rerun.every((r) => r.created === false),
    rerun.map((r) => r.created)
  );
  check(
    "Vẫn đúng 1 subscription ACTIVE cho member",
    (await prisma.membershipSubscription.count({ where: { memberId: newProfileId, status: "ACTIVE" } })) === 1
  );

  // --- 12c) MANAGER tạo MEMBER qua POST /users cũng được auto-provision ---
  const managerMade = await http("POST", "/users", {
    token: ctx.manager.token,
    body: {
      email: `e2e-quota-${RUN}-staffmade@example.com`,
      password: PASSWORD,
      fullName: `E2E StaffMade ${RUN}`,
      role: "MEMBER",
    },
  });
  check("MANAGER POST /users (role MEMBER) → 201", managerMade.status === 201, managerMade.body);
  const { memberProfileId: managerMadeProfileId } = trackCreatedUser(managerMade);
  const sub2 = await prisma.membershipSubscription.findFirst({
    where: { memberId: managerMadeProfileId },
    include: { plan: true },
  });
  check(
    "Member do manager tạo cũng có ACTIVE FREE subscription (quota 0)",
    sub2?.status === "ACTIVE" && sub2?.plan?.tier === "FREE" && sub2?.plan?.maxConcurrentClasses === 0,
    sub2
  );

  // --- 12d) COACH / STAFF / MANAGER KHÔNG được cấp subscription ---
  const coachCreated = await http("POST", "/users", {
    token: ctx.manager.token,
    body: { email: `e2e-quota-${RUN}-newcoach@example.com`, password: PASSWORD, fullName: `E2E NewCoach ${RUN}`, role: "COACH" },
  });
  const staffCreated = await http("POST", "/users", {
    token: ctx.manager.token,
    body: { email: `e2e-quota-${RUN}-newstaff@example.com`, password: PASSWORD, fullName: `E2E NewStaff ${RUN}`, role: "STAFF" },
  });
  const managerCreated = await http("POST", "/users", {
    token: ctx.manager.token,
    body: { email: `e2e-quota-${RUN}-newmanager@example.com`, password: PASSWORD, fullName: `E2E NewManager ${RUN}`, role: "MANAGER" },
  });
  const coachTracked = trackCreatedUser(coachCreated);
  const staffTracked = trackCreatedUser(staffCreated);
  const managerTracked = trackCreatedUser(managerCreated);
  check("POST /users COACH → 201, không có memberProfile", coachCreated.status === 201 && !coachCreated.body?.data?.memberProfile, coachCreated.body?.data);
  for (const [label, tracked] of [
    ["COACH", coachTracked],
    ["STAFF", staffTracked],
    ["MANAGER", managerTracked],
  ] as const) {
    const count = await prisma.membershipSubscription.count({ where: { member: { userId: tracked.userId } } });
    check(`${label} không được auto-cấp subscription`, count === 0, count);
  }

  // --- 12e) Không duplicate FREE plan ---
  const freePlans = await prisma.membershipPlan.findMany({ where: { tier: "FREE" } });
  check("Toàn hệ thống chỉ có 1 FREE plan", freePlans.length === 1, freePlans.map((p) => p.id));
  check("FREE plan có maxConcurrentClasses = 0", freePlans[0]?.maxConcurrentClasses === 0, freePlans[0]);
}

/**
 * 13) GET /members/:id/membership-status — `effectiveTier` nhất quán với GET /enrollments/my/quota:
 * ACTIVE FREE → "FREE"; ACTIVE MEMBERSHIP → "MEMBERSHIP"; ACTIVE PREMIUM → "PREMIUM";
 * KHÔNG có ACTIVE subscription → null (KHÔNG dùng "FREE" để đại diện).
 */
async function scenarioMembershipStatusConsistency(ctx: Ctx): Promise<void> {
  section("13) membership-status.effectiveTier nhất quán với quota.tier (FREE / null / MEMBERSHIP / PREMIUM)");

  const statusOf = (memberId: string) =>
    http("GET", `/members/${memberId}/membership-status`, { token: ctx.manager.token });

  const registerAndLogin = async (tag: string) => {
    const email = `e2e-quota-${RUN}-${tag}@example.com`;
    const reg = await http("POST", "/auth/register", {
      body: { email, password: PASSWORD, fullName: `E2E Status ${tag} ${RUN}` },
    });
    if (reg.status !== 201) throw new Error(`register ${tag} failed: ${safe(reg)}`);
    const { memberProfileId } = trackCreatedUser(reg);
    const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
    const token = login.body?.data?.accessToken as string | undefined;
    if (!token || !memberProfileId) throw new Error(`login ${tag} failed: ${safe(login)}`);
    return { memberProfileId, token };
  };

  // --- A) ACTIVE FREE (auto-provision khi đăng ký) ---
  const free = await registerAndLogin("statusfree");
  const freeStatus = await statusOf(free.memberProfileId);
  check(
    'A) FREE ACTIVE → membership-status.effectiveTier = "FREE"',
    freeStatus.status === 200 && freeStatus.body?.data?.effectiveTier === "FREE",
    freeStatus.body?.data
  );
  check(
    "A) activeSubscription.plan.tier = FREE + daysRemaining > 0",
    freeStatus.body?.data?.activeSubscription?.plan?.tier === "FREE" &&
      typeof freeStatus.body?.data?.daysRemaining === "number" &&
      freeStatus.body.data.daysRemaining > 0,
    freeStatus.body?.data
  );
  const freeQuota = await quota(free.token);
  expectQuota("A) quota member FREE", freeQuota, {
    tier: "FREE", limit: 0, used: 0, remaining: 0, hasActiveSubscription: true,
  });
  check(
    "A) membership-status.effectiveTier === quota.tier (FREE)",
    freeStatus.body?.data?.effectiveTier === freeQuota.body?.data?.tier,
    { status: freeStatus.body?.data?.effectiveTier, quotaTier: freeQuota.body?.data?.tier }
  );

  // --- B) KHÔNG có ACTIVE subscription (fixture tạo qua Prisma, không provisioning) ---
  const hashed = await hashPassword(PASSWORD);
  const noSub = await createUser("MEMBER", "statusnosub", hashed);
  const noSubStatus = await statusOf(noSub.memberProfileId);
  check(
    'B) Không có gói ACTIVE → effectiveTier = null (KHÔNG phải "FREE")',
    noSubStatus.status === 200 && noSubStatus.body?.data?.effectiveTier === null,
    noSubStatus.body?.data
  );
  check(
    "B) activeSubscription = null + daysRemaining = null",
    noSubStatus.body?.data?.activeSubscription === null && noSubStatus.body?.data?.daysRemaining === null,
    noSubStatus.body?.data
  );
  const noSubQuota = await quota(noSub.token);
  check(
    "B) quota.hasActiveSubscription = false + quota.tier = null",
    noSubQuota.body?.data?.hasActiveSubscription === false && noSubQuota.body?.data?.tier === null,
    noSubQuota.body?.data
  );
  expectQuota("B) quota member không gói", noSubQuota, {
    tier: null, limit: 0, used: 0, remaining: 0, hasActiveSubscription: false,
  });

  // --- C) ACTIVE MEMBERSHIP ---
  const membershipPlan = await createPlan(ctx.manager.token, {
    name: `E2E StatusMembership ${RUN}`,
    price: 300000,
    durationDays: 30,
    tier: "MEMBERSHIP",
    maxConcurrentClasses: 3,
  });
  const memberC = await registerAndLogin("statusmembership");
  await subscribe(ctx.manager.token, memberC.memberProfileId, membershipPlan.id);
  const statusC = await statusOf(memberC.memberProfileId);
  const quotaC = await quota(memberC.token);
  check(
    "C) ACTIVE MEMBERSHIP → membership-status.effectiveTier = MEMBERSHIP",
    statusC.body?.data?.effectiveTier === "MEMBERSHIP",
    statusC.body?.data
  );
  expectQuota("C) quota member MEMBERSHIP", quotaC, {
    tier: "MEMBERSHIP", limit: 3, used: 0, remaining: 3, hasActiveSubscription: true,
  });
  check(
    "C) membership-status.effectiveTier === quota.tier (MEMBERSHIP)",
    statusC.body?.data?.effectiveTier === quotaC.body?.data?.tier
  );

  // --- D) ACTIVE PREMIUM ---
  const premiumPlan = await createPlan(ctx.manager.token, {
    name: `E2E StatusPremium ${RUN}`,
    price: 600000,
    durationDays: 30,
    tier: "PREMIUM",
    maxConcurrentClasses: 6,
  });
  const memberD = await registerAndLogin("statuspremium");
  await subscribe(ctx.manager.token, memberD.memberProfileId, premiumPlan.id);
  const statusD = await statusOf(memberD.memberProfileId);
  const quotaD = await quota(memberD.token);
  check(
    "D) ACTIVE PREMIUM → membership-status.effectiveTier = PREMIUM",
    statusD.body?.data?.effectiveTier === "PREMIUM",
    statusD.body?.data
  );
  expectQuota("D) quota member PREMIUM", quotaD, {
    tier: "PREMIUM", limit: 6, used: 0, remaining: 6, hasActiveSubscription: true,
  });
  check(
    "D) membership-status.effectiveTier === quota.tier (PREMIUM)",
    statusD.body?.data?.effectiveTier === quotaD.body?.data?.tier
  );

  // --- Authorization không đổi: MEMBER không đọc được membership-status ---
  const memberCalls = await http("GET", `/members/${free.memberProfileId}/membership-status`, {
    token: free.token,
  });
  check("MEMBER gọi membership-status → 403 (authorization không đổi)", memberCalls.status === 403, memberCalls.body);
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
  console.log(`E2E quota suite — run=${RUN} | api=${baseUrl}/api/v1`);

  const hashed = await hashPassword(PASSWORD);
  try {
    await setupRoom();
    const manager = await createUser("MANAGER", "manager", hashed);
    const coach = await createUser("COACH", "coach", hashed);
    const staff = await createUser("STAFF", "staff", hashed);
    const members: FixtureUser[] = [];
    for (let i = 1; i <= 10; i++) members.push(await createUser("MEMBER", `member${i}`, hashed));

    const membership3 = await createPlan(manager.token, { name: `E2E Membership 3 ${RUN}`, price: 300000, durationDays: 30, tier: "MEMBERSHIP", maxConcurrentClasses: 3 });
    const membership2 = await createPlan(manager.token, { name: `E2E Membership 2 ${RUN}`, price: 300000, durationDays: 30, tier: "MEMBERSHIP", maxConcurrentClasses: 2 });
    const membership1 = await createPlan(manager.token, { name: `E2E Membership 1 ${RUN}`, price: 300000, durationDays: 30, tier: "MEMBERSHIP", maxConcurrentClasses: 1 });
    const premium6 = await createPlan(manager.token, { name: `E2E Premium 6 ${RUN}`, price: 600000, durationDays: 30, tier: "PREMIUM", maxConcurrentClasses: 6 });
    const long180 = await createPlan(manager.token, { name: `E2E Membership 180d ${RUN}`, price: 900000, durationDays: 180, tier: "MEMBERSHIP", maxConcurrentClasses: 3 });
    const membershipDefault = await createPlan(manager.token, { name: `E2E Membership Default ${RUN}`, price: 300000, durationDays: 30, tier: "MEMBERSHIP" });
    check("Plan tạo không nhập quota → default theo tier = 3", membershipDefault.maxConcurrentClasses === 3, membershipDefault);

    const ctx: Ctx = { manager, plans: { membership3, membership2, membership1, premium6, long180 } };

    await scenarioPlanConfig(ctx);
    await scenarioPlanPatchSemantics(ctx);
    await scenarioMembershipLimit3(ctx, members[0]);
    await scenarioDistinctClassAndTransfer(ctx, members[1]);
    await scenarioCancel(ctx, members[2]);
    await scenarioPastAndCompleted(ctx, members[3]);
    await scenarioPenalty(ctx, members[4]);
    await scenarioDowngrade(ctx, members[5]);
    await scenarioConcurrency(ctx, members[6]);
    await scenarioAuthorization(ctx, members[7], members[8], coach, staff);
    await scenarioNoActiveSubscription(ctx, members[9]);
    await scenarioAccountProvisioning(ctx);
    await scenarioMembershipStatusConsistency(ctx);
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
    console.log("Toàn bộ kịch bản quota lớp học song song PASS.");
  }
}

main().catch(async (err) => {
  console.error("Suite lỗi nghiêm trọng:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});










