/**
 * E2E THẬT (HTTP + PostgreSQL) cho mô hình NỀN TẢNG sau khi bỏ Membership & role STAFF:
 *   Guest đăng ký MEMBER/COACH → Coach tự mở khóa học → Member mua khóa học (hoa hồng 15% khấu trừ)
 *   → Member đặt lịch các buổi của khóa đã mua → hủy khóa thì nhả chỗ.
 *
 * Chạy:  cd BE && npm run test:e2e   (hoặc: npx tsx tests/course-purchase.e2e.ts)
 *
 * Nguyên tắc:
 * - Fixture hạ tầng (manager, sport, room, schedule) tạo trực tiếp qua Prisma;
 *   các luồng nghiệp vụ (đăng ký, tạo khóa học, mua khóa học, đặt lịch, hủy) gọi qua HTTP API thật.
 * - Mọi fixture có tiền tố E2E + mã RUN riêng và được dọn sạch ở cuối (kể cả khi test fail).
 *
 * Kịch bản:
 * 1) Guest đăng ký: MEMBER mặc định, COACH có CoachProfile; role STAFF bị từ chối (400).
 * 2) Quyền tạo khóa học: COACH chỉ tạo được khóa của CHÍNH MÌNH (không gán owner khác); MEMBER bị 403.
 * 3) Mua khóa học: Member trả ĐÚNG giá niêm yết; nền tảng 15%; Coach 85%; hoá đơn + payment được tạo.
 * 4) Chống trùng: mua lại cùng khóa → 409.
 * 5) Chốt chặn đặt lịch: chưa mua → 403 COURSE_NOT_PURCHASED; đã mua → 201; khóa hết hạn → 403.
 * 6) Phân quyền dữ liệu: /my, /my-sales, chi tiết lượt mua của Coach khác → 403.
 * 7) Manager: danh sách + summary hoa hồng, báo cáo /reports/courses, hủy lượt mua nhả chỗ tương lai.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";
import { COURSE_COMMISSION_RATE, splitCoursePrice } from "../src/config/commission.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eCourse!2026";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PRICE_A = 500000;
const PRICE_B = 800000;

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
  classIds: [] as string[],
  scheduleIds: [] as string[],
  roomIds: [] as string[],
  sportIds: [] as string[],
  purchaseIds: [] as string[],
};

type RegisterResult = { id: string; token: string; profileId: string };

/** Tạo user qua Prisma + login qua API thật (MANAGER không tự đăng ký được). */
async function createManager(): Promise<{ id: string; token: string }> {
  const hashed = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: `e2e-course-${RUN}-manager@example.com`,
      password: hashed,
      fullName: `E2E Manager ${RUN}`,
      role: "MANAGER",
      managerProfile: { create: {} },
    },
  });
  created.userIds.push(user.id);
  const login = await http("POST", "/auth/login", {
    body: { email: user.email, password: PASSWORD },
  });
  if (login.status !== 200) throw new Error(`manager login failed: ${safe(login)}`);
  return { id: user.id, token: login.body.data.accessToken as string };
}

/** Guest tự đăng ký qua API (MEMBER hoặc COACH) rồi login lấy token. */
async function registerViaApi(
  role: "MEMBER" | "COACH",
  tag: string,
  extra: Record<string, unknown> = {}
): Promise<RegisterResult> {
  // Email phải lowercase để khớp với transform của RegisterSchema (lưu lowercase)
  // và truy vấn login — tag có chữ hoa (coachA-...) sẽ không khớp DB nếu không hạ.
  const email = `e2e-course-${RUN}-${tag}@example.com`.toLowerCase();
  const reg = await http("POST", "/auth/register", {
    body: { email, password: PASSWORD, fullName: `E2E ${tag}`, role, ...extra },
  });
  if (reg.status !== 201) throw new Error(`register(${role}) failed: ${safe(reg)}`);

  const id = reg.body.data.id as string;
  created.userIds.push(id);
  const profileId =
    role === "COACH"
      ? (reg.body.data.coachProfile?.id as string)
      : (reg.body.data.memberProfile?.id as string);

  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`login(${tag}) failed: ${safe(login)}`);
  return { id, token: login.body.data.accessToken as string, profileId };
}

async function setupSportAndRoom(): Promise<{ sportId: string; roomId: string }> {
  const sport = await prisma.sport.create({
    data: {
      name: `E2E Course Sport ${RUN}`,
      description: "E2E",
      areaTypes: ["INDOOR"],
      isActive: true,
    },
  });
  created.sportIds.push(sport.id);

  const room = await prisma.room.create({
    data: { name: `E2E Course Room ${RUN}`, capacity: 30, areaType: "INDOOR", location: "E2E" },
  });
  created.roomIds.push(room.id);
  return { sportId: sport.id, roomId: room.id };
}

const FUTURE_BASE = new Date(Date.now() + 3 * DAY);
let slotCursor = 0;

/** Thêm 1 buổi học tương lai cho khóa (tạo trực tiếp qua Prisma). */
async function addSchedule(classId: string, roomId: string): Promise<string> {
  const start = new Date(FUTURE_BASE.getTime() + slotCursor++ * 90 * 60 * 1000);
  const schedule = await prisma.classSchedule.create({
    data: {
      classId,
      roomId,
      startTime: start,
      endTime: new Date(start.getTime() + HOUR),
      status: "SCHEDULED",
    },
  });
  created.scheduleIds.push(schedule.id);
  return schedule.id;
}

// ─── Scenarios ────────────────────────────────────────────────────────────

/** 1) Guest đăng ký MEMBER/COACH; role STAFF bị từ chối. */
async function scenarioGuestRegister(): Promise<void> {
  section("1) Guest đăng ký MEMBER / COACH (role STAFF đã bị bỏ)");

  const member = await registerViaApi("MEMBER", `member-${RUN}-1`);
  check("đăng ký MEMBER → 201 kèm memberProfile", Boolean(member.profileId), member);

  const coach = await registerViaApi("COACH", `coach-${RUN}-1`, {
    specialization: "Boxing",
    experienceYears: 4,
  });
  check("đăng ký COACH → 201 kèm coachProfile", Boolean(coach.profileId), coach);

  const staffAttempt = await http("POST", "/auth/register", {
    body: {
      email: `e2e-course-${RUN}-staff@example.com`,
      password: PASSWORD,
      fullName: "E2E Staff",
      role: "STAFF",
    },
  });
  check("đăng ký role STAFF → 400 (role không còn tồn tại)", staffAttempt.status === 400, staffAttempt.body);

  const me = await http("GET", "/auth/me", { token: coach.token });
  check(
    "GET /auth/me của COACH trả role COACH",
    me.status === 200 && me.body?.data?.role === "COACH",
    me.body
  );
}

type Ctx = {
  manager: { id: string; token: string };
  coachA: RegisterResult;
  coachB: RegisterResult;
  member: RegisterResult;
  member2: RegisterResult;
  sportId: string;
  roomId: string;
};

/** 2) Coach tự mở khóa học của mình; MEMBER không tạo được khóa; Coach không gán owner khác. */
async function scenarioCoachOwnsCourse(
  ctx: Ctx
): Promise<{ courseA: any; courseB: any; schedA: string[]; schedB: string[] }> {
  section("2) Coach tạo khóa học của riêng mình");

  const base = {
    sportIds: [ctx.sportId],
    capacity: 10,
    areaType: "INDOOR",
    durationDays: 30,
  };

  const resA = await http("POST", "/classes", {
    token: ctx.coachA.token,
    body: { ...base, name: `E2E Course A ${RUN}`, price: PRICE_A },
  });
  const courseA = resA.body?.data;
  check("COACH tạo khóa học của mình → 201", resA.status === 201, resA.body);
  if (courseA?.id) created.classIds.push(courseA.id);
  check("ownerCoachId = CoachProfile của chính Coach", courseA?.ownerCoachId === ctx.coachA.profileId, courseA);
  check(
    "Coach sở hữu được gán làm HLV chính của khóa",
    (courseA?.coaches ?? []).some((c: any) => c.isPrimary && c.coachId === ctx.coachA.profileId),
    courseA?.coaches
  );
  check("giá khóa học = giá Coach đặt", Number(courseA?.price) === PRICE_A, courseA);

  const assignOther = await http("POST", "/classes", {
    token: ctx.coachA.token,
    body: { ...base, name: `E2E Course illegal ${RUN}`, price: PRICE_A, ownerCoachId: ctx.coachB.profileId },
  });
  check("COACH gán chủ sở hữu là Coach khác → 403", assignOther.status === 403, assignOther.body);

  const memberCreates = await http("POST", "/classes", {
    token: ctx.member.token,
    body: { ...base, name: `E2E Course member ${RUN}`, price: PRICE_A },
  });
  check("MEMBER tạo khóa học → 403", memberCreates.status === 403, memberCreates.body);

  // MANAGER tạo khóa thứ hai và gán cho Coach B — dùng để test chốt chặn "chưa mua KHÓA NÀY".
  const resB = await http("POST", "/classes", {
    token: ctx.manager.token,
    body: { ...base, name: `E2E Course B ${RUN}`, price: PRICE_B, ownerCoachId: ctx.coachB.profileId },
  });
  const courseB = resB.body?.data;
  check("MANAGER tạo khóa học + gán chủ sở hữu Coach B → 201", resB.status === 201, resB.body);
  if (courseB?.id) created.classIds.push(courseB.id);
  check("khóa B thuộc sở hữu Coach B", courseB?.ownerCoachId === ctx.coachB.profileId, courseB);

  const myCourses = await http("GET", "/classes/my", { token: ctx.coachA.token });
  check(
    "GET /classes/my của Coach A chỉ trả khóa của chính mình",
    myCourses.status === 200 && myCourses.body?.data?.length === 1 && myCourses.body.data[0].id === courseA?.id,
    myCourses.body
  );

  const patchOther = await http("PATCH", `/classes/${courseB?.id}`, {
    token: ctx.coachA.token,
    body: { price: 123456 },
  });
  check("COACH sửa khóa của Coach khác → 403", patchOther.status === 403, patchOther.body);

  const schedA = [await addSchedule(courseA.id, ctx.roomId), await addSchedule(courseA.id, ctx.roomId)];
  const schedB = [await addSchedule(courseB.id, ctx.roomId)];
  return { courseA, courseB, schedA, schedB };
}

/** 3) Member mua khóa học: hoa hồng 15% khấu trừ, hoá đơn, chống trùng, chốt chặn đặt lịch. */
async function scenarioPurchase(
  ctx: Ctx,
  courses: { courseA: any; courseB: any; schedA: string[]; schedB: string[] }
): Promise<string> {
  section("3) Member mua khóa học (hoa hồng 15% khấu trừ) + chốt chặn đặt lịch");
  const expected = splitCoursePrice(PRICE_A);

  const buy = await http("POST", "/course-purchases", {
    token: ctx.member.token,
    body: { classId: courses.courseA.id, method: "CASH" },
  });
  const purchase = buy.body?.data;
  check("Member tự mua khóa học → 201", buy.status === 201, buy.body);
  if (purchase?.id) created.purchaseIds.push(purchase.id);

  check("Member trả ĐÚNG giá niêm yết (không cộng phụ phí)", Number(purchase?.price) === expected.price, purchase);
  check("commissionRate = 0.15", Number(purchase?.commissionRate) === COURSE_COMMISSION_RATE, purchase);
  check("hoa hồng nền tảng = 15% giá khóa", Number(purchase?.commissionAmount) === expected.commissionAmount, purchase);
  check("Coach nhận = 85% giá khóa", Number(purchase?.coachEarning) === expected.coachEarning, purchase);
  check("coachId snapshot = Coach sở hữu khóa", purchase?.coachId === ctx.coachA.profileId, purchase);
  check(
    "endDate = startDate + durationDays (30 ngày)",
    Math.round((new Date(purchase?.endDate).getTime() - new Date(purchase?.startDate).getTime()) / DAY) === 30,
    purchase
  );

  const invoice = await prisma.invoice.findFirst({
    where: { payment: { coursePurchaseId: purchase.id } },
  });
  check(
    "hoá đơn được tạo kèm courseName + total = giá khóa",
    invoice?.courseName === courses.courseA.name && Number(invoice?.total) === PRICE_A,
    invoice
  );

  const dup = await http("POST", "/course-purchases", {
    token: ctx.member.token,
    body: { classId: courses.courseA.id },
  });
  check("mua lại cùng khóa khi còn ACTIVE → 409", dup.status === 409, dup.body);

  const myList = await http("GET", "/course-purchases/my", { token: ctx.member.token });
  check(
    "GET /course-purchases/my trả lượt mua kèm daysRemaining = 30",
    myList.status === 200 &&
      myList.body?.data?.length === 1 &&
      myList.body.data[0].id === purchase.id &&
      myList.body.data[0].daysRemaining === 30,
    myList.body
  );

  const sales = await http("GET", "/course-purchases/my-sales", { token: ctx.coachA.token });
  check(
    "Coach A (/my-sales) thấy gross / hoa hồng nền tảng / thu nhập của mình",
    sales.status === 200 &&
      sales.body?.data?.summary?.grossRevenue === expected.price &&
      sales.body?.data?.summary?.platformCommission === expected.commissionAmount &&
      sales.body?.data?.summary?.coachEarning === expected.coachEarning,
    sales.body
  );

  const otherCoachReads = await http("GET", `/course-purchases/${purchase.id}`, { token: ctx.coachB.token });
  check("Coach B xem lượt mua thuộc khóa Coach A → 403", otherCoachReads.status === 403, otherCoachReads.body);

  const notPurchased = await http("POST", "/enrollments", {
    token: ctx.member.token,
    body: { scheduleId: courses.schedB[0] },
  });
  check(
    "đặt lịch khóa CHƯA mua → 403 COURSE_NOT_PURCHASED",
    notPurchased.status === 403 && notPurchased.body?.errors?.code === "COURSE_NOT_PURCHASED",
    notPurchased.body
  );

  const booked = await http("POST", "/enrollments", {
    token: ctx.member.token,
    body: { scheduleId: courses.schedA[0] },
  });
  check("đặt lịch khóa ĐÃ mua → 201", booked.status === 201, booked.body);

  return purchase.id as string;
}

/** 4) Manager: danh sách/summary, báo cáo khóa học, hủy lượt mua nhả chỗ, khóa hết hạn. */
async function scenarioManagerCancelAndExpire(
  ctx: Ctx,
  courses: { courseA: any; courseB: any; schedA: string[]; schedB: string[] },
  purchaseId: string
): Promise<void> {
  section("4) Manager đối soát + hủy lượt mua + khóa hết hạn");
  const expected = splitCoursePrice(PRICE_A);

  const list = await http("GET", "/course-purchases", { token: ctx.manager.token });
  check(
    "MANAGER xem toàn bộ lượt mua → summary doanh thu/hoa hồng",
    list.status === 200 &&
      list.body?.data?.summary?.grossRevenue >= expected.price &&
      list.body?.data?.summary?.platformCommission >= expected.commissionAmount &&
      list.body?.data?.summary?.coachEarnings >= expected.coachEarning,
    list.body
  );

  const today = new Date().toISOString().slice(0, 10);
  const report = await http("GET", `/reports/courses?startDate=${today}&endDate=${today}`, {
    token: ctx.manager.token,
  });
  check(
    "GET /reports/courses → 200 kèm platformCommission & coachEarnings",
    report.status === 200 &&
      report.body?.data?.platformCommission >= expected.commissionAmount &&
      report.body?.data?.coachEarnings >= expected.coachEarning,
    report.body
  );

  const logs = await http("GET", "/reports/course-purchase-logs", { token: ctx.manager.token });
  check(
    "GET /reports/course-purchase-logs → log có className + coachEarning",
    logs.status === 200 &&
      logs.body?.data?.data?.some(
        (row: any) => row.className === courses.courseA.name && row.coachEarning === expected.coachEarning
      ),
    logs.body
  );

  const memberCourses = await http("GET", `/members/${ctx.member.profileId}/courses`, {
    token: ctx.manager.token,
  });
  check(
    "GET /members/:id/courses → activeCourseCount = 1",
    memberCourses.status === 200 && memberCourses.body?.data?.activeCourseCount === 1,
    memberCourses.body
  );

  const cancel = await http("PATCH", `/course-purchases/${purchaseId}/cancel`, {
    token: ctx.manager.token,
    body: { reason: "E2E cancel" },
  });
  check("MANAGER hủy lượt mua → 200", cancel.status === 200, cancel.body);
  check(
    "hủy lượt mua nhả buổi học tương lai (releasedEnrollments >= 1)",
    Number(cancel.body?.data?.releasedEnrollments) >= 1,
    cancel.body
  );

  const bookAfterCancel = await http("POST", "/enrollments", {
    token: ctx.member.token,
    body: { scheduleId: courses.schedA[1] },
  });
  check("sau khi hủy lượt mua, đặt lịch khóa đó → 403", bookAfterCancel.status === 403, bookAfterCancel.body);

  const buyB = await http("POST", "/course-purchases", {
    token: ctx.member2.token,
    body: { classId: courses.courseB.id, method: "BANK_TRANSFER" },
  });
  check(
    "member2 mua khóa B → 201 (trả đúng giá niêm yết)",
    buyB.status === 201 && Number(buyB.body?.data?.price) === PRICE_B,
    buyB.body
  );
  if (buyB.body?.data?.id) created.purchaseIds.push(buyB.body.data.id);

  // a) endDate còn hiệu lực nhưng TRƯỚC buổi học → 403 báo hết hạn, yêu cầu mua lại.
  await prisma.coursePurchase.update({
    where: { id: buyB.body.data.id },
    data: { endDate: new Date(Date.now() + 12 * 3600 * 1000) },
  });

  const bookExpired = await http("POST", "/enrollments", {
    token: ctx.member2.token,
    body: { scheduleId: courses.schedB[0] },
  });
  check(
    "khóa hết hạn trước ngày học → 403 kèm thông báo mua lại",
    bookExpired.status === 403 && /hết hạn/.test(String(bookExpired.body?.message)),
    bookExpired.body
  );

  // b) endDate quá khứ → lượt mua được tự đánh dấu EXPIRED khi đọc.
  await prisma.coursePurchase.update({
    where: { id: buyB.body.data.id },
    data: { endDate: new Date(Date.now() - DAY) },
  });

  const member2List = await http("GET", "/course-purchases/my", { token: ctx.member2.token });
  check(
    "lượt mua hết hạn được tự động đánh dấu EXPIRED khi đọc",
    member2List.status === 200 && member2List.body?.data?.[0]?.status === "EXPIRED",
    member2List.body
  );
}

// ─── Cleanup + runner ─────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  const classIds = created.classIds;
  if (classIds.length > 0) {
    await prisma.enrollment.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.attendance.deleteMany({ where: { schedule: { classId: { in: classIds } } } });
    await prisma.classSchedule.deleteMany({ where: { classId: { in: classIds } } });
  }

  const purchaseRows = classIds.length
    ? await prisma.coursePurchase.findMany({ where: { classId: { in: classIds } }, select: { id: true } })
    : [];
  const purchaseIds = [...new Set([...created.purchaseIds, ...purchaseRows.map((p) => p.id)])];
  if (purchaseIds.length > 0) {
    await prisma.invoice.deleteMany({ where: { payment: { coursePurchaseId: { in: purchaseIds } } } });
    await prisma.payment.deleteMany({ where: { coursePurchaseId: { in: purchaseIds } } });
    await prisma.coursePurchase.deleteMany({ where: { id: { in: purchaseIds } } });
  }

  if (classIds.length > 0) {
    await prisma.classMember.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  }
  if (created.userIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }
  if (created.roomIds.length > 0) await prisma.room.deleteMany({ where: { id: { in: created.roomIds } } });
  if (created.sportIds.length > 0) await prisma.sport.deleteMany({ where: { id: { in: created.sportIds } } });
}

async function main(): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`E2E course-purchase suite — run=${RUN} | api=${baseUrl}/api/v1`);

  try {
    const { sportId, roomId } = await setupSportAndRoom();
    const manager = await createManager();
    const coachA = await registerViaApi("COACH", `coachA-${RUN}`, { specialization: "Yoga" });
    const coachB = await registerViaApi("COACH", `coachB-${RUN}`, { specialization: "HIIT" });
    const member = await registerViaApi("MEMBER", `memberA-${RUN}`);
    const member2 = await registerViaApi("MEMBER", `memberB-${RUN}`);

    await scenarioGuestRegister();

    const ctx: Ctx = { manager, coachA, coachB, member, member2, sportId, roomId };
    const courses = await scenarioCoachOwnsCourse(ctx);
    const purchaseId = await scenarioPurchase(ctx, courses);
    await scenarioManagerCancelAndExpire(ctx, courses, purchaseId);
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
    console.log("Toàn bộ kịch bản mua khóa học / phân quyền PASS.");
  }
}

void main();
