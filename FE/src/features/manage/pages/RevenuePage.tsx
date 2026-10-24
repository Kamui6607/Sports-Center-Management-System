import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import { DataTable, ErrorBox, PageHead, Pager, Panel, Pill, QueryView, Select, dateTime, get, num, str, useUrlState, vnDateKey, vnd } from "../kit";
import type { Row } from "../kit";

const METHOD: Record<string, string> = { SEPAY: "Chuyển khoản SePay", BANK_TRANSFER: "Chuyển khoản tại quầy", CASH: "Tiền mặt" };
const PAY_STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  SUCCESS: ["Thành công", "ok"],
  PENDING: ["Chờ thanh toán", "warn"],
  FAILED: ["Thất bại", "bad"],
  REFUNDED: ["Đã hoàn", "info"],
};

export function paymentType(p: Row) {
  if (p.orderId) return "Đơn hàng";
  if (p.classId) return "Khóa học";
  if (str(p.note).startsWith("MEMBERSHIP_PLAN:")) return "Gói thành viên";
  return "Khác";
}

/** Kỳ báo cáo theo ngày giờ Việt Nam. */
export function periodRange(preset: string, from: string, to: string): [string, string] {
  const today = vnDateKey(new Date());
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (preset) {
    case "last-month": {
      const yy = m === 1 ? y - 1 : y;
      const mm = m === 1 ? 12 : m - 1;
      return [`${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`];
    }
    case "30d": {
      const d = new Date(`${today}T12:00:00+07:00`);
      d.setUTCDate(d.getUTCDate() - 29);
      return [vnDateKey(d), today];
    }
    case "year":
      return [`${y}-01-01`, today];
    case "custom":
      return [from || today, to || today];
    default:
      return [`${y}-${pad(m)}-01`, today];
  }
}

/** Ô CSV an toàn: bọc ngoặc kép và chặn công thức (=, +, -, @, tab, CR) do dữ liệu người dùng nhập. */
export function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export default function RevenuePage() {
  const s = useUrlState({ preset: "month" });
  const [start, end] = periodRange(s.value("preset"), s.value("from"), s.value("to"));
  const invalid = end < start;
  const range = { startDate: start, endDate: end };
  const revenue = useQuery({
    queryKey: ["admin", "revenue", "report", range],
    queryFn: ({ signal }) => api<Row>("GET /reports/revenue", { query: range, signal }),
    enabled: !invalid,
  });
  const enrollments = useQuery({
    queryKey: ["admin", "revenue", "enrollments", range],
    queryFn: ({ signal }) => api<Row>("GET /reports/enrollments", { query: range, signal }),
    enabled: !invalid,
  });
  const memberships = useQuery({
    queryKey: ["admin", "revenue", "memberships", range],
    queryFn: ({ signal }) => api<Row>("GET /reports/memberships", { query: range, signal }),
    enabled: !invalid,
  });

  return (
    <>
      <PageHead
        eyebrow="Kinh doanh · Báo cáo"
        title="Doanh thu"

      />
      <Panel>
        <div className="cr-filters">
          <Select
            label="Kỳ báo cáo"
            all={null}
            value={s.value("preset")}
            onChange={(v) => s.set({ preset: v })}
            options={[
              ["month", "Tháng này"],
              ["last-month", "Tháng trước"],
              ["30d", "30 ngày gần nhất"],
              ["year", "Từ đầu năm"],
              ["custom", "Tùy chọn"],
            ]}
          />
          {s.value("preset") === "custom" && (
            <>
              <label className="cr-field">
                <span>Từ ngày</span>
                <input type="date" value={s.value("from") || start} onChange={(e) => s.set({ from: e.target.value })} />
              </label>
              <label className="cr-field">
                <span>Đến ngày</span>
                <input type="date" value={s.value("to") || end} onChange={(e) => s.set({ to: e.target.value })} />
              </label>
            </>
          )}
          <div className="cr-mono cr-muted" style={{ alignSelf: "flex-end", flex: "0 0 auto", lineHeight: "44px" }}>
            {start.split("-").reverse().join("/")} → {end.split("-").reverse().join("/")}
          </div>
        </div>
        {invalid && <div className="cr-alert warn" style={{ marginTop: 12 }}><div>"Đến ngày" phải sau hoặc bằng "Từ ngày".</div></div>}
      </Panel>

      {!invalid && (
        <QueryView q={revenue} rows={6}>
          {(res) => <RevenueBody r={res.data} enrollments={enrollments.data?.data} membershipRevenue={get(memberships.data, "data.totalRevenue")} />}
        </QueryView>
      )}
      {enrollments.isError ? <ErrorBox error={enrollments.error} retry={() => void enrollments.refetch()} /> : null}
      {!invalid && <PaymentsTable start={start} end={end} />}
    </>
  );
}

function Bars({ items, money = true, tone = "" }: { items: [string, number][]; money?: boolean; tone?: string }) {
  const max = Math.max(1, ...items.map(([, v]) => Math.abs(v)));
  if (!items.some(([, v]) => v)) return <p className="cr-muted" style={{ margin: 0 }}>Không có dữ liệu trong kỳ.</p>;
  return (
    <div className="cr-bars">
      {items.map(([label, v]) => (
        <div className="cr-bar-row" key={label}>
          <span>{label}</span>
          <div className="cr-bar-track" role="img" aria-label={`${label}: ${money ? vnd(v) : num(v)}`}>
            <div className={"cr-bar-fill " + tone} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
          </div>
          <span className="cr-mono">{money ? vnd(v) : num(v)}</span>
        </div>
      ))}
    </div>
  );
}

function RevenueBody({ r, enrollments, membershipRevenue }: { r: Row; enrollments?: Row; membershipRevenue: unknown }) {
  const byMethod = (r.revenueByMethod ?? {}) as Record<string, number>;
  const top = ((enrollments?.topClasses as Row[]) ?? []).map((c) => [str(c.className), Number(c.count)] as [string, number]);
  return (
    <>
      <div className="cr-kpis">
        <div className="cr-kpi">
          <div className="cr-kpi-label">Tổng thu</div>
          <div className="cr-kpi-value">{vnd(r.totalRevenue)}</div>
          <div className="cr-kpi-note">{num(r.successPayments)} giao dịch thành công</div>
        </div>
        <div className={"cr-kpi" + (Number(r.refundedAmount) > 0 ? " alert" : "")}>
          <div className="cr-kpi-label">Đã hoàn</div>
          <div className="cr-kpi-value">{vnd(r.refundedAmount)}</div>
          <div className="cr-kpi-note">
            {num(r.refundedPayments)} giao dịch hoàn toàn bộ · {num(r.partialRefunds)} khoản hoàn từng phần
          </div>
        </div>
        <div className="cr-kpi">
          <div className="cr-kpi-label">Thực nhận (ròng)</div>
          <div className="cr-kpi-value">{vnd(r.netRevenue)}</div>
          <div className="cr-kpi-note">tổng thu − đã hoàn</div>
        </div>
        <div className="cr-kpi amber">
          <div className="cr-kpi-label">Giao dịch tạo trong kỳ</div>
          <div className="cr-kpi-value">{num(r.totalPayments)}</div>
          <div className="cr-kpi-note">
            {num(r.pendingPayments)} chờ thanh toán · {num(r.failedPayments)} thất bại
          </div>
        </div>
      </div>
      <div className="cr-grid-2">
        <Panel title="Thu theo phương thức">
          <Bars items={Object.entries(METHOD).map(([k, l]) => [l, Number(byMethod[k] ?? 0)])} />
        </Panel>
        <Panel title="Giao dịch theo trạng thái">
          <Bars
            money={false}
            tone="alt"
            items={[
              ["Thành công", Number(r.successPayments ?? 0)],
              ["Đã hoàn", Number(r.refundedPayments ?? 0)],
              ["Chờ thanh toán", Number(r.pendingPayments ?? 0)],
              ["Thất bại", Number(r.failedPayments ?? 0)],
            ]}
          />
        </Panel>
        <Panel title="Khóa học nhiều lượt giữ chỗ" desc={`Top 5 · tổng ${num(enrollments?.totalEnrollments)} lượt, ${num(enrollments?.cancelledEnrollments)} lượt hủy.`}>
          {enrollments ? <Bars money={false} items={top} /> : <p className="cr-muted" style={{ margin: 0 }}>Đang tải…</p>}
        </Panel>
        <Panel title="Gói thành viên">
          <ul className="cr-list">
            <li>
              <span>Doanh thu gói thành viên</span>
              <b className="cr-mono">{membershipRevenue === undefined ? "…" : vnd(membershipRevenue)}</b>
            </li>
          </ul>
        </Panel>
      </div>
      <Panel
        title="Doanh thu theo mặt hàng"
        desc="Tên & số tiền theo ảnh chụp lúc mua — đổi giá/tên khóa học, gói hay sản phẩm sau này không làm thay đổi số liệu đã thu."
      >
        <DataTable
          rows={(r.revenueByItem as Row[]) ?? []}
          empty={<p className="cr-muted" style={{ margin: 0 }}>Chưa có khoản thu trong kỳ.</p>}
          columns={[
            { key: "n", title: "Mặt hàng (lúc mua)", render: (x) => str(x.name) },
            { key: "k", title: "Loại", render: (x) => ({ CLASS: "Khóa học", MEMBERSHIP: "Gói thành viên", ORDER: "Đơn hàng" })[str(x.kind)] ?? "Khác" },
            { key: "c", title: "Giao dịch", className: "num", render: (x) => num(x.count) },
            { key: "v", title: "Đã thu", className: "num", render: (x) => vnd(x.revenue) },
          ]}
        />
      </Panel>
      <Panel title="10 giao dịch gần nhất của kỳ">
        <DataTable
          rows={(r.recentPayments as Row[]) ?? []}
          empty={<p className="cr-muted" style={{ margin: 0 }}>Không có giao dịch thu/hoàn trong kỳ.</p>}
          columns={[
            { key: "t", title: "Thanh toán lúc", render: (p) => <span className="cr-mono">{dateTime(p.paidAt)}</span> },
            { key: "m", title: "Người mua", render: (p) => str(get(p, "member.user.fullName")) || "—" },
            { key: "k", title: "Loại", render: (p) => paymentType(p) },
            { key: "i", title: "Mặt hàng (lúc mua)", render: (p) => str(p.itemName) || "—" },
            { key: "s", title: "Trạng thái", render: (p) => <PayPill status={p.status} /> },
            { key: "a", title: "Số tiền", className: "num", render: (p) => vnd(p.amount) },
          ]}
        />
      </Panel>
    </>
  );
}

function PayPill({ status }: { status: unknown }) {
  const [l, t] = PAY_STATUS[str(status)] ?? [str(status), "info"];
  return <Pill tone={t}>{l}</Pill>;
}

function PaymentsTable({ start, end }: { start: string; end: string }) {
  const s = useUrlState({ preset: "month" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>();
  const filters = {
    startDate: new Date(`${start}T00:00:00+07:00`).toISOString(),
    endDate: new Date(`${end}T23:59:59.999+07:00`).toISOString(),
    status: s.value("status"),
    method: s.value("method"),
  };
  const query = { ...filters, page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "revenue", "payments", query],
    queryFn: ({ signal }) => api<Row[]>("GET /payments", { query, signal }),
    placeholderData: keepPreviousData,
  });
  async function exportCsv() {
    setExporting(true);
    setExportError(undefined);
    try {
      const all = await allPages<Row>("GET /payments", { query: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      const header = ["Ngày tạo", "Ngày thanh toán", "Mã giao dịch", "Người mua", "Email", "Loại", "Nội dung", "Phương thức", "Trạng thái", "Số tiền (VND)"];
      const lines = all.data.map((p) =>
        [
          dateTime(p.createdAt),
          dateTime(p.paidAt),
          str(p.transactionCode),
          str(get(p, "member.user.fullName")),
          str(get(p, "member.user.email")),
          paymentType(p),
          str(p.classNameSnapshot),
          METHOD[str(p.method)] ?? str(p.method),
          PAY_STATUS[str(p.status)]?.[0] ?? str(p.status),
          Number(p.amount ?? 0),
        ]
          .map(csvCell)
          .join(","),
      );
      const blob = new Blob(["﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `giao-dich_${start}_${end}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setExportError(e);
    } finally {
      setExporting(false);
    }
  }
  return (
    <Panel
      title="Giao dịch trong kỳ"

      actions={
        <button className="cr-btn" onClick={exportCsv} disabled={exporting}>
          <Download size={16} /> {exporting ? "Đang xuất…" : "Xuất CSV toàn bộ"}
        </button>
      }
    >
      <div className="cr-filters" style={{ marginBottom: 14 }}>
        <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(PAY_STATUS).map(([k, [l]]) => [k, l])} />
        <Select label="Phương thức" value={s.value("method")} onChange={(v) => s.set({ method: v })} options={Object.entries(METHOD)} />
      </div>
      {exportError ? <ErrorBox error={exportError} /> : null}
      <QueryView q={q}>
        {(res) => (
          <>
            <DataTable
              rows={res.data}
              columns={[
                { key: "c", title: "Tạo lúc", render: (p) => <span className="cr-mono">{dateTime(p.createdAt)}</span> },
                {
                  key: "m",
                  title: "Người mua",
                  render: (p) => (
                    <div className="cr-cell-main">
                      <strong>{str(get(p, "member.user.fullName")) || "—"}</strong>
                      <small>{str(get(p, "member.user.email"))}</small>
                    </div>
                  ),
                },
                {
                  key: "k",
                  title: "Loại",
                  render: (p) => (
                    <div className="cr-cell-main">
                      <span>{paymentType(p)}</span>
                      <small>{str(p.classNameSnapshot)}</small>
                    </div>
                  ),
                },
                { key: "me", title: "Phương thức", render: (p) => METHOD[str(p.method)] ?? str(p.method) },
                { key: "s", title: "Trạng thái", render: (p) => <PayPill status={p.status} /> },
                { key: "p", title: "Thanh toán lúc", render: (p) => <span className="cr-mono">{dateTime(p.paidAt)}</span> },
                { key: "a", title: "Số tiền", className: "num", render: (p) => vnd(p.amount) },
              ]}
            />
            <Pager meta={res.pagination} onPage={s.setPage} />
          </>
        )}
      </QueryView>
    </Panel>
  );
}
