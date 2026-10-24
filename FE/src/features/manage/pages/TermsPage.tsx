import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Play, RefreshCw, ScanLine } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../../shared/api";
import { ConfirmDialog, DataTable, Dialog, Dl, ErrorBox, Field, PageHead, Pager, Panel, Pill, QueryView, SearchBox, Select, dateOnly, dateTime, fieldErrors, get, num, str, useUrlState, vnDateKey, vnd } from "../kit";
import type { Row } from "../kit";
import { LEAVE_KIND, LEAVE_STATUS, PASS_LEVEL, TERM_PHASE, TERM_STATE, deliverySummary, extractPassToken, percent, registrationSummary, termState } from "../termsView";
import type { PassLevel, TermEvaluationView } from "../termsView";

type RosterRes = {
  term: Row;
  summary: { total: number; PENDING: number; COMPLIANT: number; NON_COMPLIANT: number; EXEMPT: number; atRisk: number };
  coaches: Row[];
};

const keyOf = (name: string, ...rest: unknown[]) => ["admin", "terms", name, ...rest];

/** Kỳ học & quyền lợi Coach: đánh giá "đạt kỳ", nghỉ phép, miễn trừ, quét thẻ ra vào (Doc/COACH_TERMS.md). */
export default function TermsPage() {
  const s = useUrlState({ tab: "coaches" });
  const tab = s.value("tab");
  return (
    <>
      <PageHead
        eyebrow="Con người · Đội ngũ"
        title="Kỳ học & quyền lợi HLV"
        desc="Mỗi kỳ (4 tháng), HLV cần có khóa học hợp lệ trong hạn ân hạn và dạy đủ buổi để giữ quyền tập gym miễn phí. Hệ thống đánh giá, nhắc và báo cáo — người quét thẻ ở cửa quyết định cho vào."
      />
      <div className="cr-tabs" role="tablist">
        {[
          ["coaches", "Đánh giá HLV"],
          ["leaves", "Nghỉ phép"],
          ["pass", "Thẻ ra vào"],
          ["checkin", "Check-in phòng gym"],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => s.set({ tab: k, state: "", search: "", status: "", page: "" })}>
            {l}
          </button>
        ))}
      </div>
      {tab === "leaves" ? <LeavesTab /> : tab === "pass" ? <PassTab /> : tab === "checkin" ? <CheckInTab /> : <RosterTab />}
    </>
  );
}

// ─── Đánh giá HLV ───────────────────────────────────────────────────────────

function RosterTab() {
  const s = useUrlState({ tab: "coaches" });
  const cache = useQueryClient();
  const [detail, setDetail] = useState<Row | null>(null);
  const [exempt, setExempt] = useState<{ row: Row; remove: boolean } | null>(null);
  const [grace, setGrace] = useState(false);

  const terms = useQuery({
    queryKey: keyOf("list"),
    queryFn: ({ signal }) => api<Row[]>("GET /terms", { signal }),
  });
  const current = useQuery({
    queryKey: keyOf("current"),
    queryFn: ({ signal }) => api<Row>("GET /terms/current", { signal }),
  });
  const termId = s.value("term") || str(current.data?.data.id);
  const query = { state: s.value("state"), search: s.value("search") };
  const q = useQuery({
    queryKey: keyOf("roster", termId, query),
    enabled: Boolean(termId),
    queryFn: ({ signal }) => api<RosterRes>("GET /terms/{id}/coaches", { params: { id: termId }, query, signal }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => void cache.invalidateQueries({ queryKey: ["admin", "terms"] });

  const evaluate = useMutation({
    mutationFn: () => api("POST /terms/{id}/evaluate", { params: { id: termId } }),
    onSuccess: refresh,
  });
  const maintenance = useMutation({
    mutationFn: () => api("POST /terms/maintenance"),
    onSuccess: refresh,
  });
  const exemptM = useMutation({
    mutationFn: ({ coachId, remove, reason }: { coachId: string; remove: boolean; reason: string }) =>
      remove
        ? api("DELETE /terms/{id}/coaches/{coachId}/exempt", { params: { id: termId, coachId } })
        : api("PUT /terms/{id}/coaches/{coachId}/exempt", { params: { id: termId, coachId }, body: { reason } }),
    onSuccess: () => {
      refresh();
      setExempt(null);
    },
  });

  const term = q.data?.data.term;
  const sum = q.data?.data.summary;
  const termOptions: [string, string][] = (terms.data?.data ?? []).map((t) => [str(t.id), `${str(t.name)}${t.id === current.data?.data.id ? " (hiện tại)" : ""}`]);

  return (
    <>
      <Panel
        title={term ? str(term.name) : "Kỳ học"}
        desc={
          term
            ? `${dateOnly(term.startDate)} – ${dateOnly(term.endDate)} · ${TERM_PHASE[str(term.phase)] ?? str(term.phase)} · ân hạn ${str(term.graceDays)} ngày (đến ${dateOnly(new Date(new Date(str(term.graceDeadline)).getTime() - 1))})`
            : undefined
        }
        actions={
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <button className="cr-btn" onClick={() => setGrace(true)} disabled={!term || term.phase === "ENDED"}>
              <CalendarClock size={16} /> Chỉnh ân hạn
            </button>
            <button className="cr-btn" onClick={() => evaluate.mutate()} disabled={!termId || evaluate.isPending}>
              <Play size={16} /> {evaluate.isPending ? "Đang đánh giá…" : "Đánh giá & lưu kết quả"}
            </button>
            <button className="cr-btn" onClick={() => maintenance.mutate()} disabled={maintenance.isPending} title="Chạy ngay job nhắc + báo cáo (cũng chạy định kỳ ở server)">
              {maintenance.isPending ? "Đang chạy…" : "Gửi nhắc ngay"}
            </button>
          </span>
        }
      >
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <Select label="Kỳ" value={termId} onChange={(v) => s.set({ term: v })} options={termOptions} all={null} />
          <Select label="Trạng thái" value={s.value("state")} onChange={(v) => s.set({ state: v })} options={Object.entries(TERM_STATE).map(([k, [l]]) => [k, l])} />
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tìm tên hoặc email HLV" />
        </div>
        {(evaluate.error || maintenance.error) && <ErrorBox error={evaluate.error ?? maintenance.error} />}
        {maintenance.data && (
          <p className="cr-note" role="status">
            Đã chạy: {num(get(maintenance.data, "data.evaluated"))} lượt đánh giá, {num(get(maintenance.data, "data.coachReminders"))} nhắc HLV, {num(get(maintenance.data, "data.managerReports"))} báo cáo Manager.
          </p>
        )}
        {sum && (
          <div className="cr-kpis" style={{ marginBottom: 16 }}>
            {(
              [
                ["Tổng HLV", sum.total, ""],
                ["Đạt", sum.COMPLIANT, "ok"],
                ["Chờ đủ điều kiện", sum.PENDING, "warn"],
                ["Chưa đạt", sum.NON_COMPLIANT, "bad"],
                ["Được miễn", sum.EXEMPT, "info"],
                ["Có nguy cơ", sum.atRisk, "warn"],
              ] as const
            ).map(([label, value, tone]) => (
              <div className="cr-kpi" key={label}>
                <span className="cr-kpi-value">{num(value)}</span>
                <span className="cr-kpi-label">{tone ? <Pill tone={tone}>{label}</Pill> : label}</span>
              </div>
            ))}
          </div>
        )}
        <QueryView q={q}>
          {(res) => (
            <DataTable
              rows={res.data.coaches.map((c): Row => ({ ...c, id: get(c, "coach.id") }))}
              label="Đánh giá HLV theo kỳ"
              columns={[
                {
                  key: "coach",
                  title: "HLV",
                  render: (r) => (
                    <div className="cr-cell-main">
                      <strong>{str(get(r, "coach.fullName"))}</strong>
                      <small>{str(get(r, "coach.email"))}</small>
                    </div>
                  ),
                },
                {
                  key: "state",
                  title: "Trạng thái",
                  render: (r) => {
                    const ev = r.evaluation as TermEvaluationView;
                    const [label, tone] = termState(ev.state);
                    return (
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <Pill tone={tone}>{label}</Pill>
                        {ev.atRisk && <Pill tone="warn">Có nguy cơ</Pill>}
                        {ev.final === false && ev.state !== "EXEMPT" && <Pill tone="plain">Tạm thời</Pill>}
                      </span>
                    );
                  },
                },
                { key: "reg", title: "Khóa học / hạn", render: (r) => registrationSummary(r.evaluation as TermEvaluationView) },
                { key: "del", title: "Việc dạy", render: (r) => deliverySummary(r.evaluation as TermEvaluationView) },
                {
                  key: "x",
                  title: "",
                  className: "actions",
                  render: (r) => (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button className="cr-btn sm" onClick={() => setDetail(r)}>
                        Chi tiết
                      </button>
                      {r.manualExempt ? (
                        <button className="cr-btn sm" onClick={() => setExempt({ row: r, remove: true })}>
                          Bỏ miễn
                        </button>
                      ) : (
                        <button className="cr-btn sm" onClick={() => setExempt({ row: r, remove: false })}>
                          Miễn trừ
                        </button>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      {detail && <CoachDetailDialog row={detail} onClose={() => setDetail(null)} />}
      {exempt && (
        <ConfirmDialog
          title={exempt.remove ? "Bỏ miễn trừ" : "Miễn trừ cho HLV"}
          target={str(get(exempt.row, "coach.fullName"))}
          consequence={
            exempt.remove
              ? "HLV sẽ được đánh giá lại theo tiêu chí thường. Kết quả có thể là chưa đạt nếu chưa có khóa học hợp lệ."
              : "HLV được xem là đạt kỳ này bất kể số liệu, và nhận thông báo kèm lý do. Chỉ dùng khi có lý do chính đáng (công tác, bảo lưu…)."
          }
          confirmLabel={exempt.remove ? "Bỏ miễn trừ" : "Miễn trừ"}
          reason={exempt.remove ? undefined : { label: "Lý do miễn trừ", required: true, min: 3 }}
          busy={exemptM.isPending}
          error={exemptM.error}
          onConfirm={(reason) => exemptM.mutate({ coachId: str(get(exempt.row, "coach.id")), remove: exempt.remove, reason })}
          onClose={() => setExempt(null)}
        />
      )}
      {grace && term && <GraceDialog term={term} onClose={() => setGrace(false)} onSaved={refresh} />}
    </>
  );
}

function CoachDetailDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const ev = row.evaluation as Row & TermEvaluationView & { reasons: string[]; warnings: string[]; leave: Row };
  const [label, tone] = termState(ev.state);
  const reg = (ev.registration ?? {}) as Row;
  const del = (ev.delivery ?? {}) as Row;
  const manual = row.manualExempt as Row | null;
  return (
    <Dialog title={str(get(row, "coach.fullName"))} eyebrow={str(get(row, "coach.email"))} onClose={onClose} wide footer={<button className="cr-btn" onClick={onClose}>Đóng</button>}>
      <p style={{ margin: 0 }}>
        <Pill tone={tone}>{label}</Pill> {ev.final ? "Kết quả cuối kỳ" : "Kết quả tạm thời (kỳ chưa kết thúc)"}
      </p>
      {ev.reasons.length > 0 && (
        <ul style={{ margin: "10px 0" }}>
          {ev.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {ev.warnings.length > 0 && (
        <div role="note" style={{ margin: "10px 0" }}>
          <strong>Cảnh báo</strong>
          <ul style={{ margin: "6px 0 0" }}>
            {ev.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <Dl
        items={[
          ["Hạn tạo khóa", dateOnly(new Date(new Date(str(ev.deadlineAt)).getTime() - 1))],
          ["Khóa hợp lệ", reg.ok ? `${str(reg.qualifyingClassName)} · ${str(reg.mainSessions)} buổi, trải ${str(reg.spanDays)} ngày` : `Chưa có (cần ≥ ${str(get(reg, "required.sessions"))} buổi, trải ≥ ${str(get(reg, "required.spanDays"))} ngày)`],
          ["Đã dạy / hủy / chưa hoàn tất", `${str(del.completed)} / ${str(del.cancelled)} / ${str(del.awaitingComplete)}`],
          ["Tỷ lệ đã dạy", percent(del.completionRate)],
          ["Tỷ lệ hủy", percent(del.cancelRate)],
          ["Có bằng chứng dạy (điểm danh/QR)", `${percent(del.evidenceRate)} (${str(del.withEvidence)}/${str(del.completedWithStudents)} buổi có học viên)`],
          ["Nghỉ phép được duyệt", `${str(get(ev, "leave.approvedDays"))} ngày (gia hạn ân hạn ${str(get(ev, "leave.graceExtensionDays"))} ngày)`],
          ["Miễn trừ thủ công", manual ? `${str(manual.reason)} (${dateTime(manual.at)})` : ""],
          ["Bậc nhắc đã gửi", str(row.lastReminderStage)],
        ]}
      />
    </Dialog>
  );
}

function GraceDialog({ term, onClose, onSaved }: { term: Row; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState(str(term.graceDays));
  const m = useMutation({
    mutationFn: () => api("PATCH /terms/{id}", { params: { id: str(term.id) }, body: { graceDays: Number(days) } }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const invalid = !/^\d+$/.test(days) || Number(days) > 60;
  const errs = fieldErrors(m.error);
  return (
    <Dialog
      title={`Hạn ân hạn — ${str(term.name)}`}
      eyebrow="Số ngày kể từ đầu kỳ để HLV có khóa học hợp lệ"
      onClose={onClose}
      busy={m.isPending}
      onSubmit={() => !invalid && m.mutate()}
      footer={
        <>
          <button type="button" className="cr-btn" onClick={onClose} disabled={m.isPending}>
            Hủy
          </button>
          <button type="submit" className="cr-btn primary" disabled={invalid || m.isPending}>
            {m.isPending ? "Đang lưu…" : "Lưu"}
          </button>
        </>
      }
    >
      <Field label="Số ngày ân hạn" required error={errs.graceDays || (invalid ? "Số nguyên từ 0 đến 60." : undefined)} hint="Mặc định 14 ngày. Nghỉ phép được duyệt sẽ cộng thêm cho từng HLV.">
        <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}

// ─── Nghỉ phép ──────────────────────────────────────────────────────────────

function LeavesTab() {
  const s = useUrlState({ status: "PENDING" });
  const cache = useQueryClient();
  const [action, setAction] = useState<{ row: Row; kind: "APPROVE" | "REJECT" } | null>(null);
  const query = { status: s.value("status"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: keyOf("leaves", query),
    queryFn: ({ signal }) => api<Row[]>("GET /terms/leaves", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const review = useMutation({
    mutationFn: ({ id, kind, note }: { id: string; kind: "APPROVE" | "REJECT"; note: string }) =>
      api("PATCH /terms/leaves/{id}/review", { params: { id }, body: { action: kind, ...(note ? { note } : {}) } }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "terms"] });
      setAction(null);
    },
  });
  return (
    <>
      <Panel title="Đơn nghỉ phép của HLV" desc="Nghỉ được duyệt: gia hạn hạn tạo khóa đúng số ngày nghỉ, buổi hủy trong thời gian nghỉ không bị tính; nghỉ ≥ 50% kỳ thì miễn cả kỳ.">
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(LEAVE_STATUS).map(([k, [l]]) => [k, l])} />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                label="Đơn nghỉ phép"
                columns={[
                  {
                    key: "coach",
                    title: "HLV",
                    render: (r) => (
                      <div className="cr-cell-main">
                        <strong>{str(get(r, "coach.user.fullName"))}</strong>
                        <small>{str(get(r, "coach.user.email"))}</small>
                      </div>
                    ),
                  },
                  { key: "range", title: "Thời gian nghỉ", render: (r) => `${dateOnly(r.startDate)} – ${dateOnly(r.endDate)}` },
                  { key: "kind", title: "Loại", render: (r) => LEAVE_KIND[str(r.kind)] ?? str(r.kind) },
                  { key: "reason", title: "Lý do", render: (r) => str(r.reason) },
                  {
                    key: "st",
                    title: "Trạng thái",
                    render: (r) => {
                      const [l, t] = LEAVE_STATUS[str(r.status)] ?? [str(r.status), "info"];
                      return <Pill tone={t}>{l}</Pill>;
                    },
                  },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (r) =>
                      r.status === "PENDING" ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button className="cr-btn sm primary" onClick={() => setAction({ row: r, kind: "APPROVE" })}>
                            Duyệt
                          </button>
                          <button className="cr-btn sm danger" onClick={() => setAction({ row: r, kind: "REJECT" })}>
                            Từ chối
                          </button>
                        </span>
                      ) : (
                        <small>{str(r.reviewNote)}</small>
                      ),
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {action && (
        <ConfirmDialog
          title={action.kind === "APPROVE" ? "Duyệt đơn nghỉ" : "Từ chối đơn nghỉ"}
          target={`${str(get(action.row, "coach.user.fullName"))} · ${dateOnly(action.row.startDate)} – ${dateOnly(action.row.endDate)}`}
          consequence={
            action.kind === "APPROVE"
              ? "HLV được gia hạn hạn tạo khóa tương ứng và nhận thông báo."
              : "Đơn bị từ chối, HLV nhận thông báo kèm ghi chú (nếu có)."
          }
          confirmLabel={action.kind === "APPROVE" ? "Duyệt" : "Từ chối"}
          danger={action.kind === "REJECT"}
          reason={{ label: action.kind === "APPROVE" ? "Ghi chú (không bắt buộc)" : "Lý do từ chối", required: action.kind === "REJECT", min: 3 }}
          busy={review.isPending}
          error={review.error}
          onConfirm={(note) => review.mutate({ id: str(action.row.id), kind: action.kind, note })}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

// ─── Check-in phòng gym ─────────────────────────────────────────────────────

type CheckInQr = { token: string; expiresIn: number; issuedAt: string };
type CheckInList = {
  items: Row[];
  summary: { total: number; free: number; paid: number; feeAssessed: number; feeCharged: number; feeDebt: number };
  policy: { freeDaysPerMonth: number; feePerDay: number };
};

/** Mã QR check-in cho HLV quét (đổi mỗi ~45 giây) + nhật ký check-in và phí phát sinh. */
function CheckInTab() {
  const s = useUrlState();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const issue = useMutation({ mutationFn: () => api<CheckInQr>("POST /terms/check-in/qr") });
  const issueRef = useRef(issue.mutate);
  issueRef.current = issue.mutate;

  // Tự đổi mã trước khi hết hạn; dừng khi rời tab (unmount).
  useEffect(() => {
    issueRef.current();
    const id = window.setInterval(() => issueRef.current(), 45_000);
    return () => window.clearInterval(id);
  }, []);
  const expiresAt = issue.data ? new Date(issue.data.data.issuedAt).getTime() + issue.data.data.expiresIn * 1000 : 0;
  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const today = vnDateKey(new Date());
  const day = s.value("day") || today;
  const query = { dayKey: day, page: String(s.page), limit: "15" };
  const list = useQuery({
    queryKey: keyOf("checkins", query),
    queryFn: ({ signal }) => api<CheckInList>("GET /terms/check-ins", { query, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: day === today ? 15_000 : false,
  });
  const policy = list.data?.data.policy;
  return (
    <>
      <Panel
        title="Mã QR check-in cho HLV"
        desc={
          policy
            ? `HLV quét mã bằng ứng dụng để ghi 1 ngày dùng phòng. Miễn phí ${policy.freeDaysPerMonth} ngày/tháng cho HLV có thẻ hợp lệ; quá hạn mức (hoặc thẻ không hợp lệ) tính ${vnd(policy.feePerDay)}/ngày, trừ từ tiền của khóa cũ nhất còn dư.`
            : "HLV quét mã bằng ứng dụng để ghi 1 ngày dùng phòng."
        }
        actions={
          <button className="cr-btn" onClick={() => issue.mutate()} disabled={issue.isPending}>
            <RefreshCw size={16} /> Đổi mã ngay
          </button>
        }
      >
        {issue.error ? <ErrorBox error={issue.error} retry={() => issue.mutate()} /> : null}
        <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "8px 0" }}>
          <div style={{ background: "#fff", padding: 14, borderRadius: 16 }}>
            {issue.data ? <QRCodeSVG value={issue.data.data.token} size={240} level="M" aria-label="Mã QR check-in HLV" /> : <div style={{ width: 240, height: 240 }} />}
          </div>
          <strong aria-live="off">{issue.data ? `Mã tự đổi sau ${secondsLeft} giây` : "Đang tạo mã…"}</strong>
          <small>Đặt màn hình này ở quầy. Đừng chụp hoặc gửi mã cho người khác — mã chỉ sống khoảng một phút.</small>
        </div>
      </Panel>
      <Panel title="Nhật ký check-in" desc="Mỗi HLV tối đa một ngày dùng phòng mỗi ngày; quét lại trong ngày không tính thêm.">
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <Field label="Ngày">
            <input type="date" value={day} max={today} onChange={(e) => s.set({ day: e.target.value === today ? "" : e.target.value })} />
          </Field>
        </div>
        <QueryView q={list}>
          {(res) => (
            <>
              <div className="cr-kpis" style={{ marginBottom: 16 }}>
                {(
                  [
                    ["Lượt check-in", num(res.data.summary.total), ""],
                    ["Miễn phí", num(res.data.summary.free), "ok"],
                    ["Tính phí", num(res.data.summary.paid), "warn"],
                    ["Phí phát sinh", vnd(res.data.summary.feeAssessed), ""],
                    ["Đã trừ ví", vnd(res.data.summary.feeCharged), "ok"],
                    ["Ghi nợ", vnd(res.data.summary.feeDebt), "bad"],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div className="cr-kpi" key={label}>
                    <span className="cr-kpi-value">{value}</span>
                    <span className="cr-kpi-label">{tone ? <Pill tone={tone}>{label}</Pill> : label}</span>
                  </div>
                ))}
              </div>
              <DataTable
                rows={res.data.items}
                label="Nhật ký check-in phòng gym"
                columns={[
                  { key: "at", title: "Giờ", render: (r) => dateTime(r.checkedInAt) },
                  { key: "coach", title: "HLV", render: (r) => str(get(r, "coach.user.fullName")) },
                  { key: "idx", title: "Ngày thứ", className: "num", render: (r) => str(r.dayIndex) },
                  { key: "kind", title: "Loại", render: (r) => <Pill tone={r.free ? "ok" : "warn"}>{r.free ? "Miễn phí" : "Tính phí"}</Pill> },
                  { key: "fee", title: "Phí", className: "num", render: (r) => (Number(r.feeAssessed) > 0 ? vnd(r.feeAssessed) : "—") },
                  { key: "charged", title: "Đã trừ ví", className: "num", render: (r) => (Number(r.feeCharged) > 0 ? vnd(r.feeCharged) : "—") },
                  { key: "debt", title: "Ghi nợ", className: "num", render: (r) => (Number(r.feeDebt) > 0 ? vnd(r.feeDebt) : "—") },
                  { key: "state", title: "Trạng thái kỳ", render: (r) => (r.termState ? termState(r.termState)[0] : "—") },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
    </>
  );
}

// ─── Thẻ ra vào ─────────────────────────────────────────────────────────────

type PassResult = { valid: boolean; level: PassLevel; reason: string; coach: { fullName: string }; state: string | null; previousState: string | null; term: { name: string }; scannedAt: string };

function PassTab() {
  const s = useUrlState();
  const cache = useQueryClient();
  const [token, setToken] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const locked = useRef(false);

  const verify = useMutation({
    mutationFn: (raw: string) => api<PassResult>("POST /terms/pass/verify", { body: { token: extractPassToken(raw) } }),
    onSuccess: () => {
      setToken("");
      void cache.invalidateQueries({ queryKey: keyOf("scans") });
    },
    onSettled: () => {
      locked.current = false;
    },
  });
  const submit = useRef((value: string) => verify.mutate(value));
  submit.current = (value) => {
    if (!locked.current) {
      locked.current = true;
      setCamera(false);
      verify.mutate(value);
    }
  };

  useEffect(() => {
    if (!camera || !video.current) return;
    let disposed = false;
    let controls: { stop(): void } | undefined;
    const element = video.current;
    import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (disposed) return;
        controls = await new BrowserQRCodeReader().decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, element, (result, _error, control) => {
          if (result && !disposed && !locked.current) {
            control.stop();
            submit.current(result.getText());
          }
        });
        if (disposed) controls.stop();
      })
      .catch(() => {
        if (!disposed) {
          setCameraError("Không mở được camera. Hãy cấp quyền camera, dùng HTTPS hoặc dán mã bên dưới.");
          setCamera(false);
        }
      });
    return () => {
      disposed = true;
      controls?.stop();
      const stream = element.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
      element.srcObject = null;
    };
  }, [camera]);

  const query = { valid: s.value("valid"), page: String(s.page), limit: "15" };
  const scans = useQuery({
    queryKey: keyOf("scans", query),
    queryFn: ({ signal }) => api<Row[]>("GET /terms/pass/scans", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const result = verify.data?.data;
  const level = result ? PASS_LEVEL[result.level] : null;

  return (
    <>
      <Panel title="Quét thẻ ra vào của HLV" desc="HLV mở thẻ trong ứng dụng (mã QR đổi mỗi phút). Quét hoặc dán mã để biết thẻ còn hợp lệ không — hệ thống chỉ báo kết quả và ghi nhật ký, không tự khóa ai.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            className="cr-btn primary"
            disabled={verify.isPending}
            onClick={() => {
              verify.reset();
              setCameraError("");
              setCamera(!camera);
            }}
          >
            <ScanLine size={16} /> {camera ? "Dừng camera" : "Mở camera quét QR"}
          </button>
        </div>
        {camera && <video ref={video} muted playsInline aria-label="Camera quét thẻ HLV" style={{ width: "min(360px, 100%)", borderRadius: 12 }} />}
        {cameraError && <p role="alert">{cameraError}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) verify.mutate(token);
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}
        >
          <Field label="Hoặc dán mã thẻ" hint="Dùng khi camera không hoạt động.">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Mã thẻ (JWT)" autoComplete="off" style={{ minWidth: 280 }} />
          </Field>
          <button className="cr-btn" type="submit" disabled={verify.isPending || !token.trim()}>
            {verify.isPending ? "Đang kiểm tra…" : "Kiểm tra"}
          </button>
        </form>
        {verify.error ? <ErrorBox error={verify.error} /> : null}
        {result && level && (
          <div role="status" className="cr-confirm-target" style={{ marginTop: 14 }}>
            <small>{dateTime(result.scannedAt)} · {result.term.name}</small>
            <strong>
              {result.coach.fullName} <Pill tone={level.tone}>{level.label}</Pill>
            </strong>
            <span>{result.reason}</span>
            <small>
              Trạng thái kỳ: {result.state ? termState(result.state)[0] : "—"}
              {result.previousState ? ` · kỳ trước: ${termState(result.previousState)[0]}` : ""}
            </small>
          </div>
        )}
      </Panel>
      <Panel title="Nhật ký quét thẻ">
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <Select
            label="Kết quả"
            value={s.value("valid")}
            onChange={(v) => s.set({ valid: v })}
            options={[
              ["true", "Hợp lệ"],
              ["false", "Không hợp lệ"],
            ]}
          />
        </div>
        <QueryView q={scans}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                label="Nhật ký quét thẻ HLV"
                columns={[
                  { key: "at", title: "Thời gian", render: (r) => dateTime(r.createdAt) },
                  { key: "coach", title: "HLV", render: (r) => str(get(r, "coach.user.fullName")) },
                  { key: "valid", title: "Kết quả", render: (r) => <Pill tone={r.valid ? "ok" : "bad"}>{r.valid ? "Hợp lệ" : "Không hợp lệ"}</Pill> },
                  { key: "state", title: "Trạng thái kỳ", render: (r) => (r.state ? termState(r.state)[0] : "—") },
                  { key: "reason", title: "Lý do", render: (r) => str(r.reason) },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
    </>
  );
}

