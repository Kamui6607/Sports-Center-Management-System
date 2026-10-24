import { prisma } from "../../config/prisma.js";
import { COACH_TERM, REMINDER_STAGE, type ReminderStage } from "../../config/coach-term.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { baseDeadline, DAY_MS, ensureTermsAround, formatVnDate, type TermLike } from "./term-calendar.js";
import type { TermEvaluation } from "./term-evaluator.js";
import { computeTermEvaluations, persistEvaluations } from "./terms.service.js";

/**
 * Job nhắc & đánh giá kỳ học của Coach (idempotent, an toàn khi nhiều instance cùng chạy):
 * - Đánh giá lại và lưu kết quả của các kỳ "đang liên quan" (sắp bắt đầu / đang chạy / mới kết thúc).
 * - Gửi MỖI Coach tối đa một thông báo cho mỗi bậc (CAS trên `lastReminderStage`); bỏ lỡ nhiều bậc thì chỉ gửi bậc mới nhất.
 * - Gửi Manager báo cáo tổng hợp ở bậc quá hạn và bậc kết quả (CAS trên `AcademicTerm.managerReportStage`).
 * Thông báo dùng loại `GENERAL` + `metadata.kind` để khỏi phải sửa enum trên DB dùng chung.
 */

const STAGES: ReminderStage[] = [
  REMINDER_STAGE.PRE_14,
  REMINDER_STAGE.PRE_7,
  REMINDER_STAGE.PRE_1,
  REMINDER_STAGE.START,
  REMINDER_STAGE.DEADLINE_7,
  REMINDER_STAGE.DEADLINE_1,
  REMINDER_STAGE.OVERDUE,
  REMINDER_STAGE.RESULT,
];

/** Thời điểm bắt đầu của một bậc với hạn ân hạn `deadlineAt` (các bậc "gần hạn" không sớm hơn đầu kỳ). */
export function stageTime(stage: ReminderStage, term: Pick<TermLike, "startDate" | "endDate">, deadlineAt: Date): Date {
  const start = term.startDate.getTime();
  switch (stage) {
    case REMINDER_STAGE.PRE_14:
      return new Date(start - 14 * DAY_MS);
    case REMINDER_STAGE.PRE_7:
      return new Date(start - 7 * DAY_MS);
    case REMINDER_STAGE.PRE_1:
      return new Date(start - DAY_MS);
    case REMINDER_STAGE.START:
      return term.startDate;
    case REMINDER_STAGE.DEADLINE_7:
      return new Date(Math.max(start, deadlineAt.getTime() - 7 * DAY_MS));
    case REMINDER_STAGE.DEADLINE_1:
      return new Date(Math.max(start, deadlineAt.getTime() - DAY_MS));
    case REMINDER_STAGE.OVERDUE:
      return deadlineAt;
    default:
      return new Date(term.endDate.getTime() + 1);
  }
}

/** Bậc mới nhất đã đến hạn tại `now` (0 = chưa tới bậc nào). */
export function dueStageAt(term: Pick<TermLike, "startDate" | "endDate">, deadlineAt: Date, now: Date): number {
  let due = 0;
  for (const stage of STAGES) {
    if (stageTime(stage, term, deadlineAt) <= now) due = Math.max(due, stage);
  }
  return due;
}

/** Bậc này có cần gửi cho Coach với kết quả đánh giá `ev` không. */
export function stageApplies(stage: number, ev: TermEvaluation): boolean {
  const needsCourse = !ev.registration.ok;
  if (stage >= REMINDER_STAGE.PRE_14 && stage <= REMINDER_STAGE.DEADLINE_1) return ev.state === "PENDING" && needsCourse;
  if (stage === REMINDER_STAGE.OVERDUE) return ev.state === "NON_COMPLIANT" && needsCourse;
  if (stage === REMINDER_STAGE.RESULT) return ev.final && ev.state !== "EXEMPT";
  return false;
}

function buildCoachMessage(stage: number, term: TermLike, ev: TermEvaluation): { title: string; body: string } {
  const need = `tối thiểu ${COACH_TERM.MIN_MAIN_SESSIONS} buổi, trải rộng ít nhất ${COACH_TERM.MIN_SPAN_DAYS} ngày`;
  const deadline = formatVnDate(new Date(ev.deadlineAt.getTime() - 1));
  const left = Math.max(1, ev.daysToDeadline ?? 1);
  switch (stage) {
    case REMINDER_STAGE.PRE_14:
    case REMINDER_STAGE.PRE_7:
    case REMINDER_STAGE.PRE_1: {
      const days = stage === REMINDER_STAGE.PRE_14 ? 14 : stage === REMINDER_STAGE.PRE_7 ? 7 : 1;
      return {
        title: `${term.name} bắt đầu sau ${days} ngày`,
        body: `Để giữ quyền lợi tập gym của Coach, hãy tạo khóa học (${need}) trước ${deadline}.`,
      };
    }
    case REMINDER_STAGE.START:
      return {
        title: `${term.name} đã bắt đầu`,
        body: `Bạn cần tạo khóa học hợp lệ (${need}) trước ${deadline} (còn ${left} ngày).`,
      };
    case REMINDER_STAGE.DEADLINE_7:
    case REMINDER_STAGE.DEADLINE_1:
      return {
        title: `Còn ${left} ngày để tạo khóa học ${term.name}`,
        body: `Bạn chưa có khóa học hợp lệ (${need}). Hạn tạo khóa: ${deadline}.`,
      };
    case REMINDER_STAGE.OVERDUE:
      return {
        title: `Bạn chưa đạt yêu cầu ${term.name}`,
        body: `Đã quá hạn ${deadline} mà chưa có khóa học hợp lệ (${need}). Thẻ ra vào của Coach có thể bị từ chối cho tới khi bạn tạo khóa. Nếu có lý do chính đáng, hãy gửi đơn nghỉ phép hoặc liên hệ Quản lý.`,
      };
    default:
      return ev.state === "COMPLIANT"
        ? { title: `Bạn đã đạt yêu cầu ${term.name}`, body: "Cảm ơn bạn đã duy trì khóa học trong kỳ. Quyền lợi của Coach được giữ nguyên." }
        : {
            title: `Bạn chưa đạt yêu cầu ${term.name}`,
            body: `${ev.reasons.join(" ")} Hãy tạo khóa học hợp lệ ở kỳ tiếp theo hoặc liên hệ Quản lý nếu có lý do chính đáng.`,
          };
  }
}

export interface MaintenanceResult {
  terms: number;
  evaluated: number;
  coachReminders: number;
  managerReports: number;
}

async function managerIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { role: { name: "MANAGER" }, isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

export interface MaintenanceScope {
  /** Chỉ xử lý các Coach này (test / chạy thử) — mặc định mọi Coach đủ điều kiện. */
  coachIds?: string[];
  /** Chỉ báo cáo cho các Manager này — mặc định mọi Manager đang hoạt động. */
  managerIds?: string[];
}

async function processTerm(
  term: TermLike & { managerReportStage: number },
  now: Date,
  result: MaintenanceResult,
  scope: MaintenanceScope = {}
) {
  const { roster, evals } = await computeTermEvaluations(term, now, scope.coachIds);
  await persistEvaluations(term.id, evals, now);
  result.evaluated += evals.size;

  // ── Nhắc từng Coach ──
  const rows = await prisma.coachTermStatus.findMany({
    where: { termId: term.id, coachId: { in: roster.map((r) => r.coachId) } },
    select: { coachId: true, lastReminderStage: true },
  });
  const last = new Map(rows.map((r) => [r.coachId, r.lastReminderStage]));
  for (const coach of roster) {
    const ev = evals.get(coach.coachId);
    if (!ev) continue;
    const due = dueStageAt(term, ev.deadlineAt, now);
    if (due === 0 || due <= (last.get(coach.coachId) ?? 0)) continue;
    const applies = stageApplies(due, ev);
    const sent = await prisma.$transaction(async (tx) => {
      // CAS: chỉ một worker/instance giành được bậc này cho Coach.
      const claimed = await tx.coachTermStatus.updateMany({
        where: { termId: term.id, coachId: coach.coachId, lastReminderStage: { lt: due } },
        data: { lastReminderStage: due },
      });
      if (claimed.count === 0 || !applies) return false;
      const msg = buildCoachMessage(due, term, ev);
      await enqueueNotification(tx, {
        userId: coach.userId,
        type: "GENERAL",
        title: msg.title,
        body: msg.body,
        metadata: { kind: "COACH_TERM_REMINDER", termId: term.id, stage: due, state: ev.state },
      });
      return true;
    });
    if (sent) result.coachReminders += 1;
  }

  // ── Báo cáo Manager (bậc quá hạn / bậc kết quả) ──
  const reportStage =
    now > term.endDate ? REMINDER_STAGE.RESULT : now >= baseDeadline(term) ? REMINDER_STAGE.OVERDUE : 0;
  if (reportStage > term.managerReportStage) {
    const claimed = await prisma.academicTerm.updateMany({
      where: { id: term.id, managerReportStage: { lt: reportStage } },
      data: { managerReportStage: reportStage },
    });
    if (claimed.count === 1) {
      const all = [...evals.values()];
      const failed = all.filter((e) => e.state === "NON_COMPLIANT");
      const names = roster.filter((c) => failed.some((e) => e.coachId === c.coachId)).map((c) => c.fullName);
      if (reportStage === REMINDER_STAGE.RESULT || failed.length > 0) {
        const shown = names.slice(0, 10).join(", ") + (names.length > 10 ? `, … (+${names.length - 10})` : "");
        const compliant = all.filter((e) => e.state === "COMPLIANT").length;
        const title = reportStage === REMINDER_STAGE.RESULT ? `Kết quả ${term.name}` : `${term.name}: quá hạn tạo khóa học`;
        const body =
          reportStage === REMINDER_STAGE.RESULT
            ? `Đạt ${compliant}/${all.length} Coach; chưa đạt ${failed.length}${failed.length ? `: ${shown}` : ""}.`
            : `${failed.length} Coach chưa có khóa học hợp lệ sau hạn ân hạn: ${shown}.`;
        for (const id of scope.managerIds ?? (await managerIds())) {
          await enqueueNotification(prisma, {
            userId: id,
            type: "GENERAL",
            title,
            body,
            metadata: { kind: "COACH_TERM_MANAGER_REPORT", termId: term.id, stage: reportStage },
          });
        }
        result.managerReports += 1;
      }
    }
  }
}

let running = false;

/** Xử lý một danh sách kỳ cụ thể (dùng chung cho job định kỳ và test). Không chồng lượt trong cùng process. */
export async function maintainTerms(
  terms: (TermLike & { managerReportStage: number })[],
  now: Date = new Date(),
  scope: MaintenanceScope = {}
): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { terms: 0, evaluated: 0, coachReminders: 0, managerReports: 0 };
  if (running) return result;
  running = true;
  try {
    for (const term of terms) {
      await processTerm(term, now, result, scope);
      result.terms += 1;
    }
    if (result.coachReminders + result.managerReports > 0) await flushNotificationOutbox().catch(() => {});
  } finally {
    running = false;
  }
  return result;
}

/** Job định kỳ: các kỳ sắp bắt đầu (≤ 14 ngày), đang chạy, hoặc mới kết thúc (≤ RESULT_WINDOW_DAYS ngày). */
export async function runTermMaintenance(now: Date = new Date()): Promise<MaintenanceResult> {
  await ensureTermsAround(now);
  const terms = await prisma.academicTerm.findMany({
    where: {
      startDate: { lte: new Date(now.getTime() + 14 * DAY_MS) },
      endDate: { gte: new Date(now.getTime() - COACH_TERM.RESULT_WINDOW_DAYS * DAY_MS) },
    },
    orderBy: { startDate: "asc" },
  });
  return maintainTerms(terms, now);
}
