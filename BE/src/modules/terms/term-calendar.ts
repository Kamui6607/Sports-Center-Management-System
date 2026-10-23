import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { COACH_TERM } from "../../config/coach-term.js";
import { addDaysToDateKey, vnDateKey, vnDateTime } from "../../utils/vnTime.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Tập con của `AcademicTerm` mà logic đánh giá cần. */
export interface TermLike {
  id: string;
  name: string;
  year: number;
  seq: number;
  startDate: Date;
  endDate: Date;
  graceDays: number;
}

export type TermPhase = "UPCOMING" | "GRACE" | "ACTIVE" | "ENDED";

/** Ngày đầu / cuối (YYYY-MM-DD) của kỳ `seq` (1..3) trong năm `year` — 3 kỳ × 4 tháng. */
export function termDateKeys(year: number, seq: number): { startKey: string; endKey: string } {
  const startMonth = (seq - 1) * COACH_TERM.MONTHS_PER_TERM + 1;
  const endMonth = startMonth + COACH_TERM.MONTHS_PER_TERM - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Ngày 0 của tháng kế tiếp = ngày cuối của endMonth (lịch dương, không phụ thuộc timezone).
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { startKey: `${year}-${pad(startMonth)}-01`, endKey: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

/** Mốc thời gian của kỳ theo giờ VN: 00:00 ngày đầu → 23:59:59.999 ngày cuối. */
export function termBounds(year: number, seq: number): { startDate: Date; endDate: Date } {
  const { startKey, endKey } = termDateKeys(year, seq);
  return {
    startDate: vnDateTime(startKey, "00:00"),
    endDate: new Date(vnDateTime(addDaysToDateKey(endKey, 1), "00:00").getTime() - 1),
  };
}

export function termName(year: number, seq: number): string {
  return `Kỳ ${seq}/${year}`;
}

/** Kỳ chứa thời điểm `date` (giờ VN) — kỳ phủ kín cả năm nên luôn có. */
export function termOfDate(date: Date): { year: number; seq: number } {
  const [y, m] = vnDateKey(date).split("-").map(Number);
  return { year: y, seq: Math.min(COACH_TERM.TERMS_PER_YEAR, Math.floor((m - 1) / COACH_TERM.MONTHS_PER_TERM) + 1) };
}

/** Kỳ liền trước (năm trước nếu là kỳ 1). */
export function previousTermKey(year: number, seq: number): { year: number; seq: number } {
  return seq > 1 ? { year, seq: seq - 1 } : { year: year - 1, seq: COACH_TERM.TERMS_PER_YEAR };
}

/** Tạo (nếu chưa có) các kỳ của năm `year`. Idempotent, an toàn khi nhiều instance cùng chạy. */
export async function ensureYearTerms(year: number, db: DbClient = prisma): Promise<void> {
  const data = [];
  for (let seq = 1; seq <= COACH_TERM.TERMS_PER_YEAR; seq++) {
    data.push({
      name: termName(year, seq),
      year,
      seq,
      ...termBounds(year, seq),
      graceDays: COACH_TERM.DEFAULT_GRACE_DAYS,
    });
  }
  await db.academicTerm.createMany({ data, skipDuplicates: true });
}

/** Bảo đảm có kỳ cho năm của `now` và năm liền trước/sau (kỳ liền trước dùng cho chính sách "kỳ trước chưa đạt"). */
export async function ensureTermsAround(now: Date = new Date()): Promise<void> {
  const { year } = termOfDate(now);
  await ensureYearTerms(year - 1);
  await ensureYearTerms(year);
  await ensureYearTerms(year + 1);
}

/** Hạn ân hạn cơ bản của kỳ: hết ngày thứ `graceDays` kể từ đầu kỳ (00:00 giờ VN của ngày kế tiếp). */
export function baseDeadline(term: Pick<TermLike, "startDate" | "graceDays">): Date {
  return new Date(term.startDate.getTime() + term.graceDays * DAY_MS);
}

export function termPhase(term: Pick<TermLike, "startDate" | "endDate" | "graceDays">, now: Date): TermPhase {
  if (now < term.startDate) return "UPCOMING";
  if (now > term.endDate) return "ENDED";
  return now < baseDeadline(term) ? "GRACE" : "ACTIVE";
}

/** Số ngày lịch (giờ VN) của kỳ. */
export function termDayCount(term: Pick<TermLike, "startDate" | "endDate">): number {
  return Math.round((term.endDate.getTime() + 1 - term.startDate.getTime()) / DAY_MS);
}

/** Các ngày lịch VN (YYYY-MM-DD) của đoạn [start, end] — dùng để đếm giao nhau giữa nghỉ phép và kỳ. */
export function dayKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let key = vnDateKey(start);
  const last = vnDateKey(end);
  // Chặn vòng lặp vô hạn nếu dữ liệu lỗi (tối đa ~10 năm).
  for (let i = 0; i < 3700 && key <= last; i++) {
    keys.push(key);
    key = addDaysToDateKey(key, 1);
  }
  return keys;
}

/** Tập ngày (YYYY-MM-DD) nghỉ phép nằm trong [from, to). */
export function leaveDaySet(leaves: { startDate: Date; endDate: Date }[], from: Date, to: Date): Set<string> {
  const set = new Set<string>();
  const fromKey = vnDateKey(from);
  const toKey = vnDateKey(new Date(to.getTime() - 1));
  for (const leave of leaves) {
    for (const key of dayKeysBetween(leave.startDate, leave.endDate)) {
      if (key >= fromKey && key <= toKey) set.add(key);
    }
  }
  return set;
}

/** dd/MM/yyyy theo giờ VN. */
export function formatVnDate(date: Date): string {
  const [y, m, d] = vnDateKey(date).split("-");
  return `${d}/${m}/${y}`;
}
