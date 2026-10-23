import jwt from "jsonwebtoken";
import type { AcademicTerm, CoachLeaveStatus, CoachTermState, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { COACH_TERM } from "../../config/coach-term.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { addDaysToDateKey, vnDateKey, vnDateTime } from "../../utils/vnTime.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import {
  baseDeadline,
  DAY_MS,
  dayKeysBetween,
  ensureTermsAround,
  formatVnDate,
  previousTermKey,
  termOfDate,
  termPhase,
  type TermLike,
} from "./term-calendar.js";
import {
  evaluateCoaches,
  evaluationMetrics,
  loadRoster,
  type ManualExemption,
  type RosterCoach,
  type TermEvaluation,
} from "./term-evaluator.js";

type TermRow = AcademicTerm;

const STATE_RANK: Record<CoachTermState, number> = { NON_COMPLIANT: 0, PENDING: 1, COMPLIANT: 2, EXEMPT: 3 };

// ─── Serialize ──────────────────────────────────────────────────────────────

export function serializeTerm(term: TermRow, now: Date) {
  const deadline = baseDeadline(term);
  return {
    id: term.id,
    name: term.name,
    year: term.year,
    seq: term.seq,
    startDate: term.startDate,
    endDate: term.endDate,
    graceDays: term.graceDays,
    /** Hạn ân hạn cơ bản (chưa cộng nghỉ phép của từng Coach). */
    graceDeadline: deadline,
    phase: termPhase(term, now),
    daysToStart: Math.ceil((term.startDate.getTime() - now.getTime()) / DAY_MS),
    daysToEnd: Math.ceil((term.endDate.getTime() - now.getTime()) / DAY_MS),
  };
}

export function serializeEvaluation(ev: TermEvaluation) {
  return {
    state: ev.state,
    final: ev.final,
    phase: ev.phase,
    reasons: ev.reasons,
    warnings: ev.warnings,
    atRisk: ev.atRisk,
    deadlineAt: ev.deadlineAt,
    daysToDeadline: ev.daysToDeadline,
    registration: ev.registration,
    delivery: ev.delivery,
    leave: ev.leave,
  };
}

// ─── Kỳ học ─────────────────────────────────────────────────────────────────

export async function listTerms(now: Date = new Date()) {
  await ensureTermsAround(now);
  const terms = await prisma.academicTerm.findMany({ orderBy: [{ year: "asc" }, { seq: "asc" }] });
  return terms.map((t) => serializeTerm(t, now));
}

export async function getTermRow(id: string): Promise<TermRow> {
  const term = await prisma.academicTerm.findUnique({ where: { id } });
  if (!term) throw new AppError("Không tìm thấy kỳ học.", 404);
  return term;
}

/** Kỳ chứa `now` (bảo đảm đã tạo). */
export async function getCurrentTermRow(now: Date = new Date()): Promise<TermRow> {
  await ensureTermsAround(now);
  const { year, seq } = termOfDate(now);
  const term = await prisma.academicTerm.findUnique({ where: { year_seq: { year, seq } } });
  if (!term) throw new AppError("Không tìm thấy kỳ học hiện tại.", 500);
  return term;
}

export async function getCurrentTerm(now: Date = new Date()) {
  return serializeTerm(await getCurrentTermRow(now), now);
}

export async function updateTerm(id: string, data: { graceDays: number }, now: Date = new Date()) {
  const term = await getTermRow(id);
  if (now > term.endDate) throw new AppError("Kỳ đã kết thúc — không thể đổi hạn ân hạn.", 409);
  const updated = await prisma.academicTerm.update({ where: { id }, data: { graceDays: data.graceDays } });
  return serializeTerm(updated, now);
}

// ─── Đánh giá ───────────────────────────────────────────────────────────────

async function loadExemptions(termId: string, coachIds?: string[]): Promise<Map<string, ManualExemption>> {
  const rows = await prisma.coachTermStatus.findMany({
    where: { termId, manualExempt: true, ...(coachIds ? { coachId: { in: coachIds } } : {}) },
    select: { coachId: true, exemptReason: true },
  });
  return new Map(rows.map((r) => [r.coachId, { reason: r.exemptReason }]));
}

/** Đánh giá cả danh sách (hoặc một Coach) trong một kỳ — KHÔNG ghi DB. */
export async function computeTermEvaluations(term: TermLike, now: Date, only?: string | string[]) {
  const roster = await loadRoster(term, only);
  const exemptions = await loadExemptions(term.id, roster.map((r) => r.coachId));
  const evals = await evaluateCoaches(term, roster, now, exemptions);
  return { roster, evals };
}

/** Ghi kết quả đánh giá (upsert theo termId × coachId); KHÔNG đụng tới cờ miễn trừ và bậc nhắc đã gửi. */
export async function persistEvaluations(termId: string, evals: Map<string, TermEvaluation>, now: Date) {
  if (evals.size === 0) return;
  await prisma.$transaction(
    [...evals.values()].map((ev) =>
      prisma.coachTermStatus.upsert({
        where: { termId_coachId: { termId, coachId: ev.coachId } },
        create: {
          termId,
          coachId: ev.coachId,
          state: ev.state,
          metrics: evaluationMetrics(ev) as unknown as Prisma.InputJsonValue,
          evaluatedAt: now,
        },
        update: { state: ev.state, metrics: evaluationMetrics(ev) as unknown as Prisma.InputJsonValue, evaluatedAt: now },
      })
    )
  );
}

function summarize(evals: TermEvaluation[]) {
  const summary = { total: evals.length, PENDING: 0, COMPLIANT: 0, NON_COMPLIANT: 0, EXEMPT: 0, atRisk: 0 };
  for (const ev of evals) {
    summary[ev.state] += 1;
    if (ev.atRisk) summary.atRisk += 1;
  }
  return summary;
}

/** MANAGER: bảng Coach × kỳ (tính trực tiếp, không ghi DB). */
export async function getTermRoster(
  termId: string,
  query: { state?: CoachTermState; search?: string },
  now: Date = new Date()
) {
  const term = await getTermRow(termId);
  const { roster, evals } = await computeTermEvaluations(term, now);
  const rows = await prisma.coachTermStatus.findMany({
    where: { termId, coachId: { in: roster.map((r) => r.coachId) } },
    select: { coachId: true, manualExempt: true, exemptReason: true, exemptAt: true, lastReminderStage: true, evaluatedAt: true },
  });
  const stored = new Map(rows.map((r) => [r.coachId, r]));
  const needle = query.search?.trim().toLowerCase();

  const items = roster
    .map((coach) => ({ coach, ev: evals.get(coach.coachId)!, row: stored.get(coach.coachId) }))
    .filter(({ coach, ev }) => {
      if (query.state && ev.state !== query.state) return false;
      if (needle && !`${coach.fullName} ${coach.email}`.toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => STATE_RANK[a.ev.state] - STATE_RANK[b.ev.state] || a.coach.fullName.localeCompare(b.coach.fullName, "vi"))
    .map(({ coach, ev, row }) => ({
      coach: { id: coach.coachId, userId: coach.userId, fullName: coach.fullName, email: coach.email, avatarUrl: coach.avatarUrl },
      evaluation: serializeEvaluation(ev),
      manualExempt: row?.manualExempt ? { reason: row.exemptReason, at: row.exemptAt } : null,
      lastReminderStage: row?.lastReminderStage ?? 0,
      evaluatedAt: row?.evaluatedAt ?? null,
    }));

  return { term: serializeTerm(term, now), summary: summarize([...evals.values()]), coaches: items };
}

/** MANAGER: chạy đánh giá và LƯU kết quả của kỳ. Idempotent. */
export async function evaluateTerm(termId: string, now: Date = new Date()) {
  const term = await getTermRow(termId);
  const { evals } = await computeTermEvaluations(term, now);
  await persistEvaluations(term.id, evals, now);
  return { term: serializeTerm(term, now), summary: summarize([...evals.values()]), evaluatedAt: now };
}

// ─── Miễn trừ thủ công ──────────────────────────────────────────────────────

async function notifyCoach(coachId: string, title: string, body: string, metadata: Record<string, unknown>) {
  const coach = await prisma.coachProfile.findUnique({ where: { id: coachId }, select: { userId: true } });
  if (!coach) return;
  await enqueueNotification(prisma, { userId: coach.userId, type: "GENERAL", title, body, metadata });
  void flushNotificationOutbox().catch(() => {});
}

export async function exemptCoach(termId: string, coachId: string, managerUserId: string, reason: string, now: Date = new Date()) {
  const term = await getTermRow(termId);
  const coach = await prisma.coachProfile.findUnique({ where: { id: coachId }, select: { id: true } });
  if (!coach) throw new AppError("Không tìm thấy Coach.", 404);
  await prisma.coachTermStatus.upsert({
    where: { termId_coachId: { termId, coachId } },
    create: { termId, coachId, state: "EXEMPT", manualExempt: true, exemptReason: reason, exemptBy: managerUserId, exemptAt: now },
    update: { state: "EXEMPT", manualExempt: true, exemptReason: reason, exemptBy: managerUserId, exemptAt: now },
  });
  await notifyCoach(
    coachId,
    `Bạn được miễn yêu cầu ${term.name}`,
    `Quản lý đã miễn yêu cầu tạo khóa học của ${term.name} cho bạn. Lý do: ${reason}`,
    { kind: "COACH_TERM_EXEMPT", termId }
  );
  return refreshOne(term, coachId, now);
}

export async function unexemptCoach(termId: string, coachId: string, now: Date = new Date()) {
  const term = await getTermRow(termId);
  const row = await prisma.coachTermStatus.findUnique({ where: { termId_coachId: { termId, coachId } } });
  if (!row || !row.manualExempt) throw new AppError("Coach này chưa được miễn trừ trong kỳ.", 404);
  await prisma.coachTermStatus.update({
    where: { id: row.id },
    data: { manualExempt: false, exemptReason: null, exemptBy: null, exemptAt: null },
  });
  return refreshOne(term, coachId, now);
}

/** Đánh giá lại + lưu riêng một Coach (sau khi đổi miễn trừ / nghỉ phép). Trả về bản đánh giá, hoặc null nếu Coach không thuộc danh sách. */
async function refreshOne(term: TermRow, coachId: string, now: Date) {
  const { evals } = await computeTermEvaluations(term, now, coachId);
  await persistEvaluations(term.id, evals, now);
  const ev = evals.get(coachId);
  return ev ? serializeEvaluation(ev) : null;
}

// ─── Nghỉ phép / ốm ─────────────────────────────────────────────────────────

const LEAVE_SELECT = {
  id: true,
  coachId: true,
  startDate: true,
  endDate: true,
  kind: true,
  reason: true,
  status: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
} as const;

function leaveBounds(startKey: string, endKey: string) {
  return {
    startDate: vnDateTime(startKey, "00:00"),
    endDate: new Date(vnDateTime(addDaysToDateKey(endKey, 1), "00:00").getTime() - 1),
  };
}

async function getCoachProfileId(userId: string): Promise<string> {
  const coach = await prisma.coachProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!coach) throw new AppError("Không tìm thấy hồ sơ Coach.", 404);
  return coach.id;
}

export async function listMyLeaves(userId: string) {
  const coachId = await getCoachProfileId(userId);
  return prisma.coachLeave.findMany({ where: { coachId }, select: LEAVE_SELECT, orderBy: { startDate: "desc" }, take: 100 });
}

export async function createLeave(
  userId: string,
  input: { startDate: string; endDate: string; kind: string; reason: string },
  now: Date = new Date()
) {
  const coachId = await getCoachProfileId(userId);
  if (input.endDate < input.startDate) throw new AppError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.", 400);
  const days = dayKeysBetween(vnDateTime(input.startDate, "00:00"), vnDateTime(input.endDate, "00:00")).length;
  if (days > COACH_TERM.MAX_LEAVE_DAYS) {
    throw new AppError(`Đơn nghỉ tối đa ${COACH_TERM.MAX_LEAVE_DAYS} ngày.`, 400, { code: "LEAVE_TOO_LONG" });
  }
  const earliest = addDaysToDateKey(vnDateKey(now), -COACH_TERM.LEAVE_BACKDATE_DAYS);
  if (input.startDate < earliest) {
    throw new AppError(`Chỉ được xin nghỉ bù trong ${COACH_TERM.LEAVE_BACKDATE_DAYS} ngày gần nhất.`, 400, { code: "LEAVE_TOO_OLD" });
  }
  const { startDate, endDate } = leaveBounds(input.startDate, input.endDate);
  const overlap = await prisma.coachLeave.findFirst({
    where: { coachId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: endDate }, endDate: { gte: startDate } },
    select: { id: true },
  });
  if (overlap) throw new AppError("Đã có đơn nghỉ (chờ duyệt hoặc đã duyệt) trùng khoảng thời gian này.", 409, { code: "LEAVE_OVERLAP" });

  const leave = await prisma.coachLeave.create({
    data: { coachId, startDate, endDate, kind: input.kind, reason: input.reason },
    select: LEAVE_SELECT,
  });

  const coach = await prisma.coachProfile.findUniqueOrThrow({ where: { id: coachId }, select: { user: { select: { fullName: true } } } });
  const managers = await prisma.user.findMany({ where: { role: { name: "MANAGER" }, isActive: true }, select: { id: true } });
  for (const m of managers) {
    await enqueueNotification(prisma, {
      userId: m.id,
      type: "GENERAL",
      title: "Coach xin nghỉ phép",
      body: `${coach.user.fullName} xin nghỉ từ ${formatVnDate(startDate)} đến ${formatVnDate(endDate)}. Lý do: ${input.reason}`,
      metadata: { kind: "COACH_LEAVE_REQUESTED", leaveId: leave.id, coachId },
    });
  }
  void flushNotificationOutbox().catch(() => {});
  return leave;
}

export async function cancelMyLeave(userId: string, leaveId: string, now: Date = new Date()) {
  const coachId = await getCoachProfileId(userId);
  const leave = await prisma.coachLeave.findUnique({ where: { id: leaveId } });
  if (!leave || leave.coachId !== coachId) throw new AppError("Không tìm thấy đơn nghỉ.", 404);
  const cancellable = leave.status === "PENDING" || (leave.status === "APPROVED" && leave.startDate > now);
  if (!cancellable) throw new AppError("Chỉ hủy được đơn đang chờ duyệt hoặc đơn đã duyệt nhưng chưa bắt đầu.", 409, { code: "LEAVE_NOT_CANCELLABLE" });
  const updated = await prisma.coachLeave.update({ where: { id: leaveId }, data: { status: "CANCELLED" }, select: LEAVE_SELECT });
  if (leave.status === "APPROVED") await refreshTermsOfLeave(coachId, leave, now);
  return updated;
}

export async function listLeaves(query: { status?: CoachLeaveStatus; page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const where: Prisma.CoachLeaveWhereInput = query.status ? { status: query.status } : {};
  const [total, rows] = await Promise.all([
    prisma.coachLeave.count({ where }),
    prisma.coachLeave.findMany({
      where,
      select: { ...LEAVE_SELECT, coach: { select: { id: true, user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { leaves: rows, pagination: buildPaginationMeta(total, page, limit) };
}

export async function reviewLeave(
  leaveId: string,
  managerUserId: string,
  input: { action: "APPROVE" | "REJECT"; note?: string },
  now: Date = new Date()
) {
  const leave = await prisma.coachLeave.findUnique({ where: { id: leaveId } });
  if (!leave) throw new AppError("Không tìm thấy đơn nghỉ.", 404);
  const next: CoachLeaveStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
  // CAS: chỉ duyệt khi còn PENDING (tránh hai Manager duyệt cùng lúc).
  const claimed = await prisma.coachLeave.updateMany({
    where: { id: leaveId, status: "PENDING" },
    data: { status: next, reviewedBy: managerUserId, reviewedAt: now, reviewNote: input.note ?? null },
  });
  if (claimed.count === 0) throw new AppError("Đơn nghỉ đã được xử lý.", 409, { code: "LEAVE_ALREADY_REVIEWED" });

  const range = `${formatVnDate(leave.startDate)} – ${formatVnDate(leave.endDate)}`;
  await notifyCoach(
    leave.coachId,
    next === "APPROVED" ? "Đơn nghỉ phép đã được duyệt" : "Đơn nghỉ phép bị từ chối",
    next === "APPROVED"
      ? `Đơn nghỉ ${range} đã được duyệt. Hạn tạo khóa của kỳ được gia hạn tương ứng và buổi hủy trong thời gian nghỉ không bị tính.`
      : `Đơn nghỉ ${range} bị từ chối.${input.note ? ` Lý do: ${input.note}` : ""}`,
    { kind: "COACH_LEAVE_REVIEWED", leaveId, status: next }
  );
  if (next === "APPROVED") await refreshTermsOfLeave(leave.coachId, leave, now);
  return prisma.coachLeave.findUniqueOrThrow({ where: { id: leaveId }, select: LEAVE_SELECT });
}

/** Đánh giá lại Coach ở các kỳ giao với đơn nghỉ (lưu kết quả). Lỗi không làm hỏng thao tác chính. */
async function refreshTermsOfLeave(coachId: string, leave: { startDate: Date; endDate: Date }, now: Date) {
  try {
    await ensureTermsAround(now);
    const terms = await prisma.academicTerm.findMany({ where: { startDate: { lte: leave.endDate }, endDate: { gte: leave.startDate } } });
    for (const term of terms) await refreshOne(term, coachId, now);
  } catch (err) {
    console.warn("[TERMS] đánh giá lại sau đơn nghỉ lỗi:", (err as Error).message);
  }
}

// ─── Trạng thái của chính Coach + thẻ ra vào ────────────────────────────────

export interface PassVerdict {
  valid: boolean;
  level: "OK" | "WARN" | "DENY";
  reason: string;
}

/** Quyết định thẻ hợp lệ hay không từ kết quả kỳ hiện tại + kỳ liền trước. Hàm thuần. */
export function passVerdict(current: TermEvaluation | null, previous: TermEvaluation | null): PassVerdict {
  if (!current) return { valid: false, level: "DENY", reason: "Hồ sơ Coach chưa được duyệt hoặc tài khoản đang bị khóa." };
  switch (current.state) {
    case "COMPLIANT":
      return { valid: true, level: "OK", reason: "Đã đạt yêu cầu kỳ hiện tại." };
    case "EXEMPT":
      return { valid: true, level: "OK", reason: "Được miễn yêu cầu kỳ hiện tại." };
    case "NON_COMPLIANT":
      return { valid: false, level: "DENY", reason: current.reasons[0] ?? "Chưa đạt yêu cầu kỳ hiện tại." };
    default: {
      if (COACH_TERM.STRICT_AFTER_FAILED_TERM && previous?.state === "NON_COMPLIANT") {
        return { valid: false, level: "DENY", reason: "Kỳ trước chưa đạt — cần có khóa học hợp lệ của kỳ này để dùng thẻ." };
      }
      const left = Math.max(1, current.daysToDeadline ?? 1);
      return { valid: true, level: "WARN", reason: `Đang trong thời gian ân hạn — còn ${left} ngày để tạo khóa học hợp lệ.` };
    }
  }
}

/** Đánh giá Coach ở kỳ hiện tại và kỳ liền trước (để áp chính sách "kỳ trước chưa đạt"). */
async function evaluateCurrentAndPrevious(coachId: string, now: Date) {
  const current = await getCurrentTermRow(now);
  const prevKey = previousTermKey(current.year, current.seq);
  const previous = await prisma.academicTerm.findUnique({ where: { year_seq: { year: prevKey.year, seq: prevKey.seq } } });
  const [cur, prev] = await Promise.all([
    computeTermEvaluations(current, now, coachId),
    previous ? computeTermEvaluations(previous, now, coachId) : Promise.resolve(null),
  ]);
  return {
    current,
    previous,
    currentEval: cur.evals.get(coachId) ?? null,
    previousEval: prev?.evals.get(coachId) ?? null,
  };
}

/** COACH: trạng thái của tôi trong kỳ hiện tại. */
export async function getMyTermStatus(userId: string, now: Date = new Date()) {
  const coachId = await getCoachProfileId(userId);
  const { current, previous, currentEval, previousEval } = await evaluateCurrentAndPrevious(coachId, now);
  const verdict = passVerdict(currentEval, previousEval);
  return {
    eligible: currentEval !== null,
    term: serializeTerm(current, now),
    evaluation: currentEval ? serializeEvaluation(currentEval) : null,
    previousTerm: previous && previousEval ? { id: previous.id, name: previous.name, state: previousEval.state, final: previousEval.final } : null,
    pass: verdict,
    rules: {
      minSessions: COACH_TERM.MIN_MAIN_SESSIONS,
      minSpanDays: COACH_TERM.MIN_SPAN_DAYS,
      minCompletionRate: COACH_TERM.MIN_COMPLETION_RATE,
      maxCancelRate: COACH_TERM.MAX_CANCEL_RATE,
      minEvidenceRate: COACH_TERM.MIN_EVIDENCE_RATE,
    },
  };
}

interface CoachPassPayload {
  type: "COACH_PASS";
  coachId: string;
  userId: string;
}

/** COACH: cấp thẻ ra vào (JWT sống ~60 giây, app tự làm mới) kèm trạng thái hiện tại. */
export async function issueCoachPass(userId: string, now: Date = new Date()) {
  const coachId = await getCoachProfileId(userId);
  const { currentEval, previousEval } = await evaluateCurrentAndPrevious(coachId, now);
  const verdict = passVerdict(currentEval, previousEval);
  const payload: CoachPassPayload = { type: "COACH_PASS", coachId, userId };
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: COACH_TERM.PASS_TTL_SECONDS });
  return { token, expiresIn: COACH_TERM.PASS_TTL_SECONDS, verdict, state: currentEval?.state ?? null };
}

/** MANAGER: quét thẻ Coach ⇒ hợp lệ hay không + ghi nhật ký. Không tự khóa gì. */
export async function verifyCoachPass(token: string, managerUserId: string, now: Date = new Date()) {
  let payload: Partial<CoachPassPayload>;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<CoachPassPayload>;
  } catch (err) {
    if ((err as { name?: string }).name === "TokenExpiredError") {
      throw new AppError("Mã thẻ đã hết hạn. Nhờ Coach làm mới mã trên ứng dụng.", 400, { code: "PASS_EXPIRED" });
    }
    throw new AppError("Mã thẻ không hợp lệ.", 400, { code: "PASS_INVALID" });
  }
  if (payload.type !== "COACH_PASS" || !payload.coachId) {
    throw new AppError("Mã thẻ không hợp lệ.", 400, { code: "PASS_INVALID" });
  }
  const coach = await prisma.coachProfile.findUnique({
    where: { id: payload.coachId },
    select: { id: true, user: { select: { id: true, fullName: true, avatarUrl: true, isActive: true } } },
  });
  if (!coach) throw new AppError("Mã thẻ không hợp lệ.", 400, { code: "PASS_INVALID" });

  const { current, currentEval, previousEval } = await evaluateCurrentAndPrevious(coach.id, now);
  const verdict = coach.user.isActive
    ? passVerdict(currentEval, previousEval)
    : ({ valid: false, level: "DENY", reason: "Tài khoản Coach đang bị khóa." } as PassVerdict);

  await prisma.coachPassScan.create({
    data: {
      coachId: coach.id,
      scannedBy: managerUserId,
      valid: verdict.valid,
      state: currentEval?.state ?? null,
      termId: current.id,
      reason: verdict.reason,
    },
  });
  return {
    valid: verdict.valid,
    level: verdict.level,
    reason: verdict.reason,
    coach: { id: coach.id, fullName: coach.user.fullName, avatarUrl: coach.user.avatarUrl },
    state: currentEval?.state ?? null,
    previousState: previousEval?.state ?? null,
    term: { id: current.id, name: current.name },
    scannedAt: now,
  };
}

export async function listPassScans(query: { page?: string; limit?: string; valid?: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const where: Prisma.CoachPassScanWhereInput = query.valid === undefined ? {} : { valid: query.valid === "true" };
  const [total, rows] = await Promise.all([
    prisma.coachPassScan.count({ where }),
    prisma.coachPassScan.findMany({
      where,
      select: {
        id: true,
        valid: true,
        state: true,
        termId: true,
        reason: true,
        scannedBy: true,
        createdAt: true,
        coach: { select: { id: true, user: { select: { fullName: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { scans: rows, pagination: buildPaginationMeta(total, page, limit) };
}

export type { RosterCoach };
