import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ScanLine } from "lucide-react";
import { api } from "../../../shared/api";
import { EmptyState, DataTable, Dialog, ErrorBox, Field, PageHead, Pager, Panel, Pill, QueryView, SearchBox, Select, dateOnly, dateTime, get, num, str, useUrlState, vnd } from "../kit";
import type { Row } from "../kit";

const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info" | "plain"]> = {
  ACTIVE: ["Đang hiệu lực", "ok"],
  EXPIRED: ["Hết hạn", "plain"],
  CANCELLED: ["Đã hủy", "bad"],
};

/**
 * Hội viên & thẻ (Doc/MEMBERSHIP_FLOW.md §2.3–2.4): danh sách gói của hội viên, Manager hủy gói (+ hoàn tùy chọn),
 * quét thẻ (máy quét mã vạch / dán mã QR động) và nhật ký vào cửa.
 */
export default function MembershipsPage() {
  const s = useUrlState();
  const [cancelling, setCancelling] = useState<Row | null>(null);
  const query = { status: s.value("status"), planId: s.value("planId"), search: s.value("search"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "memberships", query],
    queryFn: ({ signal }) => api<Row[]>("GET /memberships", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const plans = useQuery({
    queryKey: ["admin", "membership-plans"],
    queryFn: ({ signal }) => api<Row[]>("GET /membership-plans/manage", { signal }),
  });
  return (
    <>
      <PageHead
        eyebrow="Kinh doanh · Gói thành viên"
        title="Hội viên & thẻ thành viên"
        desc="Gói đã bán cho hội viên (gồm gói mua trước đang xếp hàng). Thẻ trên ứng dụng dùng mã QR đổi mỗi phút — quét bên dưới để kiểm tra khi vào cửa."
        actions={
          <Link className="cr-btn" to="/manager/membership-plans">
            Cấu hình gói
          </Link>
        }
      />
      <PassScanner />
      <Panel title="Gói của hội viên">
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tên, email hoặc SĐT hội viên" />
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS).map(([k, [l]]) => [k, l])} />
          <Select
            label="Gói"
            value={s.value("planId")}
            onChange={(v) => s.set({ planId: v })}
            options={(plans.data?.data ?? []).map((p) => [str(p.id), str(p.name)] as [string, string])}
          />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                empty={<EmptyState title="Chưa có gói nào" text="Gói hội viên mua trên ứng dụng sẽ hiện tại đây." />}
                columns={[
                  {
                    key: "m",
                    title: "Hội viên",
                    render: (m) => (
                      <div className="cr-cell-main">
                        <strong>{str(get(m, "member.user.fullName"))}</strong>
                        <small>{[get(m, "member.user.email"), get(m, "member.user.phone")].filter(Boolean).map(str).join(" · ")}</small>
                      </div>
                    ),
                  },
                  {
                    key: "p",
                    title: "Gói (lúc mua)",
                    render: (m) => (
                      <div className="cr-cell-main">
                        <span>{str(get(m, "plan.name"))}</span>
                        <small>{num(m.totalDays)} ngày · đã trả {m.paidAmount === null ? "—" : vnd(m.paidAmount)}</small>
                      </div>
                    ),
                  },
                  {
                    key: "t",
                    title: "Hiệu lực",
                    render: (m) => (
                      <div className="cr-cell-main">
                        <span className="cr-mono">
                          {dateOnly(m.startDate)} – {dateOnly(m.endDate)}
                        </span>
                        <small>{m.status === "ACTIVE" ? (m.isQueued ? "Chờ tới lượt" : `Còn ${num(m.daysLeft)} ngày`) : str(m.cancelReason) || ""}</small>
                      </div>
                    ),
                  },
                  {
                    key: "s",
                    title: "Trạng thái",
                    render: (m) => {
                      const [label, tone] = m.isQueued ? ["Xếp hàng", "info" as const] : (STATUS[str(m.status)] ?? [str(m.status), "plain" as const]);
                      return <Pill tone={tone}>{label}</Pill>;
                    },
                  },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (m) =>
                      m.status === "ACTIVE" ? (
                        <button className="cr-btn sm danger" onClick={() => setCancelling(m)}>
                          Hủy gói
                        </button>
                      ) : null,
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      <ScanLog />
      {cancelling && <CancelDialog membership={cancelling} onClose={() => setCancelling(null)} />}
    </>
  );
}

/** Ô quét thẻ: máy quét mã vạch dạng bàn phím gõ mã rồi Enter, hoặc dán mã từ ứng dụng. */
function PassScanner() {
  const [token, setToken] = useState("");
  const cache = useQueryClient();
  const verify = useMutation({
    mutationFn: (t: string) => api<Row>("POST /memberships/pass/verify", { body: { token: t } }),
    onSuccess: () => {
      setToken("");
      void cache.invalidateQueries({ queryKey: ["admin", "member-pass-scans"] });
    },
  });
  const r = verify.data?.data;
  return (
    <Panel title="Quét thẻ thành viên" desc="Đặt con trỏ vào ô dưới rồi quét mã QR trên ứng dụng của hội viên (mã có hiệu lực 60 giây).">
      <form
        className="cr-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) verify.mutate(token.trim());
        }}
      >
        <label className="cr-field" style={{ flex: 1, minWidth: 260 }}>
          <span>Mã thẻ</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Quét hoặc dán mã QR…" autoComplete="off" />
        </label>
        <button className="cr-btn primary" disabled={verify.isPending || !token.trim()} style={{ alignSelf: "flex-end" }}>
          <ScanLine size={16} /> {verify.isPending ? "Đang kiểm tra…" : "Kiểm tra"}
        </button>
      </form>
      {verify.error ? <ErrorBox error={verify.error} /> : null}
      {r ? (
        <div className={"cr-scan-result " + (r.valid ? "ok" : "bad")} role="status">
          <strong>{r.valid ? "THẺ HỢP LỆ" : "THẺ KHÔNG HỢP LỆ"}</strong>
          <span>
            {str(get(r, "member.fullName"))} · {str(get(r, "membership.planName")) || "chưa có gói"}
          </span>
          <small>
            {str(r.reason)}
            {r.valid ? ` Hiệu lực đến ${dateOnly(r.validUntil)} (còn ${num(r.totalDaysLeft)} ngày) · lượt vào thứ ${num(r.entriesToday)} hôm nay.` : ""}
          </small>
        </div>
      ) : null}
    </Panel>
  );
}

function ScanLog() {
  const [valid, setValid] = useState("");
  const q = useQuery({
    queryKey: ["admin", "member-pass-scans", valid],
    queryFn: ({ signal }) => api<Row[]>("GET /memberships/pass/scans", { query: { limit: "20", ...(valid ? { valid } : {}) }, signal }),
  });
  return (
    <Panel
      title="Nhật ký vào cửa"
      actions={
        <Select
          label="Kết quả"
          value={valid}
          onChange={setValid}
          options={[
            ["true", "Hợp lệ"],
            ["false", "Không hợp lệ"],
          ]}
        />
      }
    >
      <QueryView q={q}>
        {(res) => (
          <DataTable
            rows={res.data}
            empty={<EmptyState title="Chưa có lượt quét" text="Mỗi lần quét thẻ ở cửa sẽ được ghi lại tại đây." />}
            columns={[
              { key: "t", title: "Thời điểm", render: (x) => <span className="cr-mono">{dateTime(x.createdAt)}</span> },
              { key: "m", title: "Hội viên", render: (x) => str(get(x, "member.user.fullName")) },
              { key: "p", title: "Gói", render: (x) => str(get(x, "membership.plan.name")) || "—" },
              { key: "v", title: "Kết quả", render: (x) => (x.valid ? <Pill tone="ok">Hợp lệ</Pill> : <Pill tone="bad">Không hợp lệ</Pill>) },
              { key: "r", title: "Ghi chú", render: (x) => str(x.reason) },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

function CancelDialog({ membership, onClose }: { membership: Row; onClose: () => void }) {
  const max = Number(membership.refundableValue ?? 0);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(String(max));
  const cache = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      api("POST /memberships/{id}/cancel", { params: { id: str(membership.id) }, body: { reason: reason.trim(), refundAmount: Number(refund) || 0 } }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "memberships"] });
      void cache.invalidateQueries({ queryKey: ["admin", "membership-plans"] });
      onClose();
    },
  });
  const amount = Number(refund);
  const invalid = reason.trim().length < 3 || !Number.isInteger(amount) || amount < 0 || amount > max;
  return (
    <Dialog
      title="Hủy gói thành viên"
      eyebrow={str(get(membership, "member.user.fullName"))}
      onClose={onClose}
      busy={m.isPending}
      onSubmit={() => !invalid && m.mutate()}
      footer={
        <>
          <button type="button" className="cr-btn ghost" onClick={onClose} disabled={m.isPending}>
            Quay lại
          </button>
          <button className="cr-btn danger-solid" disabled={m.isPending || invalid}>
            {m.isPending ? "Đang hủy…" : "Hủy gói"}
          </button>
        </>
      }
    >
      <div className="cr-confirm-target">
        <small>Gói</small>
        <strong>
          {str(get(membership, "plan.name"))} · {dateOnly(membership.startDate)} – {dateOnly(membership.endDate)}
        </strong>
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--text-2)" }}>
        Gói chuyển sang “Đã hủy”, thẻ không còn hợp lệ. Các gói mua trước phía sau sẽ được dời lên ngay. Khoản hoàn (nếu có) được tạo thành yêu cầu ở trang Hoàn tiền để
        chuyển khoản rồi duyệt.
      </p>
      <div className="cr-form">
        <Field label="Lý do hủy" required wide>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder="VD: Hội viên chuyển nhượng / vi phạm nội quy" />
        </Field>
        <Field label="Số tiền hoàn (VNĐ)" hint={`Tối đa ${vnd(max)} — giá trị phần ngày chưa dùng. Nhập 0 nếu không hoàn.`} error={amount > max ? `Tối đa ${vnd(max)}.` : undefined}>
          <input type="number" min={0} max={max} step={1000} value={refund} onChange={(e) => setRefund(e.target.value)} />
        </Field>
      </div>
      {m.error ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}
