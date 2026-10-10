/**
 * SMOKE TEST END-TO-END các luồng chính của Mobile trên BE ĐANG CHẠY (PostgreSQL local).
 *
 *   Terminal 1: npm run dev:local                 (BE + Socket.IO ở cổng PORT của .env.local)
 *   Terminal 2: npm run test:smoke:local          (SMOKE_BASE_URL mặc định http://localhost:8081)
 *
 * Luồng: Guest xem khóa → đăng ký/đăng nhập → quên mật khẩu OTP → HLV đăng ký + phiên giới hạn + nộp CV
 * → Manager duyệt → HLV tạo khóa kèm lịch → Manager duyệt khóa → Member mua + mock-confirm → hủy/đổi buổi
 * → điểm danh QR → hủy khóa & hoàn tiền → hoàn tất buổi → rút tiền + Manager duyệt → chat realtime.
 *
 * Dữ liệu tạo mới có tiền tố `smoke-<RUN>`; đọc OTP từ outbox của DB local (mail không gửi thật).
 * Dùng tài khoản seed: manager@sportscenter.com / Manager@123.
 */
import { prisma } from "../src/config/prisma.js";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error("[smoke] TỪ CHỐI: DATABASE_URL không phải PostgreSQL local.");
  process.exit(1);
}

const BASE = (process.env.SMOKE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8081}`).replace(/\/$/, "");
const RUN = `smoke-${Date.now().toString(36)}`;
const PASSWORD = "Smoke!2026";
let passed = 0;
const failures: string[] = [];

function step(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 500)}`}`);
  }
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown; form?: FormData } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      ...(opts.form ? {} : { "Content-Type": "application/json" }),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const at = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

async function login(email: string, password = PASSWORD) {
  const r = await api("POST", "/auth/login", { body: { email, password } });
  return r.body?.data as { accessToken: string; refreshToken: string; restricted: boolean };
}

/** Client Socket.IO v4 tối thiểu (Engine.IO qua WebSocket) — chỉ nhận sự kiện. */
class MiniSocket {
  events: { name: string; data: any }[] = [];
  connected = false;
  private ws: WebSocket;
  constructor(token: string) {
    this.ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/socket.io/?EIO=4&transport=websocket`);
    this.ws.onmessage = (m) => {
      const msg = String(m.data);
      if (msg.startsWith("0")) this.ws.send(`40${JSON.stringify({ token })}`); // OPEN ⇒ CONNECT kèm auth
      else if (msg === "2") this.ws.send("3"); // ping ⇒ pong
      else if (msg.startsWith("40")) this.connected = true;
      else if (msg.startsWith("42")) {
        const [name, data] = JSON.parse(msg.slice(2));
        this.events.push({ name, data });
      }
    };
  }
  async waitFor(name: string, timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const e = this.events.find((x) => x.name === name);
      if (e) return e;
      await sleep(100);
    }
    return null;
  }
  close() {
    this.ws.close();
  }
}

async function main() {
  console.log(`Smoke test → ${BASE} (RUN ${RUN})`);
  const health = await api("GET", "/health");
  if (health.status !== 200) throw new Error(`BE chưa chạy ở ${BASE} — chạy \`npm run dev:local\` trước.`);

  console.log("\n▶ Guest");
  const guestClasses = await api("GET", "/classes?limit=5");
  step("Guest xem danh sách khóa (BE-1)", guestClasses.status === 200 && Array.isArray(guestClasses.body.data), guestClasses.status);
  const fitness = await api("GET", "/classes/fitness");
  step("Guest xem danh mục bộ môn (BE-11)", fitness.status === 200, fitness.status);

  console.log("\n▶ Member: đăng ký, đăng nhập, quên mật khẩu OTP");
  const memberEmail = `${RUN}-member@example.test`;
  const reg = await api("POST", "/auth/register", { body: { email: memberEmail, password: PASSWORD, fullName: "Smoke Member" } });
  step("đăng ký Member", reg.status === 201, reg.body);
  const forgot = await api("POST", "/auth/forgot-password", { body: { email: memberEmail } });
  step("quên mật khẩu ⇒ 200, không lộ token", forgot.status === 200 && !JSON.stringify(forgot.body).includes("token"));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
  const mail = await prisma.notificationOutbox.findFirst({ where: { userId: user.id, type: "EMAIL_RESET_PASSWORD" }, orderBy: { createdAt: "desc" } });
  const otp = mail?.body.match(/letter-spacing:6px[^>]*>(\d{6})</)?.[1];
  const reset = await api("PATCH", "/auth/reset-password", { body: { email: memberEmail, otp, newPassword: "Smoke!2027" } });
  step("đặt lại bằng OTP", reset.status === 200, reset.body);
  const memberSession = await login(memberEmail, "Smoke!2027");
  step("đăng nhập bằng mật khẩu mới", !!memberSession?.accessToken);
  const member = memberSession.accessToken;

  console.log("\n▶ HLV: đăng ký, phiên giới hạn, nộp CV, Manager duyệt");
  const coachEmail = `${RUN}-coach@example.test`;
  const coachReg = await api("POST", "/auth/register", { body: { email: coachEmail, password: PASSWORD, fullName: "Smoke Coach", role: "COACH" } });
  step("đăng ký HLV ⇒ phiên giới hạn có refresh token (BE-9)", coachReg.body?.data?.restricted === true && !!coachReg.body.data.refreshToken);
  const restricted = await login(coachEmail);
  step("HLV chưa duyệt đăng nhập được, restricted:true", restricted?.restricted === true);
  const form = new FormData();
  form.append("cv", new Blob([Buffer.from("%PDF-1.4\n%smoke\n")], { type: "application/pdf" }), "cv.pdf");
  const cv = await api("POST", "/coaches/me/cv", { token: restricted.accessToken, form });
  step("nộp CV", cv.status === 201, cv.body);
  const manager = (await login("manager@sportscenter.com", "Manager@123")).accessToken;
  const pendingCvs = await api("GET", "/coaches/cv/pending?status=PENDING&limit=100", { token: manager });
  const profile = pendingCvs.body.data.find((p: any) => p.user.email === coachEmail);
  const cvFile = await fetch(`${BASE}/api/v1/coaches/${profile.id}/cv/file`, { headers: { Authorization: `Bearer ${manager}` } });
  step("Manager tải file CV (BE-8)", cvFile.status === 200);
  const approveCv = await api("PATCH", `/coaches/${profile.id}/cv/review`, { token: manager, body: { action: "APPROVE" } });
  step("Manager duyệt CV", approveCv.status === 200);
  const coachSession = await login(coachEmail);
  step("HLV đăng nhập bình thường (restricted:false)", coachSession.restricted === false);
  const coach = coachSession.accessToken;

  console.log("\n▶ HLV tạo khóa kèm lịch (BE-10), Manager duyệt");
  const rooms = await api("GET", "/rooms?areaType=INDOOR&limit=100", { token: coach });
  const room = rooms.body.data.find((r: any) => r.capacity >= 10);
  const mkPlan = (name: string, slots: [number, number][]) =>
    api("POST", "/class-schedules/activity-plan", {
      token: coach,
      body: {
        class: { name: `${RUN}-${name}`, fitness: "Smoke Yoga", capacity: 10, classType: "REGULAR", areaType: "INDOOR", price: 200000 },
        roomId: room.id,
        schedules: slots.map(([s, e]) => ({ startTime: at(s), endTime: at(e) })),
      },
    });
  // Khóa A: 1 buổi bắt đầu sau 45s (điểm danh, hoàn tất, rút tiền). Khóa B: 3 buổi xa (đổi/hủy buổi, hoàn tiền).
  const t0 = Date.now();
  const planA = await mkPlan("A", [[45_000, 105_000]]);
  const H = 3_600_000;
  const planB = await mkPlan("B", [[72 * H, 73 * H], [96 * H, 97 * H], [120 * H, 121 * H]]);
  step("tạo khóa A (1 buổi) + B (3 buổi) ⇒ schedulesCreated đúng", planA.body?.data?.schedulesCreated === 1 && planB.body?.data?.schedulesCreated === 3, [planA.body, planB.body]);
  const classA = planA.body.data.class.id;
  const classB = planB.body.data.class.id;
  for (const id of [classA, classB]) await api("PATCH", `/classes/${id}/review`, { token: manager, body: { action: "APPROVE" } });
  const approved = await api("GET", `/classes/${classA}`);
  step("Manager duyệt ⇒ Guest thấy khóa + summary (BE-12)", approved.status === 200 && approved.body.data.summary?.upcomingSessionCount === 1);

  console.log("\n▶ Member mua khóa (VietQR + mock-confirm)");
  const coachSocket = new MiniSocket(coach);
  for (const id of [classA, classB]) {
    const co = await api("POST", "/payments/sepay/checkout", { token: member, body: { classId: id } });
    const plan = await api("GET", `/classes/${id}/course-plan`, { token: member });
    step(`khóa ${id === classA ? "A" : "B"}: có giao dịch chờ ⇒ PENDING_PAYMENT (BE-13)`, plan.body.data.registration.purchase.status === "PENDING_PAYMENT");
    const ok = await api("POST", "/payments/sepay/mock-confirm", { token: member, body: { paymentId: co.body.data.paymentId } });
    step("mock-confirm ⇒ thanh toán thành công", ok.status === 200, ok.body);
  }
  step("mua xong trong thời hạn (trước giờ học của khóa A)", Date.now() - t0 < 45_000);
  const plansB = await api("GET", `/classes/${classB}/course-plan`, { token: member });
  step("khóa B: PURCHASED + đã ghi danh 3 buổi", plansB.body.data.registration.purchase.status === "PURCHASED" && plansB.body.data.registration.registeredSessions === 3);
  const myPays = await api("GET", "/payments/my?type=CLASS", { token: member });
  step("lịch sử thanh toán (BE-6) có 2 giao dịch", myPays.body.data?.length === 2);

  console.log("\n▶ Đổi / hủy buổi");
  const enr = await api("GET", `/enrollments/my?classId=${classB}&limit=100`, { token: member });
  const sorted = enr.body.data.sort((a: any, b: any) => a.schedule.startTime.localeCompare(b.schedule.startTime));
  const cancel = await api("DELETE", `/enrollments/${sorted[2].id}`, { token: member });
  step("hủy buổi 3", cancel.status === 200, cancel.body);
  const transfer = await api("POST", `/enrollments/${sorted[1].id}/transfer`, { token: member, body: { targetScheduleId: sorted[2].scheduleId } });
  step("đổi buổi 2 ⇒ buổi 3", transfer.status === 200, transfer.body);

  console.log("\n▶ Điểm danh QR (khóa A)");
  const schedA = (await api("GET", `/class-schedules?classId=${classA}`, { token: coach })).body.data[0];
  const qr = await api("POST", "/attendance/generate-qr", { token: coach, body: { scheduleId: schedA.id } });
  const scan = await api("POST", "/attendance/scan-qr", { token: member, body: { qrToken: qr.body.data.qrToken } });
  step("HLV mở QR, Member quét ⇒ PRESENT", scan.status === 200 && scan.body.data.status === "PRESENT", scan.body);
  const revoke = await api("DELETE", `/attendance/qr/${schedA.id}`, { token: coach });
  step("HLV đóng QR ⇒ thu hồi mã dự phòng (BE-18)", revoke.status === 200);

  console.log("\n▶ Hủy khóa B & hoàn tiền");
  const preview = await api("GET", `/refunds/course-cancellation/preview?classId=${classB}`, { token: member });
  step("xem trước được hủy (BE-16)", preview.body.data?.allowed === true, preview.body.data);
  const refundReq = await api("POST", "/refunds/course-cancellation", { token: member, body: { classId: classB, note: "Smoke" } });
  step("gửi yêu cầu hoàn tiền", refundReq.status === 201, refundReq.body);
  const approveRefund = await api("PATCH", `/refunds/${refundReq.body.data.id}/approve`, { token: manager, body: { note: "CK smoke" } });
  step("Manager duyệt hoàn tiền (memberNote/managerNote — L8)", approveRefund.body.data?.managerNote === "CK smoke" && approveRefund.body.data.memberNote === "Smoke");

  console.log("\n▶ Chat realtime (Socket.IO)");
  const contacts = await api("GET", "/chat/contacts", { token: member });
  const coachUser = await prisma.user.findUniqueOrThrow({ where: { email: coachEmail } });
  step("Member thấy HLV của khóa đã mua trong danh bạ (L10)", contacts.body.data.some((u: any) => u.id === coachUser.id));
  const sent = await api("POST", "/chat/messages", { token: member, body: { receiverId: coachUser.id, content: "Chào HLV (smoke)" } });
  step("gửi tin nhắn REST", sent.status === 201, sent.body);
  step("HLV nhận `newMessage` qua socket", !!(await coachSocket.waitFor("newMessage")));
  step("HLV nhận `notification:new` qua socket", !!(await coachSocket.waitFor("notification:new", 2000)));
  coachSocket.close();

  console.log("\n▶ Hoàn tất buổi, rút tiền theo khóa (L4), Manager duyệt (BE-7)");
  const waitMs = t0 + 106_000 - Date.now();
  if (waitMs > 0) {
    console.log(`  … chờ ${Math.ceil(waitMs / 1000)}s cho buổi của khóa A kết thúc`);
    await sleep(waitMs);
  }
  const complete = await api("PATCH", `/class-schedules/${schedA.id}/complete`, { token: coach });
  step("HLV hoàn tất buổi", complete.status === 200, complete.body);
  const wallet = await api("GET", "/coaches/me/wallet", { token: coach });
  step("ví: available = 85% khóa A (170.000)", wallet.body.data?.available === 170_000, wallet.body.data);
  const withdraw = await api("POST", "/coaches/me/wallet/withdraw", {
    token: coach,
    body: { amount: 170_000, bankInfo: { bankName: "MB", accountNumber: "123", accountName: "SMOKE" } },
  });
  step("tạo lệnh rút", withdraw.status === 201, withdraw.body);
  const list = await api("GET", "/coaches/wallet/transactions?status=PENDING&limit=100", { token: manager });
  step("Manager thấy lệnh rút (BE-7)", list.body.data?.some((t: any) => t.id === withdraw.body.data?.id));
  const review = await api("PATCH", `/coaches/wallet/transactions/${withdraw.body.data?.id}/review`, { token: manager, body: { action: "APPROVE" } });
  step("Manager duyệt rút tiền", review.status === 200, review.body);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const classes = await prisma.class.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } });
  const classIds = classes.map((c) => c.id);
  const members = await prisma.memberProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const memberIds = members.map((m) => m.id);
  await prisma.refund.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.walletTransaction.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { wallet: { coach: { userId: { in: ids } } } }] } });
  await prisma.sepayWebhookEvent.deleteMany({ where: { payment: { memberId: { in: memberIds } } } });
  await prisma.sepayBankTransaction.deleteMany({ where: { payment: { memberId: { in: memberIds } } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.attendance.deleteMany({ where: { schedule: { classId: { in: classIds } } } });
  await prisma.attendanceManualCode.deleteMany({ where: { schedule: { classId: { in: classIds } } } });
  await prisma.enrollment.deleteMany({ where: { schedule: { classId: { in: classIds } } } });
  await prisma.classSchedule.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.chatMessage.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notificationOutbox.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

main()
  .catch((err) => {
    failures.push(`lỗi không mong đợi: ${(err as Error).message}`);
    console.error(err);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("[smoke] dọn dữ liệu lỗi:", e));
    console.log(`\nSmoke: ${passed} passed, ${failures.length} failed`);
    for (const f of failures) console.log(`  - ${f}`);
    await prisma.$disconnect();
    process.exit(failures.length === 0 ? 0 : 1);
  });
