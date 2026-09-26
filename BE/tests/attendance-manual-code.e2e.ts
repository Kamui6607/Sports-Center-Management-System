/**
 * E2E THẬT (HTTP + PostgreSQL) cho luồng điểm danh dự phòng khi Member không quét được QR.
 *
 * Chạy:  cd BE && npm run test:e2e:attendance   (hoặc: npx tsx tests/attendance-manual-code.e2e.ts)
 *
 * Nguyên tắc:
 * - Fixture (user / room / class / schedule / enrollment) tạo trực tiếp qua Prisma;
 *   đăng ký gói qua API thật (POST /memberships-plans + POST /subscriptions).
 * - Hành vi nghiệp vụ (generate-qr, scan-qr, chống brute-force, phân quyền) gọi qua HTTP API thật.
 * - Mọi fixture có tiền tố E2E + mã RUN riêng và được dọn sạch ở cuối (kể cả khi test fail).
 *
 * Kịch bản:
 * 1) Regression luồng QR cũ + mã dự phòng sinh kèm (TTL, note, upsert trùng, token sai/hết hạn).
 * 2) Mã dự phòng: chữ thường/khoảng trắng, rotate mã cũ, sai/hết hạn/thu hồi, message không lộ thông tin.
 * 3) Bảo mật: member KHÔNG gửi scheduleId; mã của buổi không đặt chỗ bị từ chối + bị thu hồi khi lạm dụng.
 * 4) Chống brute-force theo member: 10 lần sai/15 phút → 429 (kể cả khi sau đó nhập mã đúng).
 * 5) Chốt chặn gói tập (gói hết hạn → 403) và phân quyền COACH/MANAGER/STAFF/MEMBER.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { ATTENDANCE } from "../src/config/attendance.js";
import { hashPassword } from "../src/utils/bcrypt.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eManual!2026";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MANUAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const QR_NOTE = "Tự động điểm danh qua QR";
const MANUAL_NOTE = "Điểm danh bằng mã dự phòng (nhập tay)";
const INVALID_MESSAGE = "Mã điểm danh không hợp lệ hoặc đã hết hạn.";
const THROTTLE_MESSAGE =
  "Bạn đã nhập sai mã điểm danh quá nhiều lần. Vui lòng thử lại sau hoặc nhờ HLV điểm danh trực tiếp.";
/** Mã 6 ký tự dẫn xuất từ RUN (alphabet hợp lệ) để suite chạy lại được sau khi bị kill giữa chừng. */
function runCode(prefix: string): string {
  const body = RUN.toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .padEnd(5, "Z")
    .slice(0, 5);
  return `${prefix}${body}`.slice(0, 6);
}
/** Mã KHÔNG tồn tại (dùng để test nhập sai) và mã HẾT HẠN tạo trực tiếp trong DB. */
const WRONG_CODE = runCode("W");
const EXPIRED_CODE = runCode("E");

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

type FixtureUser = {
  id: string;
  email: string;
  token: string;
  memberProfileId: string;
  coachProfileId: string;
};

async function createUser(
  role: "MEMBER" | "COACH" | "STAFF" | "MANAGER",
  tag: string,
  hashedPassword: string
): Promise<FixtureUser> {
  const email = `e2e-attendance-${RUN}-${tag.toLowerCase()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: `E2E Attendance ${tag} ${RUN}`,
      role,
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : {}),
      ...(role === "COACH" ? { coachProfile: { create: {} } } : {}),
      ...(role === "MANAGER" ? { managerProfile: { create: {} } } : {}),
    },
    include: { memberProfile: true, coachProfile: true },
  });
  created.userIds.push(user.id);
  const memberProfileId = user.memberProfile?.id ?? "";
  if (memberProfileId) created.memberProfileIds.push(memberProfileId);

  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const token = login.body?.data?.accessToken as string | undefined;
  if (login.status !== 200 || !token) {
    throw new Error(`Login failed for fixture ${email}: ${safe(login)}`);
  }
  return {
    id: user.id,
    email,
    token,
    memberProfileId,
    coachProfileId: user.coachProfile?.id ?? "",
  };
}

let roomId = "";

async function setupRoom(): Promise<void> {
  const room = await prisma.room.create({
    data: { name: `E2E Attendance Room ${RUN}`, capacity: 50, areaType: "INDOOR", location: "E2E" },
  });
  roomId = room.id;
  created.roomIds.push(room.id);
}

/** Slot tương lai không chồng giờ giữa các buổi học của fixture. */
const FUTURE_BASE = new Date(Date.now() + 3 * DAY);
let slotCursor = 0;

function nextSlot(): { start: Date; end: Date } {
  const start = new Date(FUTURE_BASE.getTime() + slotCursor++ * 90 * 60 * 1000);
  return { start, end: new Date(start.getTime() + HOUR) };
}

async function createClass(
  tag: string,
  scheduleCount: number,
  opts: { coachProfileId?: string } = {}
): Promise<{ classId: string; scheduleIds: string[] }> {
  const cls = await prisma.class.create({
    data: {
      name: `E2E Attendance ${tag} ${RUN}`,
      areaType: "INDOOR",
      capacity: 30,
      ...(opts.coachProfileId
        ? { coaches: { create: [{ coachId: opts.coachProfileId, isPrimary: true }] } }
        : {}),
    },
  });
  created.classIds.push(cls.id);

  const scheduleIds: string[] = [];
  for (let i = 0; i < scheduleCount; i++) {
    const { start, end } = nextSlot();
    const schedule = await prisma.classSchedule.create({
      data: { classId: cls.id, roomId, startTime: start, endTime: end, status: "SCHEDULED" },
    });
    scheduleIds.push(schedule.id);
  }
  return { classId: cls.id, scheduleIds };
}

async function enroll(memberProfileId: string, classId: string, scheduleId: string): Promise<void> {
  await prisma.enrollment.create({
    data: { memberId: memberProfileId, classId, scheduleId, status: "BOOKED" },
  });
}

async function createPlan(managerToken: string, payload: Record<string, unknown>): Promise<any> {
  const res = await http("POST", "/membership-plans", { token: managerToken, body: payload });
  if (res.status !== 201) throw new Error(`createPlan failed: ${safe(res)}`);
  created.planIds.push(res.body.data.id);
  return res.body.data;
}

async function subscribe(managerToken: string, memberProfileId: string, planId: string): Promise<string> {
  const res = await http("POST", "/subscriptions", {
    token: managerToken,
    body: { memberId: memberProfileId, planId, paymentMethod: "CASH" },
  });
  if (res.status !== 201) throw new Error(`subscribe failed: ${safe(res)}`);
  return res.body.data.subscription.id as string;
}

// ─── API action helpers ───────────────────────────────────────────────────
const generateQr = (token: string, scheduleId: string) =>
  http("POST", "/attendance/generate-qr", { token, body: { scheduleId } });
const scanQr = (token: string | undefined, body: unknown) =>
  http("POST", "/attendance/scan-qr", token ? { token, body } : { body });

async function attendanceCount(memberProfileId: string, scheduleId: string): Promise<number> {
  return prisma.attendance.count({ where: { memberId: memberProfileId, scheduleId } });
}

async function attendanceRow(memberProfileId: string, scheduleId: string) {
  return prisma.attendance.findUnique({
    where: { scheduleId_memberId: { memberId: memberProfileId, scheduleId } },
  });
}

async function activeCodes(scheduleId: string) {
  return prisma.attendanceManualCode.findMany({
    where: { scheduleId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}

async function failureCount(memberProfileId: string): Promise<number> {
  return prisma.attendanceManualCodeAttempt.count({
    where: { memberId: memberProfileId, success: false },
  });
}

type Ctx = {
  manager: FixtureUser;
  coach: FixtureUser;
  staff: FixtureUser;
  planId: string;
  classA: { classId: string; scheduleIds: string[] };
  classB: { classId: string; scheduleIds: string[] };
};

// ─── Scenarios ────────────────────────────────────────────────────────────

/** 1) Regression luồng QR cũ + mã dự phòng sinh kèm trong cùng response. */
async function scenarioQrRegression(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("1) Regression QR cũ + mã dự phòng sinh kèm (generate-qr)");
  const sA1 = ctx.classA.scheduleIds[0];

  const generated = await generateQr(ctx.manager.token, sA1);
  check("POST /attendance/generate-qr (MANAGER) → 200", generated.status === 200, generated.body);
  const data = generated.body?.data;
  check("expiresIn = 600 (QR giữ nguyên TTL cũ)", data?.expiresIn === 600, data);
  check(
    `manualCodeExpiresIn = ${ATTENDANCE.MANUAL_CODE_TTL_SECONDS}`,
    data?.manualCodeExpiresIn === ATTENDANCE.MANUAL_CODE_TTL_SECONDS,
    data
  );
  check(
    "qrToken là JWT 3 phần không rỗng",
    typeof data?.qrToken === "string" && data.qrToken.split(".").length === 3,
    String(data?.qrToken).slice(0, 24)
  );
  check("manualCode đúng alphabet 6 ký tự (A-HJ-NP-Z2-9)", MANUAL_CODE_PATTERN.test(String(data?.manualCode)), data?.manualCode);

  const codeRow = await prisma.attendanceManualCode.findUnique({
    where: { code: String(data?.manualCode) },
  });
  const ttlMs = (codeRow?.expiresAt.getTime() ?? 0) - (codeRow?.createdAt.getTime() ?? 0);
  check(
    "DB: mã gắn đúng schedule + creator + expiresAt ≈ +90s + chưa revoked",
    codeRow?.scheduleId === sA1 &&
      codeRow?.createdBy === ctx.manager.id &&
      Math.abs(ttlMs - ATTENDANCE.MANUAL_CODE_TTL_SECONDS * 1000) < 5_000 &&
      codeRow?.revokedAt === null,
    { codeRow, ttlMs }
  );

  const qrScan = await scanQr(member.token, { qrToken: data.qrToken });
  check("MEMBER quét QR hợp lệ → 200 PRESENT", qrScan.status === 200 && qrScan.body?.data?.status === "PRESENT", qrScan.body);
  const row = await attendanceRow(member.memberProfileId, sA1);
  check(`Attendance.note = "${QR_NOTE}"`, row?.note === QR_NOTE, row);

  const qrAgain = await scanQr(member.token, { qrToken: data.qrToken });
  check(
    "quét lại QR → 200 và vẫn đúng 1 bản ghi (upsert)",
    qrAgain.status === 200 && (await attendanceCount(member.memberProfileId, sA1)) === 1,
    qrAgain.body
  );

  const switchToCode = await scanQr(member.token, { code: data.manualCode });
  const rowAfter = await attendanceRow(member.memberProfileId, sA1);
  check(
    "QR rồi nhập mã cho cùng buổi → 200, 1 bản ghi, note = mã dự phòng",
    switchToCode.status === 200 && rowAfter?.note === MANUAL_NOTE,
    rowAfter
  );

  const invalid = await scanQr(member.token, { qrToken: "not-a-token" });
  check(
    'QR không hợp lệ → 400 "Mã QR không hợp lệ."',
    invalid.status === 400 && invalid.body?.message === "Mã QR không hợp lệ.",
    invalid.body
  );

  const expiredToken = jwt.sign(
    { scheduleId: sA1, coachId: ctx.manager.id, type: "ATTENDANCE_QR" },
    env.JWT_ACCESS_SECRET,
    { expiresIn: -60 }
  );
  const expired = await scanQr(member.token, { qrToken: expiredToken });
  check(
    "QR hết hạn → 400 (yêu cầu HLV mở mã mới)",
    expired.status === 400 && /hết hạn/.test(String(expired.body?.message)),
    expired.body
  );

  const wrongType = await scanQr(member.token, { qrToken: member.token });
  check(
    "access token thường (type sai) → 400 không hợp lệ cho điểm danh",
    wrongType.status === 400 && wrongType.body?.message === "Mã QR không hợp lệ cho điểm danh.",
    wrongType.body
  );

  const regenerated = await generateQr(ctx.manager.token, sA1);
  const active = await activeCodes(sA1);
  check(
    "generate-qr lần 2: mã cũ bị thu hồi, đúng 1 mã active / schedule",
    active.length === 1 && active[0].code === regenerated.body?.data?.manualCode,
    active.map((c) => c.code)
  );
}

/** 2) Mã dự phòng: normalize chữ thường/khoảng trắng, rotate, sai/hết hạn/thu hồi. */
async function scenarioManualCode(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("2) Mã dự phòng: nhập tay, rotate, sai/hết hạn/thu hồi");
  const sA1 = ctx.classA.scheduleIds[0];

  const g1 = await generateQr(ctx.manager.token, sA1);
  const code1 = String(g1.body?.data?.manualCode);
  check("generate-qr cấp mã dự phòng mới", g1.status === 200 && MANUAL_CODE_PATTERN.test(code1), g1.body?.data);

  const lower = await scanQr(member.token, { code: code1.toLowerCase() });
  check("nhập chữ thường → 200 (tự uppercase)", lower.status === 200 && lower.body?.data?.status === "PRESENT", lower.body);
  const row = await attendanceRow(member.memberProfileId, sA1);
  check(`note = "${MANUAL_NOTE}"`, row?.note === MANUAL_NOTE, row);

  const trimmed = await scanQr(member.token, { code: `  ${code1}  ` });
  check(
    "khoảng trắng thừa → 200 và vẫn 1 bản ghi",
    trimmed.status === 200 && (await attendanceCount(member.memberProfileId, sA1)) === 1,
    trimmed.body
  );

  const wrong = await scanQr(member.token, { code: WRONG_CODE });
  check("mã không tồn tại → 400 message chung", wrong.status === 400 && wrong.body?.message === INVALID_MESSAGE, wrong.body);

  const expiredRow = await prisma.attendanceManualCode.create({
    data: { code: EXPIRED_CODE, scheduleId: sA1, createdBy: ctx.manager.id, expiresAt: new Date(Date.now() - 1000) },
  });
  const expiredScan = await scanQr(member.token, { code: EXPIRED_CODE });
  check("mã hết hạn → 400 message chung", expiredScan.status === 400 && expiredScan.body?.message === INVALID_MESSAGE, expiredScan.body);
  const expiredAfter = await prisma.attendanceManualCode.findUnique({ where: { id: expiredRow.id } });
  check(
    "mã hết hạn ghi nhận 1 lần dùng hỏng (attempts = 1, chưa revoked)",
    expiredAfter?.attempts === 1 && expiredAfter?.revokedAt === null,
    expiredAfter
  );

  const g2 = await generateQr(ctx.manager.token, sA1);
  const code2 = String(g2.body?.data?.manualCode);
  const rotated = await prisma.attendanceManualCode.findUnique({ where: { code: code1 } });
  check("rotate: mã cũ bị thu hồi trong DB", Boolean(rotated?.revokedAt), rotated);

  const revokedScan = await scanQr(member.token, { code: code1 });
  check("mã đã thu hồi → 400 message chung", revokedScan.status === 400 && revokedScan.body?.message === INVALID_MESSAGE, revokedScan.body);

  const fresh = await scanQr(member.token, { code: code2 });
  check("mã mới sau rotate → 200 PRESENT", fresh.status === 200 && fresh.body?.data?.status === "PRESENT", fresh.body);
  check(
    "không lộ thông tin: mã sai / hết hạn / thu hồi trả CÙNG một message",
    wrong.body?.message === expiredScan.body?.message && expiredScan.body?.message === revokedScan.body?.message
  );
  check(
    "log rate-limit ghi đủ 3 lần hỏng của member (mã sai + mã hết hạn + mã đã thu hồi)",
    (await failureCount(member.memberProfileId)) === 3,
    await failureCount(member.memberProfileId)
  );
}

/** 3) Bảo mật: member không thể tự chỉ định scheduleId; request lạ không tạo attendance. */
async function scenarioInputGuards(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("3) Bảo mật input: member KHÔNG gửi scheduleId, chỉ 1 credential");
  const sA1 = ctx.classA.scheduleIds[0];

  const g = await generateQr(ctx.manager.token, sA1);
  const code = String(g.body?.data?.manualCode);
  const attemptsBefore = (await prisma.attendanceManualCode.findUnique({ where: { code } }))?.attempts;
  const before = await attendanceCount(member.memberProfileId, sA1);

  const direct = await scanQr(member.token, { scheduleId: sA1 });
  check("body chỉ có scheduleId → 400 validation", direct.status === 400 && direct.body?.message === "Validation failed", direct.body);
  check("không tạo attendance khi body chứa scheduleId", (await attendanceCount(member.memberProfileId, sA1)) === before);

  const withSchedule = await scanQr(member.token, { scheduleId: sA1, code });
  check("scheduleId + code → 400 (key lạ bị từ chối .strict())", withSchedule.status === 400, withSchedule.body);
  check("không tạo attendance dù kèm scheduleId", (await attendanceCount(member.memberProfileId, sA1)) === before);
  check(
    "attempts của mã không tăng khi request bị chặn ở validation",
    (await prisma.attendanceManualCode.findUnique({ where: { code } }))?.attempts === attemptsBefore
  );

  const bothCreds = await scanQr(member.token, { qrToken: "x.y.z", code });
  check(
    "gửi cả qrToken và code → 400 (chỉ gửi một trong hai)",
    bothCreds.status === 400 && /Chỉ gửi một trong hai/.test(safe(bothCreds.body)),
    bothCreds.body
  );

  const empty = await scanQr(member.token, {});
  check("body rỗng → 400", empty.status === 400, empty.body);

  const badFormat = await scanQr(member.token, { code: "ABC" });
  check("mã sai định dạng → 400 kèm hướng dẫn 6 ký tự", badFormat.status === 400 && /6 ký tự/.test(safe(badFormat.body)), badFormat.body);

  const badAlphabet = await scanQr(member.token, { code: "ABCDE0" });
  check("mã chứa ký tự dễ nhầm (0) → 400", badAlphabet.status === 400, badAlphabet.body);

  check("các request sai không ghi log lạm dụng", (await failureCount(member.memberProfileId)) === 0);

  const ok = await scanQr(member.token, { code });
  check("mã hợp lệ sau các request bị chặn → 200 PRESENT", ok.status === 200 && ok.body?.data?.status === "PRESENT", ok.body);
}

/** 3b) Mã của buổi KHÔNG đặt chỗ: 403, lạm dụng đủ 5 lần → 429 + thu hồi mã. */
async function scenarioWrongScheduleMisuse(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("3b) Dùng mã của buổi không đặt chỗ → 403, quá 5 lần → 429 + thu hồi mã");
  const sA2 = ctx.classA.scheduleIds[1];

  const qrForOther = await generateQr(ctx.manager.token, sA2);
  const codeRowBefore = await prisma.attendanceManualCode.findUnique({
    where: { id: (await prisma.attendanceManualCode.findFirst({ where: { scheduleId: sA2, revokedAt: null } }))!.id },
  });
  const qrDenied = await scanQr(member.token, { qrToken: qrForOther.body?.data?.qrToken });
  check(
    "quét QR của buổi không đặt chỗ → 403 (không tính vào attempts của mã)",
    qrDenied.status === 403 && /chưa đặt chỗ/.test(String(qrDenied.body?.message)),
    qrDenied.body
  );
  check(
    "QR bị từ chối không làm tăng attempts của mã",
    (await prisma.attendanceManualCode.findUnique({ where: { id: codeRowBefore!.id } }))?.attempts === codeRowBefore?.attempts
  );

  const g = await generateQr(ctx.manager.token, sA2);
  const code = String(g.body?.data?.manualCode);
  const statuses: number[] = [];
  for (let i = 0; i < ATTENDANCE.MANUAL_CODE_MAX_ATTEMPTS; i++) {
    const res = await scanQr(member.token, { code });
    statuses.push(res.status);
  }
  check(
    `mã của buổi khác: ${ATTENDANCE.MANUAL_CODE_MAX_ATTEMPTS - 1} lần đầu 403, lần ${ATTENDANCE.MANUAL_CODE_MAX_ATTEMPTS} → 429`,
    statuses.slice(0, -1).every((s) => s === 403) && statuses[statuses.length - 1] === 429,
    statuses
  );

  const revoked = await prisma.attendanceManualCode.findUnique({ where: { code } });
  check("DB: mã bị thu hồi sau khi lạm dụng", Boolean(revoked?.revokedAt) && (revoked?.attempts ?? 0) >= ATTENDANCE.MANUAL_CODE_MAX_ATTEMPTS, revoked);
  check("member không có attendance ở buổi đó", (await attendanceCount(member.memberProfileId, sA2)) === 0);
  check("member vẫn chưa bị chặn theo ngưỡng member (0 lần sai mã)", (await failureCount(member.memberProfileId)) === 0);
}

/** 4) Chống brute-force theo member: 10 lần sai trong 15 phút → 429. */
async function scenarioMemberThrottle(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("4) Chống brute-force theo member: quá 10 lần sai/15 phút → 429");
  const sA3 = ctx.classA.scheduleIds[2];

  const statuses: number[] = [];
  for (let i = 0; i < ATTENDANCE.MEMBER_MANUAL_CODE_MAX_FAILURES; i++) {
    const res = await scanQr(member.token, { code: WRONG_CODE });
    statuses.push(res.status);
  }
  check(
    `${ATTENDANCE.MEMBER_MANUAL_CODE_MAX_FAILURES} lần sai liên tiếp đều 400 (chưa chặn sớm)`,
    statuses.every((s) => s === 400),
    statuses
  );
  check(
    `log đúng ${ATTENDANCE.MEMBER_MANUAL_CODE_MAX_FAILURES} lần sai của member`,
    (await failureCount(member.memberProfileId)) === ATTENDANCE.MEMBER_MANUAL_CODE_MAX_FAILURES,
    await failureCount(member.memberProfileId)
  );

  const g = await generateQr(ctx.manager.token, sA3);
  const blocked = await scanQr(member.token, { code: String(g.body?.data?.manualCode) });
  check(
    "sau ngưỡng: nhập mã ĐÚNG vẫn 429 (throttle theo member)",
    blocked.status === 429 && blocked.body?.message === THROTTLE_MESSAGE,
    blocked.body
  );
  check("không tạo attendance khi bị throttle", (await attendanceCount(member.memberProfileId, sA3)) === 0);
}

/** 5) Chốt chặn gói tập: member không có gói ACTIVE không điểm danh được, dù QR hay mã. */
async function scenarioSubscriptionGate(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("5) Chốt chặn gói tập (QR + mã dự phòng)");
  const sA4 = ctx.classA.scheduleIds[3];

  const g = await generateQr(ctx.manager.token, sA4);
  const byCode = await scanQr(member.token, { code: String(g.body?.data?.manualCode) });
  check(
    "mã hợp lệ nhưng gói hết hạn → 403 (thông báo gia hạn)",
    byCode.status === 403 && /hết hạn/.test(String(byCode.body?.message)),
    byCode.body
  );

  const g2 = await generateQr(ctx.manager.token, sA4);
  const byQr = await scanQr(member.token, { qrToken: g2.body?.data?.qrToken });
  check(
    "QR hợp lệ nhưng gói hết hạn → 403 (giữ nguyên hành vi cũ)",
    byQr.status === 403 && /hết hạn/.test(String(byQr.body?.message)),
    byQr.body
  );
  check("không tạo attendance cho member hết hạn gói", (await attendanceCount(member.memberProfileId, sA4)) === 0);
}

/** 6) Phân quyền: không mở quyền ghi attendance cho STAFF; member không tự sinh mã. */
async function scenarioAuthorization(ctx: Ctx, member: FixtureUser): Promise<void> {
  section("6) Phân quyền generate-qr / scan-qr / POST attendance");
  const sA1 = ctx.classA.scheduleIds[0];
  const sB1 = ctx.classB.scheduleIds[0];

  const coachAssigned = await generateQr(ctx.coach.token, sA1);
  check(
    "COACH được phân công lớp generate-qr → 200 kèm manualCode",
    coachAssigned.status === 200 && MANUAL_CODE_PATTERN.test(String(coachAssigned.body?.data?.manualCode)),
    coachAssigned.body
  );

  const coachNotAssigned = await generateQr(ctx.coach.token, sB1);
  check("COACH không phụ trách lớp → 403", coachNotAssigned.status === 403, coachNotAssigned.body);

  const memberGenerates = await generateQr(member.token, sA1);
  check("MEMBER gọi generate-qr → 403", memberGenerates.status === 403, memberGenerates.body);

  const staffGenerates = await generateQr(ctx.staff.token, sA1);
  check("STAFF gọi generate-qr → 403 (không mở quyền sinh mã)", staffGenerates.status === 403, staffGenerates.body);

  const coachScans = await scanQr(ctx.coach.token, { code: WRONG_CODE });
  check("COACH gọi scan-qr → 403 (chỉ MEMBER)", coachScans.status === 403, coachScans.body);

  const staffScans = await scanQr(ctx.staff.token, { code: WRONG_CODE });
  check("STAFF gọi scan-qr → 403", staffScans.status === 403, staffScans.body);

  const anonymous = await scanQr(undefined, { code: WRONG_CODE });
  check("không token gọi scan-qr → 401", anonymous.status === 401, anonymous.body);

  const staffWrites = await http("POST", "/attendance", {
    token: ctx.staff.token,
    body: { scheduleId: sA1, memberId: member.memberProfileId, status: "PRESENT" },
  });
  check("STAFF ghi attendance qua POST /attendance → 403 (giữ nguyên read-only)", staffWrites.status === 403, staffWrites.body);

  const memberWrites = await http("POST", "/attendance", {
    token: member.token,
    body: { scheduleId: sA1, memberId: member.memberProfileId, status: "PRESENT" },
  });
  check("MEMBER ghi attendance qua POST /attendance → 403", memberWrites.status === 403, memberWrites.body);
}

// ─── Cleanup + runner ─────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  const memberIds = created.memberProfileIds;
  if (memberIds.length > 0) {
    // Thứ tự theo FK: log thử mã → enrollment/attendance/penalty → invoice → payment → subscription → member.
    await prisma.attendanceManualCodeAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.enrollment.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.attendance.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.attendancePenalty.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.invoice.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.membershipSubscription.deleteMany({ where: { memberId: { in: memberIds } } });
  }
  if (created.userIds.length > 0) {
    // Mã dự phòng do manager/coach của fixture cấp (phòng khi class chưa cascade hết).
    await prisma.attendanceManualCode.deleteMany({ where: { createdBy: { in: created.userIds } } });
  }
  if (created.classIds.length > 0) {
    // Class cascade ClassSchedule / Enrollment / Attendance / ClassMember / AttendanceManualCode.
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
  console.log(`E2E attendance manual-code suite — run=${RUN} | api=${baseUrl}/api/v1`);

  const hashed = await hashPassword(PASSWORD);
  try {
    await setupRoom();
    const manager = await createUser("MANAGER", "manager", hashed);
    const coach = await createUser("COACH", "coach", hashed);
    const staff = await createUser("STAFF", "staff", hashed);
    const members: FixtureUser[] = [];
    for (let i = 1; i <= 6; i++) members.push(await createUser("MEMBER", `member${i}`, hashed));

    const classA = await createClass("A", 4, { coachProfileId: coach.coachProfileId });
    const classB = await createClass("B", 1);

    const plan = await createPlan(manager.token, {
      name: `E2E Attendance Plan ${RUN}`,
      price: 300000,
      durationDays: 30,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 5,
    });
    // member1..member5 có gói ACTIVE; member6 cố tình KHÔNG có gói để test chốt chặn 2.
    for (let i = 0; i < 5; i++) await subscribe(manager.token, members[i].memberProfileId, plan.id);

    // Đặt chỗ: 3 member vào buổi A1, member4 vào A3 (test throttle), member5 vào A1 (nhưng dùng mã của A2),
    // member6 vào A4 (không có gói).
    await enroll(members[0].memberProfileId, classA.classId, classA.scheduleIds[0]);
    await enroll(members[1].memberProfileId, classA.classId, classA.scheduleIds[0]);
    await enroll(members[2].memberProfileId, classA.classId, classA.scheduleIds[0]);
    await enroll(members[3].memberProfileId, classA.classId, classA.scheduleIds[2]);
    await enroll(members[4].memberProfileId, classA.classId, classA.scheduleIds[0]);
    await enroll(members[5].memberProfileId, classA.classId, classA.scheduleIds[3]);

    const ctx: Ctx = { manager, coach, staff, planId: plan.id, classA, classB };

    await scenarioQrRegression(ctx, members[0]);
    await scenarioManualCode(ctx, members[1]);
    await scenarioInputGuards(ctx, members[2]);
    await scenarioWrongScheduleMisuse(ctx, members[4]);
    await scenarioMemberThrottle(ctx, members[3]);
    await scenarioSubscriptionGate(ctx, members[5]);
    await scenarioAuthorization(ctx, members[0]);
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
    console.log("Toàn bộ kịch bản điểm danh bằng mã dự phòng PASS.");
  }
}

main().catch(async (err) => {
  console.error("Suite lỗi nghiêm trọng:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
