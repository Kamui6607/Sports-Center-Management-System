/**
 * E2E THẬT (HTTP + PostgreSQL) cho B07 (job vòng đời gói) + C11 (báo cáo doanh thu):
 * 1) `expireStaleSubscriptions` — gói quá endDate → EXPIRED + notification; chạy lại idempotent.
 * 2) `sendSubscriptionExpiryReminders` — nhắc trước N ngày; dedupe trong cửa sổ giờ.
 * 3) `closeStaleSepayPendingPayments` — SePay PENDING quá TTL → FAILED + note; không lặp khi chạy lại.
 * 4) `GET /reports/revenue` — gross (paidAt) / refundedAmount / netRevenue; `recentPayments` cùng
 *    cohort CASH (paidAt != null, không lẫn đơn PENDING).
 *
 * Chạy: cd BE && npm run test:e2e:lifecycle
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";
import {
  closeStaleSepayPendingPayments,
  expireStaleSubscriptions,
  sendSubscriptionExpiryReminders,
} from "../src/modules/subscriptions/subscription-lifecycle.service.js";
import { flushNotificationOutbox } from "../src/modules/notifications/outbox.service.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eLife!2026";
const DAY = 24 * 60 * 60 * 1000;

let baseUrl = "";

type HttpResult = { status: number; body: any; text: string };

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/api/v1${urlPath}`, {
    method,
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
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
  return { status: res.status, body, text };
}

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

/** Ngày hôm nay theo giờ VN (YYYY-MM-DD) — khớp boundary BR-26 của report. */
function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const created = {
  userIds: [] as string[],
  memberProfileIds: [] as string[],
  planIds: [] as string[],
};

type FixtureUser = { id: string; email: string; token: string };

async function createUser(
  role: "MEMBER" | "MANAGER",
  tag: string,
  hashedPassword: string
): Promise<FixtureUser> {
  const email = `e2e-life-${RUN}-${tag.toLowerCase()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: `E2E Life ${tag} ${RUN}`,
      role,
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : {}),
      ...(role === "MANAGER" ? { managerProfile: { create: {} } } : {}),
    },
    include: { memberProfile: true },
  });
  created.userIds.push(user.id);
  if (user.memberProfile) created.memberProfileIds.push(user.memberProfile.id);
  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const token = login.body?.data?.accessToken as string | undefined;
  if (login.status !== 200 || !token) {
    throw new Error(`Login failed for fixture ${email}: ${safe(login.body)}`);
  }
  return { id: user.id, email, token };
}

async function cleanup(): Promise<void> {
  const memberIds = created.memberProfileIds;
  if (memberIds.length > 0) {
    await prisma.invoice.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.membershipSubscription.deleteMany({ where: { memberId: { in: memberIds } } });
  }
  if (created.userIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }
  if (created.planIds.length > 0) {
    await prisma.membershipPlan.deleteMany({ where: { id: { in: created.planIds } } });
  }
}

// ─── Helpers nghiệp vụ ────────────────────────────────────────────────────
async function createPlan(managerToken: string, payload: Record<string, unknown>) {
  const res = await http("POST", "/membership-plans", { token: managerToken, body: payload });
  if (res.status !== 201) throw new Error(`createPlan failed: ${safe(res.body)}`);
  created.planIds.push(res.body.data.id);
  return res.body.data;
}

async function subscribe(managerToken: string, memberProfileId: string, planId: string) {
  const res = await http("POST", "/subscriptions", {
    token: managerToken,
    body: { memberId: memberProfileId, planId, paymentMethod: "CASH" },
  });
  if (res.status !== 201) throw new Error(`subscribe failed: ${safe(res.body)}`);
  return res.body.data.subscription.id as string;
}

/** B07 — đếm notification theo subscription (metadata.subscriptionId). */
function notificationCount(userId: string, title: string, subscriptionId: string) {
  return prisma.notification.count({
    where: {
      userId,
      title,
      metadata: { path: ["subscriptionId"], equals: subscriptionId },
    },
  });
}

/**
 * Gửi hết outbox đang chờ (flush theo lô 20 → cần lặp để test tất định khi DB có backlog).
 * Tối đa `rounds` lượt để tránh treo nếu có row lỗi tạm thời (backoff sẽ đẩy availableAt lên tương lai).
 */
async function drainOutbox(rounds = 50) {
  for (let i = 0; i < rounds; i++) {
    const sent = await flushNotificationOutbox(100);
    if (sent === 0) return;
  }
}

// ─── Scenario B07 ─────────────────────────────────────────────────────────
async function scenarioExpireStale(manager: FixtureUser, member: FixtureUser, planId: string) {
  section("1) B07 — gói quá hạn → EXPIRED + thông báo (chạy lại idempotent)");
  await drainOutbox(); // dọn backlog để flush của job chắc chắn tới row của test
  const subId = await subscribe(manager.token, created.memberProfileIds[0], planId);
  await prisma.membershipSubscription.update({
    where: { id: subId },
    data: { endDate: new Date(Date.now() - DAY) },
  });

  const first = await expireStaleSubscriptions();
  await drainOutbox();
  const afterFirst = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  const expiredNotifs = await notificationCount(member.id, "Gói tập đã hết hạn", subId);
  check(
    "Gói quá endDate → stored-state EXPIRED",
    afterFirst?.status === "EXPIRED",
    { expired: first.expired, status: afterFirst?.status }
  );
  check(
    "Có đúng 1 thông báo SUBSCRIPTION_EXPIRED cho gói",
    expiredNotifs === 1,
    { expiredNotifs }
  );

  await expireStaleSubscriptions();
  await drainOutbox();
  const afterSecond = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  const expiredNotifs2 = await notificationCount(member.id, "Gói tập đã hết hạn", subId);
  check(
    "Chạy lại job → không tạo thêm thông báo (idempotent)",
    afterSecond?.status === "EXPIRED" && expiredNotifs2 === 1,
    { status: afterSecond?.status, expiredNotifs2 }
  );
  return subId;
}

async function scenarioExpiryReminder(manager: FixtureUser, member: FixtureUser, planId: string) {
  section("2) B07 — nhắc sắp hết hạn (dedupe 24h)");
  await drainOutbox();
  const subId = await subscribe(manager.token, created.memberProfileIds[0], planId);
  await prisma.membershipSubscription.update({
    where: { id: subId },
    data: { endDate: new Date(Date.now() + 2 * DAY) },
  });

  const first = await sendSubscriptionExpiryReminders();
  await drainOutbox();
  const remindNotifs = await notificationCount(member.id, "Gói tập sắp hết hạn", subId);
  check(
    "Gói còn 2 ngày → gửi nhắc (SUBSCRIPTION_EXPIRING)",
    remindNotifs === 1,
    { sent: first.sent, remindNotifs }
  );

  await sendSubscriptionExpiryReminders();
  await drainOutbox();
  const remindNotifs2 = await notificationCount(member.id, "Gói tập sắp hết hạn", subId);
  check(
    "Chạy lại trong 24h → không gửi trùng",
    remindNotifs2 === 1,
    { remindNotifs2 }
  );
}

async function scenarioCloseStalePending() {
  section("3) B07 — SePay PENDING quá TTL → FAILED + note (không lặp khi chạy lại)");
  const memberProfileId = created.memberProfileIds[0];
  const stale = await prisma.payment.create({
    data: {
      memberId: memberProfileId,
      amount: 50000,
      method: "SEPAY",
      status: "PENDING",
      gateway: "SEPAY",
      transactionCode: `E2E-JOB-${RUN}`,
      note: "E2E stale pending",
      createdAt: new Date(Date.now() - 30 * DAY),
    },
  });

  const first = await closeStaleSepayPendingPayments();
  const afterFirst = await prisma.payment.findUnique({ where: { id: stale.id } });
  check(
    "PENDING quá TTL → FAILED + note 'Hết hạn chờ thanh toán'",
    afterFirst?.status === "FAILED" &&
      String(afterFirst?.note ?? "").includes("Hết hạn chờ thanh toán"),
    { closed: first.closed, status: afterFirst?.status, note: afterFirst?.note }
  );

  await closeStaleSepayPendingPayments();
  const afterSecond = await prisma.payment.findUnique({ where: { id: stale.id } });
  const markerCount = String(afterSecond?.note ?? "").split("Hết hạn chờ thanh toán").length - 1;
  check(
    "Chạy lại job → KHÔNG ghi note lần hai",
    afterSecond?.status === "FAILED" && markerCount === 1,
    { status: afterSecond?.status, markerCount }
  );
}

// ─── Scenario C11 ─────────────────────────────────────────────────────────
async function scenarioRevenueReport(manager: FixtureUser) {
  section("4) C11 — revenue report: gross/refunded/net + cohort cash vs đơn");
  const memberProfileId = created.memberProfileIds[0];
  const day = todayVN();
  const report = async () => {
    const res = await http("GET", `/reports/revenue?startDate=${day}&endDate=${day}`, {
      token: manager.token,
    });
    if (res.status !== 200) throw new Error(`revenue report failed: ${safe(res.body)}`);
    return res.body.data as Record<string, any>;
  };

  const before = await report();

  // Fixture: 1 khoản THU ĐƯỢC + 1 khoản ĐÃ HOÀN (cùng ngày, cùng member).
  await prisma.payment.create({
    data: {
      memberId: memberProfileId,
      amount: 300000,
      method: "CASH",
      status: "SUCCESS",
      paidAt: new Date(),
      createdAt: new Date(),
      note: `E2E C11 success ${RUN}`,
    },
  });
  await prisma.payment.create({
    data: {
      memberId: memberProfileId,
      amount: 200000,
      method: "CASH",
      status: "REFUNDED",
      paidAt: new Date(),
      createdAt: new Date(),
      note: `E2E C11 refunded ${RUN}`,
    },
  });

  const after = await report();
  const delta = (key: string) => Number(after[key] ?? 0) - Number(before[key] ?? 0);

  check(
    "C11: totalRevenue (gross, cohort paidAt) tăng đúng 300.000",
    delta("totalRevenue") === 300000,
    delta("totalRevenue")
  );
  check(
    "C11: refundedAmount tăng đúng 200.000 (không còn bị bỏ qua)",
    delta("refundedAmount") === 200000,
    delta("refundedAmount")
  );
  check(
    "C11: netRevenue = gross − refunded (+100.000)",
    delta("netRevenue") === 100000,
    delta("netRevenue")
  );
  check(
    "C11: successPayments/refundedPayments +1 (cùng cohort paidAt)",
    delta("successPayments") === 1 && delta("refundedPayments") === 1,
    { success: delta("successPayments"), refunded: delta("refundedPayments") }
  );
  check(
    "C11: totalPayments (đơn tạo trong kỳ theo createdAt) +2",
    delta("totalPayments") === 2,
    delta("totalPayments")
  );

  const recent = (after.recentPayments ?? []) as Array<Record<string, any>>;
  check(
    "C11: recentPayments cùng cohort CASH (mọi dòng có paidAt, không lẫn PENDING)",
    recent.length > 0 &&
      recent.every((p) => p.paidAt !== null && p.paidAt !== undefined && p.status !== "PENDING"),
    recent.map((p) => ({ id: p.id, status: p.status, paidAt: p.paidAt }))
  );
  check(
    "C11: note mô tả gross/refunded/net + giới hạn refund ledger",
    String(after.note ?? "").includes("netRevenue") &&
      String(after.note ?? "").includes("REFUNDED"),
    after.note
  );
}

// ─── Runner ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`E2E subscription lifecycle (B07 + C11) — run=${RUN} | api=${baseUrl}/api/v1`);

  const hashed = await hashPassword(PASSWORD);
  try {
    const manager = await createUser("MANAGER", "manager", hashed);
    const member = await createUser("MEMBER", "member", hashed);
    const plan = await createPlan(manager.token, {
      name: `E2E Lifecycle Plan ${RUN}`,
      price: 100000,
      durationDays: 30,
      tier: "MEMBERSHIP",
      maxConcurrentClasses: 3,
    });

    await scenarioExpireStale(manager, member, plan.id);
    await scenarioExpiryReminder(manager, member, plan.id);
    await scenarioCloseStalePending();
    await scenarioRevenueReport(manager);
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
    console.log("\nDanh sách FAIL:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
