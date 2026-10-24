/** Hiển thị kỳ học & quyền lợi Coach — nhãn, tông màu, câu chữ (thuần, có test). */

export type TermTone = "ok" | "warn" | "bad" | "info";

export const TERM_STATE: Record<string, [label: string, tone: TermTone]> = {
  PENDING: ["Chờ đủ điều kiện", "warn"],
  COMPLIANT: ["Đạt", "ok"],
  NON_COMPLIANT: ["Chưa đạt", "bad"],
  EXEMPT: ["Được miễn", "info"],
};

export const TERM_PHASE: Record<string, string> = {
  UPCOMING: "Sắp bắt đầu",
  GRACE: "Đang trong ân hạn",
  ACTIVE: "Đang diễn ra",
  ENDED: "Đã kết thúc",
};

export const LEAVE_STATUS: Record<string, [string, TermTone]> = {
  PENDING: ["Chờ duyệt", "warn"],
  APPROVED: ["Đã duyệt", "ok"],
  REJECTED: ["Từ chối", "bad"],
  CANCELLED: ["Đã hủy", "info"],
};

export const LEAVE_KIND: Record<string, string> = { SICK: "Ốm", PERSONAL: "Việc riêng", OTHER: "Khác" };

export const termState = (state: unknown): [string, TermTone] => TERM_STATE[String(state)] ?? [String(state ?? "—"), "info"];

/** Tỷ lệ 0..1 ⇒ "85%"; null ⇒ "—". */
export const percent = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—");

export interface TermEvaluationView {
  state: string;
  final?: boolean;
  daysToDeadline?: number | null;
  atRisk?: boolean;
  registration?: { ok?: boolean; mainSessions?: number; spanDays?: number; qualifyingClassName?: string | null; pendingApproval?: boolean };
  delivery?: { completed?: number; cancelled?: number; awaitingComplete?: number; completionRate?: number | null; cancelRate?: number | null; evidenceRate?: number | null };
}

/** Câu tóm tắt cột "Hạn / đăng ký" của bảng Coach. */
export function registrationSummary(ev: TermEvaluationView): string {
  const reg = ev.registration;
  if (!reg) return "—";
  if (reg.ok) return `${reg.qualifyingClassName ?? "Khóa học"} · ${reg.mainSessions ?? 0} buổi${reg.pendingApproval ? " (chờ duyệt)" : ""}`;
  if (ev.state === "NON_COMPLIANT") return "Quá hạn — chưa có khóa hợp lệ";
  const left = ev.daysToDeadline;
  return typeof left === "number" ? `Chưa có khóa hợp lệ · còn ${Math.max(1, left)} ngày` : "Chưa có khóa hợp lệ";
}

/** Câu tóm tắt cột "Việc dạy": đã dạy / hủy / tỷ lệ. */
export function deliverySummary(ev: TermEvaluationView): string {
  const d = ev.delivery;
  if (!d) return "—";
  const parts = [`${d.completed ?? 0} đã dạy`];
  if (d.cancelled) parts.push(`${d.cancelled} hủy`);
  if (d.awaitingComplete) parts.push(`${d.awaitingComplete} chưa hoàn tất`);
  return parts.join(" · ");
}

export type PassLevel = "OK" | "WARN" | "DENY";
export const PASS_LEVEL: Record<PassLevel, { label: string; tone: TermTone }> = {
  OK: { label: "Hợp lệ", tone: "ok" },
  WARN: { label: "Hợp lệ — cần lưu ý", tone: "warn" },
  DENY: { label: "Không hợp lệ", tone: "bad" },
};

/** Chuỗi trong QR có thể là token thô hoặc link/văn bản chứa token — lấy phần JWT. */
export function extractPassToken(raw: string): string {
  const text = raw.trim();
  const m = text.match(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  return m ? m[0] : text;
}
