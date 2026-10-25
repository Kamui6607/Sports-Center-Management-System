import { Component, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Search, X } from "lucide-react";
import { ApiError } from "../../shared/api";
import type { Envelope } from "../../shared/api";
import { useDebouncedValue } from "../../shared/useDebouncedValue";

// ── Định dạng (tiếng Việt, VND, giờ Việt Nam) ───────────────────────────────
const TZ = "Asia/Ho_Chi_Minh";
export const vnd = (v: unknown) =>
  v == null || v === "" || !Number.isFinite(Number(v))
    ? "—"
    : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(v));
export const num = (v: unknown) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : new Intl.NumberFormat("vi-VN").format(Number(v));
export const dateTime = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("vi-VN", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—";
export const dateOnly = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString("vi-VN", { timeZone: TZ }) : "—";
export const clock = (v: unknown) =>
  v ? new Date(String(v)).toLocaleTimeString("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "—";
/** YYYY-MM-DD theo giờ Việt Nam. */
export const vnDateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** Mốc UTC của 00:00 ngày `key` giờ Việt Nam. */
export const vnStartOf = (key: string) => new Date(`${key}T00:00:00+07:00`);

export const ROLE_LABEL: Record<string, string> = { MEMBER: "Hội viên", COACH: "Huấn luyện viên", MANAGER: "Quản lý" };
export const AREA_LABEL: Record<string, string> = { INDOOR: "Trong nhà", OUTDOOR: "Ngoài trời", POOL: "Hồ bơi" };
export const CLASS_TYPE_LABEL: Record<string, string> = { REGULAR: "Tiêu chuẩn", PREMIUM: "Cao cấp" };
export const LEVEL_LABEL: Record<string, string> = { BEGINNER: "Cơ bản", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" };
/** Mục tiêu tập luyện (trùng BE `src/config/fitness-goals.ts` — GET /classes/goal-options). */
export const GOAL_LABEL: Record<string, string> = {
  WEIGHT_LOSS: "Giảm mỡ / giảm cân",
  MUSCLE_GAIN: "Tăng cơ",
  STRENGTH: "Tăng sức mạnh",
  ENDURANCE: "Tăng sức bền",
  BODY_SHAPING: "Săn chắc vóc dáng",
  MOBILITY: "Linh hoạt & tư thế",
  REHAB: "Phục hồi chấn thương",
  GENERAL_HEALTH: "Sức khỏe tổng quát",
  GYM_FOUNDATION: "Làm quen phòng gym",
  COMPETITION: "Thi đấu thể hình",
};
export const goalLabels = (tags: unknown) => (Array.isArray(tags) ? tags.map((t) => GOAL_LABEL[str(t)] ?? str(t)) : []);
export const GENDER_LABEL: Record<string, string> = { MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác" };

export type Row = Record<string, unknown>;
export const str = (v: unknown) => (v == null ? "" : String(v));
export function get(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Row)[k] : undefined), row);
}

// ── Trạng thái lọc/phân trang lưu trên URL (giữ khi mở chi tiết rồi quay lại) ──
export function useUrlState(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const value = (k: string) => params.get(k) ?? defaults[k] ?? "";
  const set = (patch: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v === defaults[k]) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };
  const page = Math.max(1, Number(params.get("page") || 1));
  return { value, set, page, setPage: (p: number) => set({ page: p <= 1 ? "" : String(p) }, false) };
}

/** Ô tìm kiếm có debounce, ghi vào URL. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 350);
  const first = useRef(true);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (debounced !== value) onChange(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <label className="cr-search">
      <span className="sr-only">{placeholder}</span>
      <Search size={16} aria-hidden="true" />
      <input type="search" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  all = "Tất cả",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  all?: string | null;
}) {
  return (
    <label className="cr-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== null && <option value="">{all}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Khung trang ─────────────────────────────────────────────────────────────
/**
 * Tiêu đề trang. `eyebrow` giữ để tương thích (ngữ cảnh đã có ở breadcrumb của header nên không hiển thị);
 * `desc` là chuỗi ⇒ đoạn mô tả, là node ⇒ hàng metadata (trạng thái, email…).
 */
export function PageHead(props: { eyebrow?: string; title: ReactNode; desc?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  const { title, desc, actions, back } = props;
  return (
    <header className="cr-head">
      <div style={{ minWidth: 0 }}>
        {back}
        <h1>{title}</h1>
        {desc ? typeof desc === "string" ? <p>{desc}</p> : <div className="cr-head-meta">{desc}</div> : null}
      </div>
      {actions && <div className="cr-head-actions">{actions}</div>}
    </header>
  );
}

export function Tag({ tone = "", children }: { tone?: "ok" | "warn" | "bad" | "info" | ""; children: ReactNode }) {
  return <span className={"cr-tag " + tone}>{children}</span>;
}

/** Nút hành động dạng icon ở cuối hàng (có nhãn cho trình đọc màn hình + tooltip). */
export function RowAction({ label, to, onClick, children }: { label: string; to?: string; onClick?: () => void; children: ReactNode }) {
  if (to)
    return (
      <Link className="cr-icon-btn" to={to} aria-label={label} title={label}>
        {children}
      </Link>
    );
  return (
    <button type="button" className="cr-icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function Panel({
  title,
  desc,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={"cr-panel " + (flush ? "flush " : "") + className}>
      {(title || actions) && (
        <div className="cr-panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {desc && <p>{desc}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ tone = "", children }: { tone?: "ok" | "warn" | "bad" | "info" | "" | "plain"; children: ReactNode }) {
  return <span className={"cr-pill " + tone}>{children}</span>;
}

export function ActivePill({ active, on = "Hoạt động", off = "Đã khóa" }: { active: unknown; on?: string; off?: string }) {
  return active ? <Pill tone="ok">{on}</Pill> : <Pill tone="bad">{off}</Pill>;
}

const APPROVAL: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  PENDING: ["Chờ duyệt", "warn"],
  APPROVED: ["Đã duyệt", "ok"],
  REJECTED: ["Bị từ chối", "bad"],
  COMPLETED: ["Đã kết thúc", "info"],
  NOT_SUBMITTED: ["Chưa nộp CV", "" as "info"],
};
export function ApprovalPill({ status }: { status: unknown }) {
  const [l, t] = APPROVAL[str(status)] ?? [str(status) || "—", "info"];
  return <Pill tone={t}>{l}</Pill>;
}

const SCHEDULE: Record<string, [string, "ok" | "info" | "bad"]> = {
  SCHEDULED: ["Đã lên lịch", "ok"],
  COMPLETED: ["Hoàn thành", "info"],
  CANCELLED: ["Đã hủy", "bad"],
};
export function SchedulePill({ status }: { status: unknown }) {
  const [l, t] = SCHEDULE[str(status)] ?? [str(status), "info"];
  return <Pill tone={t}>{l}</Pill>;
}

/** Vòng tỷ lệ nhỏ (vd. sĩ số đã đặt / sức chứa) kèm phần trăm; `label` cho trình đọc màn hình. */
export function Ring({ value, total, label }: { value: number; total: number; label?: string }) {
  if (!total) return <span className="cr-subtle">—</span>;
  const p = Math.max(0, Math.min(1, value / total));
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <span className={"cr-ring" + (value >= total ? " full" : "")} title={label ?? `${value}/${total}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle className="cr-ring-track" cx="11" cy="11" r={r} fill="none" strokeWidth="2.5" />
        {/* 0%: không vẽ cung (cung dài 0 + đầu bo tròn hiện thành một chấm lệch) */}
        {p > 0 && <circle className="cr-ring-val" cx="11" cy="11" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} />}
      </svg>
      <span>
        {Math.round(p * 100)}%<span className="sr-only"> ({label ?? `${value}/${total}`})</span>
      </span>
    </span>
  );
}

// ── Trạng thái tải / lỗi / rỗng ─────────────────────────────────────────────
export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="cr-skel" role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ width: `${92 - ((i * 13) % 30)}%` }} />
      ))}
    </div>
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  return (
    <div className="cr-alert" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <strong>{status === 403 ? "Không đủ quyền thực hiện" : status === 404 ? "Không tìm thấy dữ liệu" : "Chưa thể hoàn tất yêu cầu"}</strong>
        <p>{errorMessage(error)}</p>
        {error instanceof ApiError && error.errors?.length ? (
          <p>{error.errors.map((e) => `${e.field}: ${e.message}`).join(" · ")}</p>
        ) : null}
      </div>
      {retry && (
        <button className="cr-btn sm" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title = "Chưa có dữ liệu", text, action }: { title?: string; text?: string; action?: ReactNode }) {
  return (
    <div className="cr-state">
      <span className="cr-state-icon" aria-hidden="true">
        <Inbox size={20} strokeWidth={1.7} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Hiển thị theo trạng thái query: đang tải / lỗi (có thử lại) / nội dung. */
export function QueryView<T>({
  q,
  children,
  rows,
}: {
  q: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
  rows?: number;
}) {
  if (q.isPending) return <Skeleton rows={rows} />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  return <>{children(q.data as T)}</>;
}

// ── Bảng + phân trang ───────────────────────────────────────────────────────
export type Column<T> = { key: string; title: string; render: (row: T) => ReactNode; className?: string };

export function DataTable<T extends Row>({ rows, columns, empty, label = "Bảng dữ liệu" }: { rows: T[]; columns: Column<T>[]; empty?: ReactNode; label?: string }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Không có dữ liệu" text="Chưa có bản ghi nào để hiển thị. Nếu đang lọc, hãy thử bỏ bớt điều kiện." />}</>;
  return (
    <div className="cr-table-wrap" tabIndex={0} role="region" aria-label={label}>
      <table className="cr-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.className}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={str(r.id) || i}>
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ meta, onPage }: { meta?: Envelope<unknown>["pagination"]; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const { page, totalPages, total, limit } = meta;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  return (
    <nav className="cr-pager" aria-label="Phân trang">
      <span>
        {num(from)}–{num(Math.min(total, page * limit))} trong {num(total)}
      </span>
      <div className="cr-pager-btns">
        <button className="cr-btn sm icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">
          <ChevronLeft size={16} />
        </button>
        <b>
          Trang {page} / {Math.max(1, totalPages)}
        </b>
        <button className="cr-btn sm icon" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
export function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  busy = false,
  wide = false,
  onSubmit,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  wide?: boolean;
  onSubmit?: (e: FormEvent) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => opener?.focus?.({ preventScroll: true });
  }, []);
  const body = (
    <>
      <div className="cr-modal-body">{children}</div>
      {footer && <div className="cr-modal-foot">{footer}</div>}
    </>
  );
  return (
    <dialog
      ref={ref}
      className={"cr-modal" + (wide ? " wide" : "")}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="cr-modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {eyebrow && <p>{eyebrow}</p>}
        </div>
        <button type="button" className="cr-icon-btn" onClick={onClose} disabled={busy} aria-label="Đóng">
          <X size={17} />
        </button>
      </div>
      {onSubmit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onSubmit(e);
          }}
          noValidate
        >
          {body}
        </form>
      ) : (
        body
      )}
    </dialog>
  );
}

/** Hộp xác nhận cho thao tác khóa/xóa/ngừng: nêu đối tượng + hậu quả; tùy chọn bắt buộc nhập lý do. */
export function ConfirmDialog({
  title,
  target,
  consequence,
  confirmLabel,
  danger = false,
  reason,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  target: ReactNode;
  consequence: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reason?: { label: string; required?: boolean; min?: number; match?: string };
  busy: boolean;
  error?: unknown;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const min = reason?.required ? (reason.min ?? 1) : 0;
  const invalid = reason?.match !== undefined ? text.trim() !== reason.match : text.trim().length < min;
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      onSubmit={() => !invalid && onConfirm(text.trim())}
      footer={
        <>
          <button type="button" className="cr-btn" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className={"cr-btn " + (danger ? "danger-solid" : "primary")} disabled={busy || invalid}>
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="cr-confirm-target">
        <small>Đối tượng</small>
        <strong>{target}</strong>
      </div>
      <p style={{ margin: 0, color: "var(--text-2)" }}>{consequence}</p>
      {reason && (
        <label className="cr-field">
          <span>
            {reason.label} {reason.required && <em>*</em>}
          </span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus />
          {reason.required && min > 1 && <small>Tối thiểu {min} ký tự.</small>}
        </label>
      )}
      {error ? <ErrorBox error={error} /> : null}
    </Dialog>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────
/** Lỗi theo field từ BE (400 Validation failed) — field lồng (`resolution.endTime`) lấy phần đầu. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const e of error.errors ?? []) {
    const key = e.field || "";
    if (key && !out[key]) out[key] = e.message;
  }
  return out;
}

export function Field({
  label,
  required,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={"cr-field" + (wide ? " wide" : "")}>
      <span>
        {label} {required && <em>*</em>}
      </span>
      {children}
      {error ? <span className="cr-err">{error}</span> : hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="cr-dl">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v === "" || v == null ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Trạng thái mở bán khóa học (BE tính `summary.saleState`) ───────────────
const SALE: Record<string, [string, "ok" | "warn" | "info" | "plain"]> = {
  ON_SALE: ["Đang mở bán", "ok"],
  FULL: ["Đã đủ chỗ", "info"],
  SALE_CLOSED: ["Ngừng nhận học viên", "warn"],
  ENDED: ["Đã kết thúc", "plain"],
  NOT_OPEN: ["Chưa mở bán", "plain"],
};
/** Ưu tiên `summary.saleState`; không có thì chỉ hiện bật/tắt bán khi khóa đã duyệt (tránh "Đã kết thúc" + "Đang mở"). */
export function SalePill({ row }: { row: Row }) {
  const st = str(get(row, "summary.saleState"));
  if (st) return <Pill tone={SALE[st]?.[1] ?? "plain"}>{str(get(row, "summary.saleStateLabel")) || SALE[st]?.[0] || st}</Pill>;
  if (row.status !== "APPROVED") return <span className="cr-muted">—</span>;
  return row.isActive ? <Pill tone="ok">Đang mở bán</Pill> : <Pill>Ngừng mở bán</Pill>;
}

// ── Kỳ lọc nhanh cho danh sách (gửi ISO theo giờ Việt Nam) ─────────────────
export const PERIOD_OPTIONS: [string, string][] = [
  ["7d", "7 ngày qua"],
  ["30d", "30 ngày qua"],
  ["month", "Tháng này"],
  ["last-month", "Tháng trước"],
];
export function periodQuery(preset: string): Record<string, string> {
  if (!preset) return {};
  const today = vnDateKey(new Date());
  const shift = (k: string, n: number) => {
    const d = new Date(`${k}T12:00:00+07:00`);
    d.setUTCDate(d.getUTCDate() + n);
    return vnDateKey(d);
  };
  let start = today;
  let end = today;
  if (preset === "7d") start = shift(today, -6);
  else if (preset === "30d") start = shift(today, -29);
  else if (preset === "month") start = `${today.slice(0, 8)}01`;
  else if (preset === "last-month") {
    const [y, m] = today.split("-").map(Number);
    const yy = m === 1 ? y - 1 : y;
    const mm = m === 1 ? 12 : m - 1;
    start = `${yy}-${String(mm).padStart(2, "0")}-01`;
    end = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  }
  return { startDate: vnStartOf(start).toISOString(), endDate: new Date(`${end}T23:59:59.999+07:00`).toISOString() };
}

// ── Lỗi hiển thị theo trang: giữ sidebar/topbar, tự reset khi đổi route ────
export class PageErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="cr-state" role="alert">
        <span className="cr-state-icon" aria-hidden="true">
          <AlertTriangle size={20} strokeWidth={1.7} />
        </span>
        <h3>Trang này gặp lỗi hiển thị</h3>
        <p>Dữ liệu đã lưu không bị ảnh hưởng. Thử tải lại phần này hoặc chuyển sang trang khác.</p>
        <button className="cr-btn primary" onClick={() => this.setState({ failed: false })}>
          Thử lại
        </button>
      </div>
    );
  }
}
