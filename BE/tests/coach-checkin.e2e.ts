/**
 * E2E: check-in phòng gym của HLV (Doc/COACH_TERMS.md §10) — Manager tạo QR, HLV quét ⇒ 1 ngày dùng phòng;
 * quá hạn mức miễn phí (hoặc thẻ không hợp lệ) ⇒ trừ phí từ tiền ròng của khóa cũ nhất còn dư, thiếu ⇒ ghi nợ.
 *
 * Các kịch bản phí gọi thẳng service với `now` + chính sách riêng (không phụ thuộc lịch thật / số ngày trong tháng);
 * lớp HTTP kiểm tra quyền, mã QR, quét lại, song song, nhật ký.
 * Chạy: npm run test:local -- coach-checkin
 */
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { COACH_CHECKIN } from "../src/config/coach-term.js";
import { vnDateKey, vnDateTime } from "../src/utils/vnTime.js";
import { coachCheckIn, issueCheckInQr, getCheckInUsage } from "../src/modules/terms/checkin.service.js";
import { check, group, http, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createUser, login, purchase, type TestUser } from "./helpers/fixtures.js";

const DAY = 86_400_000;
async function seasonedCoach(): Promise<TestUser> {
  const c = await createUser("COACH");
  await prisma.user.update({ where: { id: c.id }, data: { createdAt: new Date(Date.now() - 400 * DAY) } });
  return login(c);
}

const sessionsOf = (n: number, firstHours: number, stepHours = 96, status?: "COMPLETED" | "SCHEDULED") =>
  Array.from({ length: n }, (_, i) => ({ startInHours: firstHours + i * stepHours, status }));

/** Mốc "hôm nay + offset ngày" lúc 09:00 giờ VN của tháng hiện tại, ngày `day` (1..28) — luôn nằm trong CÙNG tháng/kỳ thật. */
const dayOfThisMonth = (day: number) => vnDateTime(`${vnDateKey(new Date()).slice(0, 7)}-${String(day).padStart(2, "0")}`, "09:00");

const wallet = (coach: TestUser) => prisma.coachWallet.findUniqueOrThrow({ where: { coachId: coach.coachProfileId! } });
const feeTxs = (coach: TestUser) =>
  prisma.walletTransaction.findMany({
    where: { wallet: { coachId: coach.coachProfileId! }, type: "CHECKIN_FEE" },
    orderBy: { createdAt: "asc" },
    include: { class: { select: { id: true, name: true } } },
  });

async function main() {
  const manager = await login(await createUser("MANAGER"));
  const member = await login(await createUser("MEMBER"));
  const member2 = await login(await createUser("MEMBER"));
  const token = () => issueCheckInQr(manager.id).token;

  // ───────────────────────── 1. QR & quyền ─────────────────────────
  group("1. Mã QR check-in do Manager tạo");
  const coachA = await seasonedCoach();
  const qr = await http("POST", "/terms/check-in/qr", { token: manager.token });
  check("Manager tạo QR ⇒ 200 kèm token + thời hạn", qr.status === 200 && typeof qr.body.data.token === "string" && qr.body.data.expiresIn === COACH_CHECKIN.QR_TTL_SECONDS, qr.body);
  const decoded: any = jwt.decode(qr.body.data.token);
  check("QR là JWT loại COACH_CHECKIN, hết hạn sau ~60 giây, ghi người phát hành", decoded?.type === "COACH_CHECKIN" && decoded.by === manager.id && decoded.exp - decoded.iat === COACH_CHECKIN.QR_TTL_SECONDS, decoded);
  check("COACH không tạo được QR ⇒ 403", (await http("POST", "/terms/check-in/qr", { token: coachA.token })).status === 403);
  check("MEMBER không tạo được QR ⇒ 403", (await http("POST", "/terms/check-in/qr", { token: member.token })).status === 403);
  check("không đăng nhập ⇒ 401", (await http("POST", "/terms/check-in/qr")).status === 401);
  check("Manager không quét check-in được ⇒ 403", (await http("POST", "/terms/check-in", { token: manager.token, body: { token: qr.body.data.token } })).status === 403);
  check("Member không quét check-in được ⇒ 403", (await http("POST", "/terms/check-in", { token: member.token, body: { token: qr.body.data.token } })).status === 403);

  const expired = jwt.sign({ type: "COACH_CHECKIN", by: manager.id }, env.JWT_ACCESS_SECRET, { expiresIn: -10 });
  const vExpired = await http("POST", "/terms/check-in", { token: coachA.token, body: { token: expired } });
  check("QR hết hạn ⇒ 400 CHECKIN_QR_EXPIRED", vExpired.status === 400 && vExpired.body.errors?.code === "CHECKIN_QR_EXPIRED", vExpired.body);
  const badTokens: [string, string][] = [
    ["chuỗi rác", "khong-phai-jwt-hop-le"],
    ["access token", manager.token!],
    ["thẻ HLV (COACH_PASS)", jwt.sign({ type: "COACH_PASS", coachId: coachA.coachProfileId }, env.JWT_ACCESS_SECRET, { expiresIn: 60 })],
    ["ký khóa khác", jwt.sign({ type: "COACH_CHECKIN", by: manager.id }, "khoa-gia-mao", { expiresIn: 60 })],
  ];
  for (const [name, t] of badTokens) {
    const r = await http("POST", "/terms/check-in", { token: coachA.token, body: { token: t } });
    check(`${name} ⇒ 400 CHECKIN_QR_INVALID`, r.status === 400 && r.body.errors?.code === "CHECKIN_QR_INVALID", r.body);
  }
  const pending = await createUser("COACH", { cert: "PENDING" });
  await login(pending);
  const notOk = await http("POST", "/terms/check-in", { token: pending.token, body: { token: token() } });
  check("HLV chưa được duyệt hồ sơ ⇒ 403 CHECKIN_NOT_ELIGIBLE", notOk.status === 403 && notOk.body.errors?.code === "CHECKIN_NOT_ELIGIBLE", notOk.body);

  // ───────────────────────── 2. Quét hằng ngày (HTTP) ─────────────────────────
  group("2. Quét check-in qua API");
  await createClass(coachA, { status: "APPROVED", sessions: sessionsOf(8, 24) });
  const me0 = await http("GET", "/terms/me", { token: coachA.token });
  const entitledNow = me0.body.data.pass.valid === true;
  const first = await http("POST", "/terms/check-in", { token: coachA.token, body: { token: token() } });
  const today = vnDateKey(new Date());
  check("quét lần đầu trong ngày ⇒ 201, ghi đúng ngày VN", first.status === 201 && first.body.data.checkIn.dayKey === today && first.body.data.alreadyCheckedIn === false, first.body);
  check("HLV có thẻ hợp lệ + còn hạn mức ⇒ miễn phí, không trừ ví", entitledNow ? first.body.data.checkIn.free === true && Number(first.body.data.checkIn.feeAssessed) === 0 : first.body.data.checkIn.free === false, first.body.data?.checkIn);
  check("usage: ngày thứ nhất, hạn mức 20 ngày/tháng", first.body.data.usage.daysUsed === 1 && first.body.data.usage.freeDaysPerMonth === COACH_CHECKIN.FREE_DAYS_PER_MONTH && first.body.data.usage.checkedInToday === true, first.body.data?.usage);
  const again = await http("POST", "/terms/check-in", { token: coachA.token, body: { token: token() } });
  check("quét lại trong ngày ⇒ 200 alreadyCheckedIn, không tính thêm", again.status === 200 && again.body.data.alreadyCheckedIn === true && again.body.data.usage.daysUsed === 1, again.body);
  check("DB chỉ có 1 dòng cho ngày hôm nay", (await prisma.coachCheckIn.count({ where: { coachId: coachA.coachProfileId!, dayKey: today } })) === 1);

  // Hai lần quét song song của cùng một HLV (ngày mới) ⇒ đúng 1 bản ghi.
  const coachRace = await seasonedCoach();
  const race = await Promise.all([0, 1, 2].map(() => http("POST", "/terms/check-in", { token: coachRace.token, body: { token: token() } })));
  const statuses = race.map((r) => r.status).sort();
  check("3 lần quét song song ⇒ đúng 1 lần 201, còn lại 200", statuses.join() === "200,200,201", statuses);
  check("song song vẫn chỉ 1 bản ghi", (await prisma.coachCheckIn.count({ where: { coachId: coachRace.coachProfileId! } })) === 1);

  const mine = await http("GET", "/terms/me/check-ins", { token: coachA.token });
  check("HLV xem mức dùng + các ngày gần đây", mine.status === 200 && mine.body.data.eligible === true && mine.body.data.items.length === 1 && mine.body.data.usage.daysUsed === 1, mine.body);
  check("hồ sơ chưa duyệt vẫn xem được mức dùng (rỗng, eligible=false)", (await http("GET", "/terms/me/check-ins", { token: pending.token })).body?.data?.eligible === false);
  check("MEMBER không xem được ⇒ 403", (await http("GET", "/terms/me/check-ins", { token: member.token })).status === 403);

  // ───────────────────────── 3. Phí: trừ từ khóa cũ nhất ─────────────────────────
  group("3. Trừ phí từ tiền ròng của khóa cũ nhất");
  const pay = { freeDaysPerMonth: 0, feePerDay: 20_000 };
  const coachP = await seasonedCoach();
  const oldCls = await createClass(coachP, { price: 20_000, sessions: sessionsOf(4, 24 * 5) }); // DEPOSIT 17.000
  const newCls = await createClass(coachP, { price: 100_000, sessions: sessionsOf(4, 24 * 7) }); // DEPOSIT 85.000
  await prisma.class.update({ where: { id: oldCls.cls.id }, data: { createdAt: new Date(Date.now() - 60 * DAY) } });
  await purchase(member, oldCls.cls, oldCls.schedules.map((s) => s.id));
  await purchase(member2, newCls.cls, newCls.schedules.map((s) => s.id));
  check("trước khi check-in: ví = 17.000 + 85.000", Number((await wallet(coachP)).balance) === 102_000);

  const d1 = dayOfThisMonth(10);
  const r1 = await coachCheckIn(coachP.id, token(), d1, pay);
  check("không còn miễn phí ⇒ phí 20.000, trừ đủ, không nợ", r1.checkIn.free === false && Number(r1.checkIn.feeAssessed) === 20_000 && Number(r1.checkIn.feeCharged) === 20_000 && Number(r1.checkIn.feeDebt) === 0, r1.checkIn);
  const tx1 = await feeTxs(coachP);
  check("trừ KHÓA CŨ NHẤT trước (17.000) rồi phần còn lại (3.000) từ khóa mới", tx1.length === 2 && tx1[0].classId === oldCls.cls.id && Number(tx1[0].amount) === 17_000 && tx1[1].classId === newCls.cls.id && Number(tx1[1].amount) === 3_000, tx1.map((t) => [t.class?.name, Number(t.amount)]));
  check("giao dịch ví loại CHECKIN_FEE, COMPLETED", tx1.every((t) => t.type === "CHECKIN_FEE" && t.status === "COMPLETED"));
  check("số dư ví giảm đúng 20.000", Number((await wallet(coachP)).balance) === 82_000);
  const w1 = await http("GET", "/coaches/me/wallet", { token: coachP.token });
  const nets = Object.fromEntries((w1.body.data.withdrawEligibility.classes as any[]).map((c) => [c.classId, c.netEarned]));
  check("tiền ròng từng khóa khớp: khóa cũ 0, khóa mới 82.000", nets[oldCls.cls.id] === 0 && nets[newCls.cls.id] === 82_000, nets);
  check("không có nợ", w1.body.data.checkinDebt === 0 && Number(w1.body.data.wallet.feeDebt) === 0, w1.body.data);
  const fee = await waitFor(() => prisma.notification.findFirst({ where: { userId: coachP.id, metadata: { path: ["kind"], equals: "COACH_CHECKIN_FEE" } } }));
  check("HLV nhận thông báo đã bị trừ phí", !!fee && /20\.000/.test(fee.body), fee?.body);
  const byManager = await http("GET", "/coaches/wallet/transactions?type=CHECKIN_FEE&limit=100", { token: manager.token });
  check("Manager lọc được giao dịch ví CHECKIN_FEE", byManager.status === 200 && byManager.body.data.some((t: any) => t.type === "CHECKIN_FEE"), byManager.body?.message);

  // ───────────────────────── 4. Hạn mức miễn phí tháng ─────────────────────────
  group("4. Hạn mức miễn phí theo tháng");
  const coachF = await seasonedCoach();
  await createClass(coachF, { price: 100_000, sessions: sessionsOf(8, 24) });
  const fCls = await createClass(coachF, { price: 100_000, sessions: sessionsOf(2, 24 * 40) });
  await purchase(member, fCls.cls, fCls.schedules.map((s) => s.id)); // ví có 85.000
  const policy2 = { freeDaysPerMonth: 2, feePerDay: 20_000 };
  const a = await coachCheckIn(coachF.id, token(), dayOfThisMonth(10), policy2);
  const b = await coachCheckIn(coachF.id, token(), dayOfThisMonth(11), policy2);
  const c = await coachCheckIn(coachF.id, token(), dayOfThisMonth(12), policy2);
  check("2 ngày đầu miễn phí (thẻ hợp lệ)", a.checkIn.free && b.checkIn.free && a.pass.valid, [a.checkIn.free, b.checkIn.free, a.pass.valid]);
  check("ngày thứ 3 vượt hạn mức ⇒ tính phí 20.000 và đã trừ", !c.checkIn.free && Number(c.checkIn.feeAssessed) === 20_000 && Number(c.checkIn.feeCharged) === 20_000, c.checkIn);
  check("thứ tự ngày dùng trong tháng 1, 2, 3", [a, b, c].map((x) => x.checkIn.dayIndex).join() === "1,2,3");
  check("usage sau ngày 3: dùng 3 ngày, 2 miễn phí, hết hạn mức", c.usage.daysUsed === 3 && c.usage.freeDaysUsed === 2 && c.usage.freeDaysLeft === 0 && c.usage.feeAssessedThisMonth === 20_000, c.usage);
  const rescan = await coachCheckIn(coachF.id, token(), dayOfThisMonth(11), policy2);
  check("quét lại ngày cũ ⇒ alreadyCheckedIn, không phát sinh phí", rescan.alreadyCheckedIn && (await feeTxs(coachF)).length === 1, rescan.alreadyCheckedIn);
  const usage = await getCheckInUsage(coachF.coachProfileId!, true, dayOfThisMonth(15), policy2);
  check("getCheckInUsage: còn 0 ngày miễn phí, 3 ngày đã dùng trong tháng", usage.freeDaysLeft === 0 && usage.daysUsed === 3, usage);

  // ───────────────────────── 5. Ví thiếu tiền ⇒ nợ ─────────────────────────
  group("5. Ví chưa đủ tiền ⇒ ghi nợ, trừ dần");
  const coachD = await seasonedCoach(); // chưa có tiền nào
  const rd1 = await coachCheckIn(coachD.id, token(), dayOfThisMonth(10), pay);
  check("ví trống ⇒ không trừ được, ghi nợ 20.000", Number(rd1.checkIn.feeCharged) === 0 && Number(rd1.checkIn.feeDebt) === 20_000 && rd1.usage.feeDebt === 20_000, rd1.checkIn);
  const rd2 = await coachCheckIn(coachD.id, token(), dayOfThisMonth(11), pay);
  check("ngày kế tiếp: nợ cộng dồn 40.000", rd2.usage.feeDebt === 40_000 && Number((await wallet(coachD)).feeDebt) === 40_000, rd2.usage);
  check("ví trống ⇒ chưa có giao dịch CHECKIN_FEE", (await feeTxs(coachD)).length === 0 && Number((await wallet(coachD)).balance) === 0);

  const debtCls = await createClass(coachD, { price: 100_000, sessions: sessionsOf(4, 24 * 5) });
  await purchase(member, debtCls.cls, debtCls.schedules.map((s) => s.id)); // +85.000
  const wd = await http("GET", "/coaches/me/wallet", { token: coachD.token });
  const wAfter = await wallet(coachD);
  check("khi ví có tiền, xem ví tự trừ nợ: nợ về 0, ví 85.000 − 40.000 = 45.000", wd.status === 200 && Number(wAfter.feeDebt) === 0 && Number(wAfter.balance) === 45_000, [Number(wAfter.feeDebt), Number(wAfter.balance)]);
  const settled = await feeTxs(coachD);
  check("khoản nợ được trừ vào đúng khóa còn tiền (CHECKIN_FEE 40.000)", settled.length === 1 && Number(settled[0].amount) === 40_000 && settled[0].classId === debtCls.cls.id, settled.map((t) => Number(t.amount)));

  // ───────────────────────── 6. Rút tiền tính cả phí ─────────────────────────
  group("6. Số dư khả dụng để rút đã trừ phí check-in");
  const coachW = await seasonedCoach();
  const done = await createClass(coachW, { price: 100_000, sessions: [{ startInHours: -96, status: "COMPLETED" as const }, { startInHours: -72, status: "COMPLETED" as const }] });
  await purchase(member, done.cls, done.schedules.map((s) => s.id)); // 85.000, khóa đã kết thúc
  const before = await http("GET", "/coaches/me/wallet", { token: coachW.token });
  check("trước phí: khả dụng 85.000", before.body.data.available === 85_000, before.body.data.available);
  await coachCheckIn(coachW.id, token(), dayOfThisMonth(10), pay);
  const afterFee = await http("GET", "/coaches/me/wallet", { token: coachW.token });
  check("sau phí 20.000: khả dụng 65.000 (khớp tiền ròng của khóa)", afterFee.body.data.available === 65_000 && Number(afterFee.body.data.wallet.balance) === 65_000, afterFee.body.data);
  const tooMuch = await http("POST", "/coaches/me/wallet/withdraw", { token: coachW.token, body: { amount: 70_000, bankInfo: { bankName: "MB", accountNumber: "0123456789", accountName: "E2E COACH" } } });
  check("rút quá phần khả dụng (70.000 > 65.000) ⇒ 400", tooMuch.status === 400, tooMuch.body);
  const okWd = await http("POST", "/coaches/me/wallet/withdraw", { token: coachW.token, body: { amount: 65_000, bankInfo: { bankName: "MB", accountNumber: "0123456789", accountName: "E2E COACH" } } });
  check("rút đúng phần khả dụng (65.000) ⇒ tạo lệnh rút", okWd.status === 201 || okWd.status === 200, okWd.body);

  // ───────────────────────── 7. Nhật ký của Manager ─────────────────────────
  group("7. Nhật ký check-in (Manager)");
  const list = await http("GET", `/terms/check-ins?dayKey=${today}&coachId=${coachA.coachProfileId}`, { token: manager.token });
  check("Manager lọc theo ngày + HLV ⇒ 1 dòng có tên HLV", list.status === 200 && list.body.data.items.length === 1 && !!list.body.data.items[0].coach.user.fullName, list.body);
  const month = await http("GET", `/terms/check-ins?monthKey=${today.slice(0, 7)}&coachId=${coachF.coachProfileId}`, { token: manager.token });
  check("lọc theo tháng + tổng hợp phí (3 ngày: 2 miễn phí, 1 trả phí 20.000)", month.status === 200 && month.body.data.summary.total === 3 && month.body.data.summary.free === 2 && month.body.data.summary.paid === 1 && month.body.data.summary.feeAssessed === 20_000 && month.body.data.summary.feeCharged === 20_000, month.body.data?.summary);
  check("ngày sai định dạng ⇒ 400", (await http("GET", "/terms/check-ins?dayKey=24-10-2026", { token: manager.token })).status === 400);
  check("COACH không xem nhật ký của người khác ⇒ 403", (await http("GET", "/terms/check-ins", { token: coachA.token })).status === 403);
}

async function waitFor<T>(fn: () => Promise<T | null | undefined>, ms = 4000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function cleanup() {
  await cleanupRun();
}

runSuite("coach-checkin", main, cleanup);
