/**
 * E2E: kỳ học & quyền lợi của Coach (Doc/COACH_TERMS.md) — đánh giá "đạt kỳ", nghỉ phép, miễn trừ, thẻ ra vào, job nhắc.
 *
 * Mọi kỳ test là kỳ RIÊNG (tên có tiền tố RUN, năm ≥ 3000) với mốc tính từ "hôm nay" ⇒ không phụ thuộc lịch thật.
 * Chạy: npm run test:local -- coach-term
 */
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { COACH_TERM, REMINDER_STAGE } from "../src/config/coach-term.js";
import { vnDateKey, vnDateTime } from "../src/utils/vnTime.js";
import { maintainTerms } from "../src/modules/terms/term-notifications.js";
import { passVerdict } from "../src/modules/terms/terms.service.js";
import type { TermEvaluation } from "../src/modules/terms/term-evaluator.js";
import { check, group, http, RUN, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createUser, login, purchase, type TestUser } from "./helpers/fixtures.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;
let termSeq = 0;
const coachProfileIds: string[] = [];

/** 00:00 giờ VN của ngày chứa `ms`. */
const vnMidnight = (ms: number) => vnDateTime(vnDateKey(new Date(ms)), "00:00");

async function makeTerm(tag: string, startOffsetDays: number, lengthDays: number, graceDays = 14) {
  termSeq++;
  const startDate = vnMidnight(Date.now() + startOffsetDays * DAY);
  return prisma.academicTerm.create({
    data: {
      name: `${RUN}-${tag}`,
      year: 3000 + (Date.now() % 90_000) + termSeq,
      seq: 1,
      startDate,
      endDate: new Date(startDate.getTime() + lengthDays * DAY - 1),
      graceDays,
    },
  });
}

/** Coach "kỳ cựu": tài khoản tạo từ lâu ⇒ hạn ân hạn tính từ đầu kỳ (không phải từ lúc CV được duyệt). */
async function seasonedCoach(name?: string): Promise<TestUser> {
  const c = await createUser("COACH", { name });
  await prisma.user.update({ where: { id: c.id }, data: { createdAt: new Date(Date.now() - 400 * DAY) } });
  coachProfileIds.push(c.coachProfileId!);
  return login(c);
}

/** `n` buổi cách nhau `stepHours`, bắt đầu sau `firstHours` giờ (âm = đã qua). */
const sessionsOf = (n: number, firstHours: number, stepHours = 96, status?: "SCHEDULED" | "COMPLETED" | "CANCELLED") =>
  Array.from({ length: n }, (_, i) => ({ startInHours: firstHours + i * stepHours, status }));

async function roster(manager: TestUser, termId: string, extra = "") {
  const res = await http("GET", `/terms/${termId}/coaches?search=${RUN}${extra}`, { token: manager.token });
  const byId = new Map<string, any>();
  for (const row of res.body?.data?.coaches ?? []) byId.set(row.coach.id, row);
  return { res, byId };
}

const stateOf = (rows: Map<string, any>, coach: TestUser) => rows.get(coach.coachProfileId!)?.evaluation?.state;
const evalOf = (rows: Map<string, any>, coach: TestUser) => rows.get(coach.coachProfileId!)?.evaluation;

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 4000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function main() {
  const manager = await login(await createUser("MANAGER"));
  const member = await login(await createUser("MEMBER"));
  const outsider = await login(await createUser("COACH")); // coach thường để thử quyền
  coachProfileIds.push(outsider.coachProfileId!);

  // Ba kỳ test: T1 còn trong ân hạn, T2 đã quá ân hạn, T3 đã kết thúc.
  const t1 = await makeTerm("t1-grace", -10, 120);
  const t2 = await makeTerm("t2-active", -40, 120);
  const t3 = await makeTerm("t3-ended", -150, 130);

  // ── Dữ liệu ──
  const coachA = await seasonedCoach(); // khóa APPROVED hợp lệ
  const coachPending = await seasonedCoach(); // khóa PENDING hợp lệ
  const coachB = await seasonedCoach(); // không có khóa
  const coachGhost = await seasonedCoach(); // 8 buổi nhưng 7 buổi bị hủy
  const coachShort = await seasonedCoach(); // 8 buổi nhưng trải < 28 ngày
  const coachRejected = await seasonedCoach(); // khóa bị từ chối không tính
  const coachRisk = await seasonedCoach(); // đã đăng ký nhưng hủy nhiều
  const coachLeaveShort = await seasonedCoach(); // nghỉ ngắn ⇒ gia hạn ân hạn
  const coachLeaveLong = await seasonedCoach(); // nghỉ ≥ 50% kỳ ⇒ miễn
  const coachExempt = await seasonedCoach(); // Manager miễn trừ
  const newcomer = await createUser("COACH"); // vừa tạo tài khoản trong kỳ
  coachProfileIds.push(newcomer.coachProfileId!);
  await login(newcomer);
  const unapproved = await createUser("COACH", { cert: "PENDING" });
  coachProfileIds.push(unapproved.coachProfileId!);

  await createClass(coachA, { status: "APPROVED", sessions: sessionsOf(8, 24) });
  await createClass(coachPending, { status: "PENDING", sessions: sessionsOf(8, 24) });
  await createClass(coachGhost, { status: "APPROVED", sessions: [...sessionsOf(7, 24, 96, "CANCELLED"), { startInHours: 24 + 7 * 96 }] });
  await createClass(coachShort, { status: "APPROVED", sessions: sessionsOf(8, 24, 48) });
  await createClass(coachRejected, { status: "REJECTED", sessions: sessionsOf(8, 24) });
  await createClass(coachRisk, {
    status: "APPROVED",
    sessions: [
      { startInHours: -120, status: "COMPLETED" },
      { startInHours: -96, status: "COMPLETED" },
      ...[-72, -60, -48, -36].map((h) => ({ startInHours: h, status: "CANCELLED" as const })),
      ...sessionsOf(8, 24),
    ],
  });

  // ───────────────────────── 1. Kỳ học ─────────────────────────
  group("1. Kỳ học: danh sách, kỳ hiện tại, hạn ân hạn");
  const list = await http("GET", "/terms", { token: outsider.token });
  const real = list.body?.data ?? [];
  check("COACH xem được danh sách kỳ (≥ 3 kỳ, đủ trường)", list.status === 200 && real.length >= 3 && !!real[0].phase && !!real[0].graceDeadline, list.status);
  check("MEMBER không xem được ⇒ 403", (await http("GET", "/terms", { token: member.token })).status === 403);
  check("không đăng nhập ⇒ 401", (await http("GET", "/terms")).status === 401);
  const cur = await http("GET", "/terms/current", { token: outsider.token });
  const curTerm = cur.body?.data;
  check(
    "kỳ hiện tại chứa thời điểm hiện tại",
    cur.status === 200 && new Date(curTerm.startDate) <= new Date() && new Date() <= new Date(curTerm.endDate) && ["GRACE", "ACTIVE"].includes(curTerm.phase),
    curTerm
  );
  check("kỳ thật được tạo tự động theo lịch dương (4 tháng/kỳ)", curTerm.seq >= 1 && curTerm.seq <= 3 && new Date(curTerm.endDate) > new Date(curTerm.startDate));

  const grace = await http("PATCH", `/terms/${t1.id}`, { token: manager.token, body: { graceDays: 61 } });
  check("graceDays > 60 ⇒ 400", grace.status === 400, grace.body);
  check("COACH không đổi được ân hạn ⇒ 403", (await http("PATCH", `/terms/${t1.id}`, { token: outsider.token, body: { graceDays: 10 } })).status === 403);
  check("kỳ đã kết thúc ⇒ 409", (await http("PATCH", `/terms/${t3.id}`, { token: manager.token, body: { graceDays: 10 } })).status === 409);
  check("kỳ không tồn tại ⇒ 404", (await http("GET", "/terms/khong-co/coaches", { token: manager.token })).status === 404);

  // ───────────────────────── 2. Đăng ký kỳ ─────────────────────────
  group("2. Đánh giá đăng ký kỳ (kỳ T1 — còn ân hạn)");
  let r = await roster(manager, t1.id);
  check("MANAGER xem bảng Coach × kỳ ⇒ 200", r.res.status === 200 && !!r.res.body.data.summary, r.res.status);
  check("COACH không xem được bảng ⇒ 403", (await http("GET", `/terms/${t1.id}/coaches`, { token: outsider.token })).status === 403);
  check("Coach chưa duyệt CV không nằm trong danh sách", !r.byId.has(unapproved.coachProfileId!));
  const evA = evalOf(r.byId, coachA);
  check("khóa APPROVED ≥ 8 buổi, trải ≥ 28 ngày ⇒ COMPLIANT", evA?.state === "COMPLIANT" && evA.registration.ok && evA.registration.mainSessions === 8, evA);
  check("khóa PENDING vẫn tính (Manager duyệt chậm không phải lỗi Coach) + cờ pendingApproval", stateOf(r.byId, coachPending) === "COMPLIANT" && evalOf(r.byId, coachPending).registration.pendingApproval === true, evalOf(r.byId, coachPending));
  const evB = evalOf(r.byId, coachB);
  check("chưa có khóa, còn ân hạn ⇒ PENDING, còn ~4 ngày", evB?.state === "PENDING" && evB.daysToDeadline >= 3 && evB.daysToDeadline <= 5, evB);
  check("khóa ma (7/8 buổi bị hủy) KHÔNG tính ⇒ PENDING", stateOf(r.byId, coachGhost) === "PENDING" && evalOf(r.byId, coachGhost).registration.ok === false, evalOf(r.byId, coachGhost)?.registration);
  check("8 buổi nhưng trải < 28 ngày KHÔNG tính ⇒ PENDING", stateOf(r.byId, coachShort) === "PENDING" && evalOf(r.byId, coachShort).registration.spanDays < COACH_TERM.MIN_SPAN_DAYS, evalOf(r.byId, coachShort)?.registration);
  check("khóa REJECTED KHÔNG tính ⇒ PENDING", stateOf(r.byId, coachRejected) === "PENDING");
  const evRisk = evalOf(r.byId, coachRisk);
  check("đã đăng ký nhưng hủy nhiều ⇒ vẫn COMPLIANT giữa kỳ nhưng atRisk + cảnh báo", evRisk?.state === "COMPLIANT" && evRisk.atRisk === true && evRisk.warnings.length > 0 && evRisk.final === false, evRisk);
  const filtered = await roster(manager, t1.id, "&state=PENDING");
  check("lọc theo state=PENDING chỉ trả PENDING", [...filtered.byId.values()].every((x) => x.evaluation.state === "PENDING") && filtered.byId.size >= 4, filtered.byId.size);
  const sorted = [...r.byId.values()].map((x) => x.evaluation.state);
  const rank: Record<string, number> = { NON_COMPLIANT: 0, PENDING: 1, COMPLIANT: 2, EXEMPT: 3 };
  check("bảng sắp xếp: chưa đạt trước, miễn sau cùng", sorted.every((s, i) => i === 0 || rank[sorted[i - 1]] <= rank[s]), sorted);

  const g1 = await http("PATCH", `/terms/${t1.id}`, { token: manager.token, body: { graceDays: 30 } });
  check("Manager kéo dài ân hạn ⇒ 200", g1.status === 200 && g1.body.data.graceDays === 30, g1.body);
  r = await roster(manager, t1.id);
  check("ân hạn 30 ngày ⇒ coach chưa có khóa còn ~20 ngày", evalOf(r.byId, coachB).daysToDeadline >= 19 && evalOf(r.byId, coachB).daysToDeadline <= 21, evalOf(r.byId, coachB)?.daysToDeadline);
  await http("PATCH", `/terms/${t1.id}`, { token: manager.token, body: { graceDays: 14 } });

  // ───────────────────────── 3. Quá ân hạn ─────────────────────────
  group("3. Quá hạn ân hạn (kỳ T2)");
  r = await roster(manager, t2.id);
  check("chưa có khóa sau hạn ⇒ NON_COMPLIANT kèm lý do", stateOf(r.byId, coachB) === "NON_COMPLIANT" && /Chưa có khóa học hợp lệ/.test(evalOf(r.byId, coachB).reasons[0]), evalOf(r.byId, coachB));
  check("khóa ma sau hạn ⇒ NON_COMPLIANT", stateOf(r.byId, coachGhost) === "NON_COMPLIANT");
  check("khóa hợp lệ ⇒ vẫn COMPLIANT", stateOf(r.byId, coachA) === "COMPLIANT");
  const evNew = evalOf(r.byId, newcomer);
  check("Coach mới tạo TRONG kỳ: ân hạn tính từ lúc CV được duyệt ⇒ PENDING còn ~14 ngày", evNew?.state === "PENDING" && evNew.daysToDeadline >= 13 && evNew.daysToDeadline <= 15, evNew);

  // ───────────────────────── 4. Nghỉ phép ─────────────────────────
  group("4. Nghỉ phép / ốm");
  const today = vnDateKey(new Date());
  const plus = (days: number) => vnDateKey(new Date(Date.now() + days * DAY));
  check("MEMBER không xin nghỉ được ⇒ 403", (await http("POST", "/terms/me/leaves", { token: member.token, body: { startDate: today, endDate: plus(1), reason: "ốm" } })).status === 403);
  check("ngày kết thúc trước ngày bắt đầu ⇒ 400", (await http("POST", "/terms/me/leaves", { token: coachLeaveShort.token, body: { startDate: plus(5), endDate: plus(1), reason: "việc riêng" } })).status === 400);
  check("định dạng ngày sai ⇒ 400", (await http("POST", "/terms/me/leaves", { token: coachLeaveShort.token, body: { startDate: "5/11", endDate: "6/11", reason: "việc riêng" } })).status === 400);
  check("nghỉ bù quá xa trong quá khứ ⇒ 400", (await http("POST", "/terms/me/leaves", { token: coachLeaveShort.token, body: { startDate: plus(-60), endDate: plus(-50), reason: "ốm cũ" } })).status === 400);
  check("nghỉ quá 120 ngày ⇒ 400", (await http("POST", "/terms/me/leaves", { token: coachLeaveShort.token, body: { startDate: today, endDate: plus(200), reason: "dài" } })).status === 400);

  const before = evalOf((await roster(manager, t1.id)).byId, coachLeaveShort);
  const leaveShort = await http("POST", "/terms/me/leaves", { token: coachLeaveShort.token, body: { startDate: today, endDate: plus(9), kind: "SICK", reason: "Ốm sốt xuất huyết" } });
  check("Coach nộp đơn nghỉ 10 ngày ⇒ 201 PENDING", leaveShort.status === 201 && leaveShort.body.data.status === "PENDING", leaveShort.body);
  const dup = await http("POST", "/terms/me/leaves", { token: coachLeaveShort.token, body: { startDate: plus(3), endDate: plus(12), reason: "trùng" } });
  check("đơn trùng khoảng nghỉ ⇒ 409 LEAVE_OVERLAP", dup.status === 409 && dup.body.errors?.code === "LEAVE_OVERLAP", dup.body);
  const afterPending = evalOf((await roster(manager, t1.id)).byId, coachLeaveShort);
  check("đơn CHƯA duyệt ⇒ chưa gia hạn", afterPending.daysToDeadline === before.daysToDeadline && afterPending.leave.graceExtensionDays === 0, afterPending.leave);
  const mgrLeaves = await http("GET", "/terms/leaves?status=PENDING", { token: manager.token });
  check("Manager thấy đơn chờ duyệt kèm tên Coach", mgrLeaves.status === 200 && mgrLeaves.body.data.some((l: any) => l.id === leaveShort.body.data.id && l.coach.user.fullName), mgrLeaves.body?.message);
  check("COACH không duyệt được ⇒ 403", (await http("PATCH", `/terms/leaves/${leaveShort.body.data.id}/review`, { token: coachLeaveShort.token, body: { action: "APPROVE" } })).status === 403);
  const review = await http("PATCH", `/terms/leaves/${leaveShort.body.data.id}/review`, { token: manager.token, body: { action: "APPROVE", note: "OK" } });
  check("Manager duyệt ⇒ APPROVED", review.status === 200 && review.body.data.status === "APPROVED", review.body);
  check("duyệt lại ⇒ 409 LEAVE_ALREADY_REVIEWED", (await http("PATCH", `/terms/leaves/${leaveShort.body.data.id}/review`, { token: manager.token, body: { action: "REJECT" } })).body.errors?.code === "LEAVE_ALREADY_REVIEWED");
  const afterLeave = evalOf((await roster(manager, t1.id)).byId, coachLeaveShort);
  check("nghỉ được duyệt ⇒ gia hạn ân hạn (> 0 ngày) và hạn lùi lại", afterLeave.leave.graceExtensionDays > 0 && new Date(afterLeave.deadlineAt) > new Date(before.deadlineAt), afterLeave.leave);
  const notice = await waitFor(() => prisma.notification.findFirst({ where: { userId: coachLeaveShort.id, metadata: { path: ["kind"], equals: "COACH_LEAVE_REVIEWED" } } }));
  check("Coach nhận thông báo kết quả duyệt đơn", !!notice, notice);

  const mine = await http("GET", "/terms/me/leaves", { token: coachLeaveShort.token });
  check("Coach xem đơn của mình", mine.status === 200 && mine.body.data.length === 1, mine.body);
  const cancelOther = await http("DELETE", `/terms/me/leaves/${leaveShort.body.data.id}`, { token: outsider.token });
  check("Coach khác hủy đơn của người ta ⇒ 404", cancelOther.status === 404, cancelOther.status);

  // Đơn dài ≥ 50% kỳ T2 ⇒ miễn kỳ.
  const leaveLong = await http("POST", "/terms/me/leaves", { token: coachLeaveLong.token, body: { startDate: today, endDate: plus(59), kind: "PERSONAL", reason: "Nghỉ dài hạn" } });
  check("Coach nộp đơn nghỉ 60 ngày", leaveLong.status === 201, leaveLong.body);
  await http("PATCH", `/terms/leaves/${leaveLong.body.data.id}/review`, { token: manager.token, body: { action: "APPROVE" } });
  r = await roster(manager, t2.id);
  check("nghỉ ≥ 50% kỳ (60/120 ngày) ⇒ EXEMPT", stateOf(r.byId, coachLeaveLong) === "EXEMPT" && /Nghỉ phép/.test(evalOf(r.byId, coachLeaveLong).reasons[0]), evalOf(r.byId, coachLeaveLong));
  const cancelLong = await http("DELETE", `/terms/me/leaves/${leaveLong.body.data.id}`, { token: coachLeaveLong.token });
  check("hủy đơn đã duyệt nhưng ĐÃ bắt đầu ⇒ 409", cancelLong.status === 409 && cancelLong.body.errors?.code === "LEAVE_NOT_CANCELLABLE", cancelLong.body);

  const rejectMe = await http("POST", "/terms/me/leaves", { token: coachRisk.token, body: { startDate: plus(30), endDate: plus(35), reason: "đi du lịch" } });
  await http("PATCH", `/terms/leaves/${rejectMe.body.data.id}/review`, { token: manager.token, body: { action: "REJECT", note: "Trùng cao điểm" } });
  const rejected = await prisma.coachLeave.findUnique({ where: { id: rejectMe.body.data.id } });
  check("Manager từ chối ⇒ REJECTED kèm ghi chú", rejected?.status === "REJECTED" && rejected.reviewNote === "Trùng cao điểm", rejected);
  const cancelPending = await http("POST", "/terms/me/leaves", { token: coachRisk.token, body: { startDate: plus(40), endDate: plus(41), reason: "việc nhà" } });
  const cancelOk = await http("DELETE", `/terms/me/leaves/${cancelPending.body.data.id}`, { token: coachRisk.token });
  check("Coach hủy đơn đang chờ duyệt ⇒ CANCELLED", cancelOk.status === 200 && cancelOk.body.data.status === "CANCELLED", cancelOk.body);

  // ───────────────────────── 5. Miễn trừ thủ công ─────────────────────────
  group("5. Miễn trừ của Manager");
  check("COACH không miễn trừ được ⇒ 403", (await http("PUT", `/terms/${t2.id}/coaches/${coachExempt.coachProfileId}/exempt`, { token: outsider.token, body: { reason: "x y z" } })).status === 403);
  check("thiếu lý do ⇒ 400", (await http("PUT", `/terms/${t2.id}/coaches/${coachExempt.coachProfileId}/exempt`, { token: manager.token, body: { reason: "" } })).status === 400);
  check("trước khi miễn: NON_COMPLIANT", stateOf((await roster(manager, t2.id)).byId, coachExempt) === "NON_COMPLIANT");
  const ex = await http("PUT", `/terms/${t2.id}/coaches/${coachExempt.coachProfileId}/exempt`, { token: manager.token, body: { reason: "Đi công tác nước ngoài" } });
  check("Manager miễn trừ ⇒ 200, EXEMPT", ex.status === 200 && ex.body.data.evaluation?.state === "EXEMPT", ex.body);
  r = await roster(manager, t2.id);
  check("bảng hiển thị EXEMPT + lý do thủ công", stateOf(r.byId, coachExempt) === "EXEMPT" && r.byId.get(coachExempt.coachProfileId!).manualExempt?.reason === "Đi công tác nước ngoài", r.byId.get(coachExempt.coachProfileId!));
  const exNotice = await waitFor(() => prisma.notification.findFirst({ where: { userId: coachExempt.id, metadata: { path: ["kind"], equals: "COACH_TERM_EXEMPT" } } }));
  check("Coach nhận thông báo được miễn", !!exNotice);
  const ev1 = await http("POST", `/terms/${t2.id}/evaluate`, { token: manager.token });
  check("chạy đánh giá + lưu ⇒ 200 kèm tổng hợp", ev1.status === 200 && ev1.body.data.summary.total >= 8, ev1.body);
  const saved = await prisma.coachTermStatus.findUnique({ where: { termId_coachId: { termId: t2.id, coachId: coachExempt.coachProfileId! } } });
  check("đánh giá tự động KHÔNG ghi đè miễn trừ thủ công", saved?.state === "EXEMPT" && saved.manualExempt === true, saved);
  const savedB = await prisma.coachTermStatus.findUnique({ where: { termId_coachId: { termId: t2.id, coachId: coachB.coachProfileId! } } });
  check("kết quả được lưu (state + metrics + evaluatedAt)", savedB?.state === "NON_COMPLIANT" && !!savedB.evaluatedAt && !!(savedB.metrics as any)?.registration, savedB);
  const ev2 = await http("POST", `/terms/${t2.id}/evaluate`, { token: manager.token });
  check("chạy lại đánh giá idempotent (cùng số liệu)", ev2.status === 200 && JSON.stringify(ev2.body.data.summary) === JSON.stringify(ev1.body.data.summary), ev2.body.data?.summary);
  const un = await http("DELETE", `/terms/${t2.id}/coaches/${coachExempt.coachProfileId}/exempt`, { token: manager.token });
  check("bỏ miễn trừ ⇒ quay lại NON_COMPLIANT", un.status === 200 && un.body.data.evaluation?.state === "NON_COMPLIANT", un.body);
  check("bỏ miễn trừ lần nữa ⇒ 404", (await http("DELETE", `/terms/${t2.id}/coaches/${coachExempt.coachProfileId}/exempt`, { token: manager.token })).status === 404);

  // ───────────────────────── 6. Chốt cuối kỳ ─────────────────────────
  group("6. Chốt cuối kỳ (kỳ T3 đã kết thúc)");
  const coachGood = await seasonedCoach(); // dạy đủ, có bằng chứng, có buổi dạy bù
  const coachNoEvidence = await seasonedCoach(); // có học viên nhưng không có bằng chứng dạy
  const coachAwaiting = await seasonedCoach(); // buổi đã qua nhưng không bấm Hoàn tất
  const coachCancelMany = await seasonedCoach(); // hủy > 20%
  const coachNobody = await seasonedCoach(); // không có khóa nào trong kỳ
  const mem2 = await login(await createUser("MEMBER"));
  const past = (n: number, status: "COMPLETED" | "SCHEDULED") => sessionsOf(n, -110 * 24, 96, status);

  const good = await createClass(coachGood, { sessions: past(8, "COMPLETED") });
  await purchase(mem2, good.cls, good.schedules.map((s) => s.id));
  await prisma.attendance.createMany({ data: good.schedules.map((s) => ({ scheduleId: s.id, memberId: mem2.memberProfileId!, status: "PRESENT" as const })) });
  // Một buổi chính bị hủy nhưng đã dạy bù ⇒ KHÔNG tính là hủy.
  const cancelledMain = await prisma.classSchedule.create({
    data: { classId: good.cls.id, roomId: good.roomId, startTime: new Date(Date.now() - 75 * 24 * HOUR), endTime: new Date(Date.now() - 75 * 24 * HOUR + HOUR), status: "CANCELLED" },
  });
  await prisma.classSchedule.create({
    data: { classId: good.cls.id, roomId: good.roomId, startTime: new Date(Date.now() - 74 * 24 * HOUR), endTime: new Date(Date.now() - 74 * 24 * HOUR + HOUR), status: "COMPLETED", makeupForId: cancelledMain.id },
  });

  const noEv = await createClass(coachNoEvidence, { sessions: past(8, "COMPLETED") });
  await purchase(mem2, noEv.cls, noEv.schedules.map((s) => s.id));
  await createClass(coachAwaiting, { sessions: past(8, "SCHEDULED") });
  await createClass(coachCancelMany, {
    sessions: [...sessionsOf(10, -110 * 24, 96, "COMPLETED"), ...sessionsOf(4, -60 * 24, 24, "CANCELLED")],
  });

  r = await roster(manager, t3.id);
  const evGood = evalOf(r.byId, coachGood);
  check("dạy đủ + có bằng chứng + buổi hủy đã dạy bù ⇒ COMPLIANT (final)", evGood?.state === "COMPLIANT" && evGood.final === true && evGood.delivery.cancelled === 0, evGood);
  const evNoEv = evalOf(r.byId, coachNoEvidence);
  check("có học viên nhưng không có điểm danh/QR ⇒ NON_COMPLIANT (thiếu bằng chứng)", evNoEv?.state === "NON_COMPLIANT" && evNoEv.reasons.some((x: string) => /bằng chứng/.test(x)), evNoEv);
  const evAwait = evalOf(r.byId, coachAwaiting);
  check("buổi đã qua nhưng không bấm Hoàn tất ⇒ NON_COMPLIANT (tỷ lệ dạy 0%)", evAwait?.state === "NON_COMPLIANT" && evAwait.delivery.awaitingComplete === 8, evAwait);
  const evCancel = evalOf(r.byId, coachCancelMany);
  check("hủy > 20% ⇒ NON_COMPLIANT", evCancel?.state === "NON_COMPLIANT" && evCancel.delivery.cancelRate > COACH_TERM.MAX_CANCEL_RATE, evCancel?.delivery);
  check("không có khóa nào trong kỳ đã kết thúc ⇒ NON_COMPLIANT", stateOf(r.byId, coachNobody) === "NON_COMPLIANT");
  check("Coach tạo tài khoản SAU khi kỳ kết thúc không bị đánh giá kỳ đó", !r.byId.has(newcomer.coachProfileId!));

  // Buổi hủy trong thời gian nghỉ phép được duyệt không tính.
  const sickDay = new Date(Date.now() - 60 * DAY);
  const leaveInPast = await prisma.coachLeave.create({
    data: {
      coachId: coachCancelMany.coachProfileId!,
      startDate: vnMidnight(sickDay.getTime() - 5 * DAY),
      endDate: new Date(vnMidnight(sickDay.getTime() + 30 * DAY).getTime() - 1),
      reason: "Nghỉ ốm đã duyệt",
      status: "APPROVED",
    },
  });
  r = await roster(manager, t3.id);
  const evCancelLeave = evalOf(r.byId, coachCancelMany);
  check("buổi hủy trong thời gian nghỉ được duyệt không tính ⇒ COMPLIANT", evCancelLeave?.state === "COMPLIANT" && evCancelLeave.delivery.leaveCancelled === 4 && evCancelLeave.delivery.cancelled === 0, evCancelLeave?.delivery);
  await prisma.coachLeave.delete({ where: { id: leaveInPast.id } });

  // ───────────────────────── 7. Thẻ ra vào ─────────────────────────
  group("7. Thẻ ra vào của Coach");
  const termEnd = new Date(curTerm.endDate).getTime();
  const nearEnd = termEnd - Date.now() < 45 * DAY; // các buổi test (28 ngày) có thể tràn sang kỳ sau
  const me = await http("GET", "/terms/me", { token: coachA.token });
  check("Coach xem trạng thái của mình ⇒ 200 + luật + thẻ", me.status === 200 && me.body.data.eligible === true && !!me.body.data.rules && !!me.body.data.pass, me.body);
  check("MEMBER không xem được /terms/me ⇒ 403", (await http("GET", "/terms/me", { token: member.token })).status === 403);
  check("Coach chưa duyệt CV ⇒ eligible=false", (await http("GET", "/terms/me", { token: (await login(unapproved)).token })).body?.data?.eligible === false);

  const passA = await http("GET", "/terms/me/pass", { token: coachA.token });
  check("Coach nhận mã thẻ (JWT sống ngắn)", passA.status === 200 && typeof passA.body.data.token === "string" && passA.body.data.expiresIn === COACH_TERM.PASS_TTL_SECONDS, passA.body);
  const decoded: any = jwt.decode(passA.body.data.token);
  check("mã thẻ không chứa userId thô, có type COACH_PASS và hết hạn sau ~60 giây", decoded?.type === "COACH_PASS" && decoded.exp - decoded.iat === COACH_TERM.PASS_TTL_SECONDS, decoded);
  check("mã thẻ KHÔNG dùng được làm access token ⇒ 401", (await http("GET", "/terms/me", { token: passA.body.data.token })).status === 401);
  check("MEMBER không lấy được thẻ ⇒ 403", (await http("GET", "/terms/me/pass", { token: member.token })).status === 403);

  const verifyA = await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: passA.body.data.token } });
  if (!nearEnd) {
    check("Manager quét thẻ Coach có khóa hợp lệ ⇒ valid, level OK", verifyA.status === 200 && verifyA.body.data.valid === true && verifyA.body.data.level === "OK" && verifyA.body.data.state === "COMPLIANT", verifyA.body);
  } else {
    check("(gần cuối kỳ thật — bỏ kiểm tra COMPLIANT) quét thẻ ⇒ 200", verifyA.status === 200, verifyA.body);
  }
  const passNew = await http("GET", "/terms/me/pass", { token: newcomer.token });
  const verifyNew = await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: passNew.body.data.token } });
  check("Coach mới chưa có khóa, còn ân hạn ⇒ valid nhưng level WARN", verifyNew.status === 200 && verifyNew.body.data.valid === true && verifyNew.body.data.level === "WARN", verifyNew.body);
  check("thẻ có tên Coach, không lộ email", verifyNew.body.data.coach.fullName === (await prisma.user.findUniqueOrThrow({ where: { id: newcomer.id } })).fullName && !("email" in verifyNew.body.data.coach));

  const expired = jwt.sign({ type: "COACH_PASS", coachId: coachA.coachProfileId, userId: coachA.id }, env.JWT_ACCESS_SECRET, { expiresIn: -10 });
  const vExpired = await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: expired } });
  check("thẻ hết hạn ⇒ 400 PASS_EXPIRED", vExpired.status === 400 && vExpired.body.errors?.code === "PASS_EXPIRED", vExpired.body);
  const vGarbage = await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: "khong-phai-jwt-hop-le" } });
  check("chuỗi rác ⇒ 400 PASS_INVALID", vGarbage.status === 400 && vGarbage.body.errors?.code === "PASS_INVALID", vGarbage.body);
  const vWrongType = await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: manager.token } });
  check("access token / QR loại khác ⇒ 400 PASS_INVALID", vWrongType.status === 400 && vWrongType.body.errors?.code === "PASS_INVALID", vWrongType.body);
  const forged = jwt.sign({ type: "COACH_PASS", coachId: coachA.coachProfileId }, "secret-gia-mao", { expiresIn: 60 });
  check("thẻ ký bằng khóa khác ⇒ 400 PASS_INVALID", (await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: forged } })).body.errors?.code === "PASS_INVALID");
  check("COACH không quét được thẻ ⇒ 403", (await http("POST", "/terms/pass/verify", { token: coachA.token, body: { token: passA.body.data.token } })).status === 403);

  // Coach kỳ cựu, chưa có khóa, kỳ thật đã qua ân hạn ⇒ thẻ bị từ chối.
  const oldNoClass = coachNobody; // seasoned: createdAt cũ ⇒ ân hạn tính từ đầu kỳ thật
  const passOld = await http("GET", "/terms/me/pass", { token: oldNoClass.token });
  const vOld = await http("POST", "/terms/pass/verify", { token: manager.token, body: { token: passOld.body.data.token } });
  const realGraceOver = Date.now() > new Date(curTerm.graceDeadline).getTime();
  if (realGraceOver) {
    check("Coach kỳ cựu, quá ân hạn kỳ thật, chưa có khóa ⇒ thẻ bị từ chối (DENY)", vOld.status === 200 && vOld.body.data.valid === false && vOld.body.data.level === "DENY", vOld.body);
  } else {
    check("(đang trong ân hạn kỳ thật) Coach kỳ cựu chưa có khóa ⇒ WARN", vOld.body.data.level === "WARN", vOld.body);
  }
  const scans = await http("GET", "/terms/pass/scans", { token: manager.token });
  const myScans = (scans.body?.data ?? []).filter((s: any) => [coachA.coachProfileId, newcomer.coachProfileId, oldNoClass.coachProfileId].includes(s.coach.id));
  check("nhật ký quét ghi lại các lần quét hợp lệ/không hợp lệ (không ghi thẻ lỗi)", scans.status === 200 && myScans.length === 3, myScans.length);
  const invalidOnly = await http("GET", "/terms/pass/scans?valid=false", { token: manager.token });
  check("lọc nhật ký valid=false", invalidOnly.status === 200 && invalidOnly.body.data.every((s: any) => s.valid === false), invalidOnly.body?.message);
  check("COACH không xem nhật ký ⇒ 403", (await http("GET", "/terms/pass/scans", { token: coachA.token })).status === 403);

  // Hàm thuần passVerdict — chính sách "kỳ trước chưa đạt".
  const fake = (state: TermEvaluation["state"], days: number | null = 5): TermEvaluation =>
    ({ state, reasons: [`lý do ${state}`], daysToDeadline: days } as unknown as TermEvaluation);
  check("passVerdict: PENDING + kỳ trước NON_COMPLIANT ⇒ từ chối", passVerdict(fake("PENDING"), fake("NON_COMPLIANT")).valid === false);
  check("passVerdict: PENDING + kỳ trước đạt ⇒ WARN hợp lệ", passVerdict(fake("PENDING"), fake("COMPLIANT")).level === "WARN");
  check("passVerdict: COMPLIANT dù kỳ trước chưa đạt ⇒ hợp lệ", passVerdict(fake("COMPLIANT"), fake("NON_COMPLIANT")).valid === true);
  check("passVerdict: EXEMPT ⇒ hợp lệ; NON_COMPLIANT ⇒ từ chối; không có đánh giá ⇒ từ chối", passVerdict(fake("EXEMPT"), null).valid && !passVerdict(fake("NON_COMPLIANT"), null).valid && !passVerdict(null, null).valid);

  // ───────────────────────── 8. Job nhắc ─────────────────────────
  group("8. Job nhắc + báo cáo Manager (giả lập thời gian)");
  const tn = await makeTerm("tn-notify", 20, 120, 14); // kỳ bắt đầu sau 20 ngày
  const tnRow = await prisma.academicTerm.findUniqueOrThrow({ where: { id: tn.id } });
  const coachX = await seasonedCoach(); // không có khóa
  const coachY = await seasonedCoach(); // có khóa hợp lệ
  await createClass(coachY, { sessions: sessionsOf(8, 21 * 24) });
  const scope = { coachIds: [coachX.coachProfileId!, coachY.coachProfileId!], managerIds: [manager.id] };
  const at = (days: number) => new Date(tn.startDate.getTime() + days * DAY);
  const remindersOf = (c: TestUser) =>
    prisma.notification.findMany({ where: { userId: c.id, metadata: { path: ["kind"], equals: "COACH_TERM_REMINDER" } }, orderBy: { createdAt: "asc" } });
  const stagesOf = async (c: TestUser) => (await remindersOf(c)).map((n) => (n.metadata as any).stage);

  let m = await maintainTerms([tnRow], at(-10), scope);
  check("T-10 ngày: Coach chưa có khóa nhận nhắc bậc PRE_14, Coach đã có khóa thì không", m.coachReminders === 1 && (await stagesOf(coachX)).join() === `${REMINDER_STAGE.PRE_14}` && (await stagesOf(coachY)).length === 0, m);
  m = await maintainTerms([tnRow], at(-10), scope);
  check("chạy lại cùng thời điểm ⇒ không gửi trùng", m.coachReminders === 0 && (await stagesOf(coachX)).length === 1, m);
  m = await maintainTerms([tnRow], at(-3), scope);
  check("T-3 ngày: nhận bậc PRE_7", (await stagesOf(coachX)).join() === `${REMINDER_STAGE.PRE_14},${REMINDER_STAGE.PRE_7}`, await stagesOf(coachX));
  m = await maintainTerms([tnRow], at(10), scope);
  const stages10 = await stagesOf(coachX);
  check("bỏ lỡ nhiều bậc ⇒ chỉ gửi bậc MỚI NHẤT (DEADLINE_7), không dồn", stages10.at(-1) === REMINDER_STAGE.DEADLINE_7 && stages10.length === 3, stages10);
  const bodyDeadline = (await remindersOf(coachX)).at(-1)!.body;
  check("nội dung nhắc nêu số ngày còn lại và hạn", /Còn \d+ ngày/.test((await remindersOf(coachX)).at(-1)!.title) && /Hạn tạo khóa/.test(bodyDeadline), bodyDeadline);
  m = await maintainTerms([tnRow], at(20), scope);
  const stages20 = await stagesOf(coachX);
  check("quá hạn: Coach chưa có khóa nhận bậc OVERDUE", stages20.at(-1) === REMINDER_STAGE.OVERDUE, stages20);
  check("quá hạn: Coach đã có khóa KHÔNG bị nhắc", (await stagesOf(coachY)).length === 0);
  check("quá hạn: Manager nhận báo cáo tổng hợp (1 lần)", m.managerReports === 1, m);
  const mgrReport = await prisma.notification.findMany({ where: { userId: manager.id, metadata: { path: ["kind"], equals: "COACH_TERM_MANAGER_REPORT" } } });
  const nameX = (await prisma.user.findUniqueOrThrow({ where: { id: coachX.id } })).fullName;
  check("báo cáo Manager nêu tên Coach chưa đạt", mgrReport.length === 1 && mgrReport[0].body.includes(nameX), mgrReport[0]?.body);
  m = await maintainTerms([tnRow], at(20), scope);
  check("chạy lại lúc quá hạn ⇒ không báo cáo / nhắc trùng", m.managerReports === 0 && m.coachReminders === 0, m);
  const afterTerm = new Date(tn.endDate.getTime() + DAY);
  m = await maintainTerms([await prisma.academicTerm.findUniqueOrThrow({ where: { id: tn.id } })], afterTerm, scope);
  const stagesEnd = await stagesOf(coachX);
  check("hết kỳ: Coach chưa đạt nhận bậc RESULT", stagesEnd.at(-1) === REMINDER_STAGE.RESULT, stagesEnd);
  check("hết kỳ: Manager nhận báo cáo kết quả", m.managerReports === 1 && (await prisma.notification.count({ where: { userId: manager.id, metadata: { path: ["kind"], equals: "COACH_TERM_MANAGER_REPORT" } } })) === 2);
  const persisted = await prisma.coachTermStatus.findUnique({ where: { termId_coachId: { termId: tn.id, coachId: coachX.coachProfileId! } } });
  check("job ghi lại kết quả + bậc nhắc cuối", persisted?.state === "NON_COMPLIANT" && persisted.lastReminderStage === REMINDER_STAGE.RESULT, persisted);

  check("COACH không chạy được job ⇒ 403", (await http("POST", "/terms/maintenance", { token: coachA.token })).status === 403);
}

async function cleanup() {
  // Thông báo "xin nghỉ" gửi cho MANAGER (có thể là Manager thật trong DB dev) — dọn theo coachId.
  for (const id of coachProfileIds) {
    await prisma.notification.deleteMany({ where: { metadata: { path: ["coachId"], equals: id } } });
    await prisma.notificationOutbox.deleteMany({ where: { metadata: { path: ["coachId"], equals: id } } });
  }
  await cleanupRun();
}

runSuite("coach-term", main, cleanup);
