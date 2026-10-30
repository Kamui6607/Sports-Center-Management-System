import type { CoachTermState } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { COACH_TERM } from "../../config/coach-term.js";
import { vnDateKey, vnDateTime } from "../../utils/vnTime.js";
import {
  baseDeadline,
  DAY_MS,
  formatVnDate,
  leaveDaySet,
  termDayCount,
  termPhase,
  type TermLike,
  type TermPhase,
} from "./term-calendar.js";

/**
 * Đánh giá "Coach đạt kỳ" (Doc/COACH_TERMS.md) — hàm thuần tính từ dữ liệu khóa học/buổi học thật, KHÔNG tự khóa ai.
 *
 * Quy tắc:
 * 1. ĐĂNG KÝ KỲ (hạn ân hạn): có ≥ 1 khóa hợp lệ (PENDING/APPROVED/COMPLETED, đang bật) với ≥ MIN_MAIN_SESSIONS buổi
 *    không bị hủy trong kỳ, trải rộng ≥ MIN_SPAN_DAYS ngày. Khóa PENDING vẫn tính (Manager duyệt chậm không phải lỗi Coach).
 * 2. CHỐT CUỐI KỲ (chỉ khi kỳ đã kết thúc): tổng hợp mọi buổi của Coach trong kỳ — tỷ lệ dạy, tỷ lệ hủy, bằng chứng dạy.
 *    Khóa không có học viên: không tính lỗi Coach nếu không ai đăng ký, nhưng vẫn phải mở bán đủ buổi (mục 1) và không hủy quá ngưỡng.
 * 3. NGHỈ PHÉP ĐƯỢC DUYỆT: gia hạn ân hạn đúng số ngày nghỉ, buổi hủy trong thời gian nghỉ không tính; nghỉ ≥ 50% kỳ ⇒ miễn kỳ.
 * 4. MIỄN TRỪ THỦ CÔNG của Manager luôn thắng (đánh giá tự động không ghi đè).
 */

export interface RosterCoach {
  coachId: string;
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  /** Thời điểm tính hạn ân hạn: đầu kỳ, hoặc lúc CV được duyệt nếu tài khoản Coach tạo trong kỳ. */
  effectiveStart: Date;
}

export interface ManualExemption {
  reason: string | null;
}

export interface TermEvaluation {
  coachId: string;
  state: CoachTermState;
  /** Kỳ đã kết thúc ⇒ kết quả cuối cùng, ngược lại là tạm thời. */
  final: boolean;
  phase: TermPhase;
  /** Lý do (tiếng Việt) giải thích `state`. */
  reasons: string[];
  /** Cảnh báo sớm (không đổi `state`): có nguy cơ không đạt, buổi quá hạn chưa hoàn tất… */
  warnings: string[];
  atRisk: boolean;
  deadlineAt: Date;
  /** Số ngày còn lại tới hạn ân hạn (âm = đã quá hạn); null khi đã đăng ký đủ. */
  daysToDeadline: number | null;
  registration: {
    ok: boolean;
    qualifyingClassId: string | null;
    qualifyingClassName: string | null;
    qualifyingClassStatus: string | null;
    mainSessions: number;
    spanDays: number;
    pendingApproval: boolean;
    required: { sessions: number; spanDays: number };
  };
  delivery: {
    completed: number;
    awaitingComplete: number;
    scheduledFuture: number;
    cancelled: number;
    leaveCancelled: number;
    dueTotal: number;
    completionRate: number | null;
    cancelRate: number | null;
    completedWithStudents: number;
    withEvidence: number;
    evidenceRate: number | null;
  };
  leave: { approvedDays: number; share: number; graceExtensionDays: number };
}

interface SessionRow {
  classId: string;
  startTime: Date;
  endTime: Date;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  isMakeup: boolean;
  replacedByActiveMakeup: boolean;
  /** Buổi do HỆ THỐNG hủy (khóa tự đóng vì không có học viên) — không phải lỗi HLV. */
  systemCancelled: boolean;
  students: number;
  hasEvidence: boolean;
}

interface ClassRow {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
}

const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Các khóa mà Coach được tính khi đánh giá: bỏ bản nháp và khóa bị từ chối. */
const COUNTED_CLASS_STATUSES = ["PENDING", "APPROVED", "COMPLETED"] as const;

/** Danh sách Coach được đánh giá trong kỳ: CV đã duyệt, tài khoản đang bật, đã có mặt trước khi kỳ kết thúc. */
export async function loadRoster(term: TermLike, only?: string | string[]): Promise<RosterCoach[]> {
  const onlyIds = only === undefined ? undefined : Array.isArray(only) ? only : [only];
  const rows = await prisma.coachProfile.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      user: { isActive: true, createdAt: { lte: term.endDate } },
      certification: { status: "APPROVED" },
    },
    select: {
      id: true,
      userId: true,
      user: { select: { fullName: true, email: true, avatarUrl: true, createdAt: true } },
      certification: { select: { updatedAt: true } },
    },
  });
  const roster: RosterCoach[] = [];
  for (const r of rows) {
    // Tài khoản tạo TRONG kỳ ⇒ ân hạn tính từ lúc CV được duyệt; tài khoản cũ ⇒ tính từ đầu kỳ (không "reset" ân hạn bằng cách nộp lại CV).
    const joinedDuringTerm = r.user.createdAt > term.startDate;
    const approvedAt = r.certification?.updatedAt ?? r.user.createdAt;
    // Làm tròn về 00:00 giờ VN của ngày duyệt ⇒ hạn ân hạn luôn rơi đúng ranh giới ngày.
    const approvedDay = vnDateTime(vnDateKey(approvedAt), "00:00");
    const effectiveStart = joinedDuringTerm && approvedDay > term.startDate ? approvedDay : term.startDate;
    if (effectiveStart > term.endDate) continue;
    roster.push({
      coachId: r.id,
      userId: r.userId,
      fullName: r.user.fullName,
      email: r.user.email,
      avatarUrl: r.user.avatarUrl,
      effectiveStart,
    });
  }
  return roster;
}

/**
 * Đánh giá hàng loạt (1 lượt truy vấn cho cả danh sách) — trả về Map theo `coachId`.
 * `exemptions`: Coach được Manager miễn trừ thủ công trong kỳ này.
 */
export async function evaluateCoaches(
  term: TermLike,
  roster: RosterCoach[],
  now: Date,
  exemptions: Map<string, ManualExemption> = new Map()
): Promise<Map<string, TermEvaluation>> {
  const result = new Map<string, TermEvaluation>();
  if (roster.length === 0) return result;
  const coachIds = roster.map((r) => r.coachId);

  const [sessions, leaves] = await Promise.all([
    prisma.classSchedule.findMany({
      where: {
        class: { coachId: { in: coachIds }, status: { in: [...COUNTED_CLASS_STATUSES] } },
        startTime: { gte: term.startDate, lte: term.endDate },
      },
      select: {
        classId: true,
        startTime: true,
        endTime: true,
        status: true,
        makeupForId: true,
        cancelCode: true,
        makeup: { select: { status: true } },
        class: { select: { coachId: true, name: true, status: true, isActive: true } },
        _count: {
          select: {
            attendances: true,
            manualCodes: true,
            enrollments: { where: { status: { in: ["BOOKED", "COMPLETED"] } } },
          },
        },
      },
    }),
    prisma.coachLeave.findMany({
      where: { coachId: { in: coachIds }, status: "APPROVED", startDate: { lte: term.endDate }, endDate: { gte: term.startDate } },
      select: { coachId: true, startDate: true, endDate: true },
    }),
  ]);

  const sessionsByCoach = new Map<string, { rows: SessionRow[]; classes: Map<string, ClassRow> }>();
  for (const s of sessions) {
    const coachId = s.class.coachId;
    let bucket = sessionsByCoach.get(coachId);
    if (!bucket) sessionsByCoach.set(coachId, (bucket = { rows: [], classes: new Map() }));
    bucket.classes.set(s.classId, { id: s.classId, name: s.class.name, status: s.class.status, isActive: s.class.isActive });
    bucket.rows.push({
      classId: s.classId,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      isMakeup: s.makeupForId !== null,
      // Buổi chính bị hủy nhưng đã có buổi dạy bù còn hiệu lực ⇒ không tính là hủy (buổi bù tự tính theo trạng thái của nó).
      replacedByActiveMakeup: s.status === "CANCELLED" && s.makeupForId === null && !!s.makeup && s.makeup.status !== "CANCELLED",
      systemCancelled: s.status === "CANCELLED" && s.cancelCode === "NO_ENROLLMENT",
      students: s._count.enrollments,
      hasEvidence: s._count.attendances > 0 || s._count.manualCodes > 0,
    });
  }
  const leavesByCoach = new Map<string, { startDate: Date; endDate: Date }[]>();
  for (const l of leaves) {
    const list = leavesByCoach.get(l.coachId) ?? [];
    list.push(l);
    leavesByCoach.set(l.coachId, list);
  }

  const phase = termPhase(term, now);
  const ended = phase === "ENDED";
  const termDays = termDayCount(term);

  for (const coach of roster) {
    const bucket = sessionsByCoach.get(coach.coachId) ?? { rows: [], classes: new Map<string, ClassRow>() };
    const coachLeaves = leavesByCoach.get(coach.coachId) ?? [];

    // ── Nghỉ phép được duyệt ──
    const leaveDays = leaveDaySet(coachLeaves, term.startDate, new Date(term.endDate.getTime() + 1));
    const leaveShare = termDays > 0 ? leaveDays.size / termDays : 0;
    const baseDue = new Date(Math.max(baseDeadline(term).getTime(), coach.effectiveStart.getTime() + term.graceDays * DAY_MS));
    const graceExtensionDays = leaveDaySet(coachLeaves, coach.effectiveStart, baseDue).size;
    const deadlineAt = new Date(baseDue.getTime() + graceExtensionDays * DAY_MS);
    const leaveKeys = leaveDays;

    // ── Đếm buổi ──
    let completed = 0;
    let awaitingComplete = 0;
    let scheduledFuture = 0;
    let cancelled = 0;
    let leaveCancelled = 0;
    let completedWithStudents = 0;
    let withEvidence = 0;
    const perClass = new Map<string, { nonCancelled: number; first: number; last: number }>();

    for (const s of bucket.rows) {
      if (s.systemCancelled) {
        // Khóa tự đóng vì không có học viên (Doc/BUSINESS_HARDENING_PLAN.md §1.2-D): không tính hủy / không tính phải dạy,
        // nhưng vẫn giữ trong lịch của khóa để điều kiện "đủ buổi" của kỳ không bị mất.
        const agg = perClass.get(s.classId) ?? { nonCancelled: 0, first: Infinity, last: -Infinity };
        agg.nonCancelled++;
        agg.first = Math.min(agg.first, s.startTime.getTime());
        agg.last = Math.max(agg.last, s.startTime.getTime());
        perClass.set(s.classId, agg);
        continue;
      }
      if (s.status === "CANCELLED") {
        if (s.replacedByActiveMakeup) continue;
        if (leaveKeys.has(vnDateKey(s.startTime))) leaveCancelled++;
        else cancelled++;
        continue;
      }
      if (s.status === "COMPLETED") {
        completed++;
        if (s.students > 0) {
          completedWithStudents++;
          if (s.hasEvidence) withEvidence++;
        }
      } else if (s.endTime < now) {
        awaitingComplete++;
      } else {
        scheduledFuture++;
      }
      const agg = perClass.get(s.classId) ?? { nonCancelled: 0, first: Infinity, last: -Infinity };
      agg.nonCancelled++;
      agg.first = Math.min(agg.first, s.startTime.getTime());
      agg.last = Math.max(agg.last, s.startTime.getTime());
      perClass.set(s.classId, agg);
    }

    const planned = completed + awaitingComplete + scheduledFuture + cancelled;
    const dueTotal = completed + awaitingComplete + cancelled;
    const completionRate = dueTotal > 0 ? completed / dueTotal : null;
    const cancelRate = planned > 0 ? cancelled / planned : null;
    const evidenceRate = completedWithStudents > 0 ? withEvidence / completedWithStudents : null;

    // ── Đăng ký kỳ: chọn khóa hợp lệ nhiều buổi nhất ──
    let best: { cls: ClassRow; count: number; spanDays: number; ok: boolean } | null = null;
    for (const [classId, agg] of perClass) {
      const cls = bucket.classes.get(classId)!;
      const spanDays = Math.floor((agg.last - agg.first) / DAY_MS);
      const ok = cls.isActive && agg.nonCancelled >= COACH_TERM.MIN_MAIN_SESSIONS && spanDays >= COACH_TERM.MIN_SPAN_DAYS;
      if (!best || (ok && !best.ok) || (ok === best.ok && agg.nonCancelled > best.count)) {
        best = { cls, count: agg.nonCancelled, spanDays, ok };
      }
    }
    const registrationOk = best?.ok === true;

    const reasons: string[] = [];
    const warnings: string[] = [];
    let state: CoachTermState;
    let atRisk = false;
    const msToDeadline = deadlineAt.getTime() - now.getTime();
    const daysToDeadline = registrationOk ? null : Math.ceil(msToDeadline / DAY_MS);

    const exemption = exemptions.get(coach.coachId);
    if (exemption) {
      state = "EXEMPT";
      reasons.push(exemption.reason ? `Manager miễn trừ: ${exemption.reason}` : "Manager đã miễn trừ cho kỳ này.");
    } else if (leaveShare >= COACH_TERM.EXEMPT_LEAVE_SHARE) {
      state = "EXEMPT";
      reasons.push(`Nghỉ phép được duyệt ${leaveDays.size}/${termDays} ngày của kỳ (≥ ${pct(COACH_TERM.EXEMPT_LEAVE_SHARE)}) ⇒ miễn kỳ.`);
    } else if (!registrationOk) {
      if (ended || now >= deadlineAt) {
        state = "NON_COMPLIANT";
        reasons.push(
          `Chưa có khóa học hợp lệ trong kỳ (cần ≥ ${COACH_TERM.MIN_MAIN_SESSIONS} buổi không hủy, trải ≥ ${COACH_TERM.MIN_SPAN_DAYS} ngày) — hạn ${formatVnDate(new Date(deadlineAt.getTime() - 1))}.`
        );
      } else {
        state = "PENDING";
        const left = Math.max(1, daysToDeadline ?? 1);
        reasons.push(
          `Cần tạo khóa học hợp lệ trước ${formatVnDate(new Date(deadlineAt.getTime() - 1))} (còn ${left} ngày): ≥ ${COACH_TERM.MIN_MAIN_SESSIONS} buổi, trải ≥ ${COACH_TERM.MIN_SPAN_DAYS} ngày.`
        );
        if (best && best.count > 0) {
          warnings.push(`Khóa "${best.cls.name}" mới có ${best.count} buổi / ${best.spanDays} ngày — chưa đủ điều kiện.`);
        }
      }
    } else {
      // Đã đăng ký kỳ — kiểm tra việc dạy thật.
      const failures: string[] = [];
      const sampleOk = dueTotal >= COACH_TERM.MIN_SAMPLE_FOR_WARNING;
      if (completionRate !== null && completionRate < COACH_TERM.MIN_COMPLETION_RATE) {
        failures.push(`Tỷ lệ buổi đã dạy ${pct(completionRate)} (< ${pct(COACH_TERM.MIN_COMPLETION_RATE)}).`);
      }
      if (cancelRate !== null && cancelRate > COACH_TERM.MAX_CANCEL_RATE) {
        failures.push(`Tỷ lệ buổi bị hủy ${pct(cancelRate)} (> ${pct(COACH_TERM.MAX_CANCEL_RATE)}).`);
      }
      if (evidenceRate !== null && evidenceRate < COACH_TERM.MIN_EVIDENCE_RATE) {
        failures.push(`Chỉ ${pct(evidenceRate)} buổi có học viên có bằng chứng dạy (điểm danh/QR) (< ${pct(COACH_TERM.MIN_EVIDENCE_RATE)}).`);
      }
      if (ended) {
        if (failures.length > 0) {
          state = "NON_COMPLIANT";
          reasons.push(...failures);
        } else {
          state = "COMPLIANT";
          reasons.push(`Đạt kỳ: khóa "${best!.cls.name}" hợp lệ, dạy đủ buổi.`);
        }
      } else {
        state = "COMPLIANT";
        reasons.push(`Đã đăng ký kỳ với khóa "${best!.cls.name}"${best!.cls.status === "PENDING" ? " (chờ Manager duyệt)" : ""}.`);
        if (sampleOk && failures.length > 0) {
          atRisk = true;
          warnings.push(...failures.map((f) => `Có nguy cơ không đạt cuối kỳ: ${f}`));
        }
      }
      if (awaitingComplete > 0) {
        warnings.push(`Có ${awaitingComplete} buổi đã qua nhưng chưa bấm "Hoàn tất" — buổi này không được tính là đã dạy.`);
      }
    }

    result.set(coach.coachId, {
      coachId: coach.coachId,
      state,
      final: ended,
      phase,
      reasons,
      warnings,
      atRisk,
      deadlineAt,
      daysToDeadline,
      registration: {
        ok: registrationOk,
        qualifyingClassId: best?.cls.id ?? null,
        qualifyingClassName: best?.cls.name ?? null,
        qualifyingClassStatus: best?.cls.status ?? null,
        mainSessions: best?.count ?? 0,
        spanDays: best?.spanDays ?? 0,
        pendingApproval: registrationOk && best?.cls.status === "PENDING",
        required: { sessions: COACH_TERM.MIN_MAIN_SESSIONS, spanDays: COACH_TERM.MIN_SPAN_DAYS },
      },
      delivery: {
        completed,
        awaitingComplete,
        scheduledFuture,
        cancelled,
        leaveCancelled,
        dueTotal,
        completionRate: completionRate === null ? null : round(completionRate),
        cancelRate: cancelRate === null ? null : round(cancelRate),
        completedWithStudents,
        withEvidence,
        evidenceRate: evidenceRate === null ? null : round(evidenceRate),
      },
      leave: { approvedDays: leaveDays.size, share: round(leaveShare), graceExtensionDays },
    });
  }
  return result;
}

/** Số liệu lưu vào `CoachTermStatus.metrics` (JSON, không kèm thông tin định danh). */
export function evaluationMetrics(ev: TermEvaluation) {
  return {
    final: ev.final,
    phase: ev.phase,
    atRisk: ev.atRisk,
    reasons: ev.reasons,
    warnings: ev.warnings,
    deadlineAt: ev.deadlineAt.toISOString(),
    daysToDeadline: ev.daysToDeadline,
    registration: ev.registration,
    delivery: ev.delivery,
    leave: ev.leave,
  };
}
