import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  FileBarChart,
  Users,
  WalletCards,
} from "lucide-react";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import type { ProfileOk } from "../../../shared/generated";
import {
  DataTable,
  EmptyState,
  ErrorBox,
  Panel,
  QueryView,
  Ring,
  RowAction,
  SchedulePill,
  Skeleton,
  clock,
  dateTime,
  get,
  num,
  str,
  useUrlState,
  vnDateKey,
  vnStartOf,
  vnd,
} from "../kit";
import type { Row } from "../kit";
import {
  addDays,
  fillRate,
  fmtCount,
  pct,
  seats,
  useCount,
  usePendingClasses,
  usePendingCv,
  useSessionsBetween,
} from "../opsQueries";
import { ScheduleDetailDialog } from "./scheduleKit";

const TZ = "Asia/Ho_Chi_Minh";

const PERIODS: [string, string][] = [
  ["today", "Hôm nay"],
  ["week", "Tuần này"],
  ["month", "Tháng này"],
  ["last-month", "Tháng trước"],
  ["custom", "Tùy chọn"],
];

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const dmy = (k: string) => k.split("-").reverse().join("/");
const dm = (k: string) => k.split("-").reverse().slice(0, 2).join("/");
const dowOf = (k: string) => (new Date(`${k}T12:00:00+07:00`).getUTCDay() + 6) % 7;

/** VND rút gọn cho trục biểu đồ. */
function compactVnd(v: number) {
  const f = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n);
  if (v >= 1e9) return `${f(v / 1e9)} tỷ`;
  if (v >= 1e6) return `${f(v / 1e6)} tr`;
  if (v >= 1e3) return `${f(v / 1e3)}k`;
  return f(v);
}

/** Mốc trên cùng của trục: số "tròn" ≥ max. */
function niceMax(v: number) {
  if (v <= 0) return 1_000_000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Tính khoảng ngày cho Dashboard, tối ưu để xem đủ lịch và doanh thu trong kỳ. */
export function calcDashboardRange(preset: string, from: string, to: string): [string, string] {
  const today = vnDateKey(new Date());
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();

  switch (preset) {
    case "today":
      return [today, today];
    case "week": {
      const dow = dowOf(today); // 0 = T2, ..., 6 = CN
      const monday = addDays(today, -dow);
      return [monday, addDays(monday, 6)]; // Từ Thứ 2 đến Chủ nhật tuần này
    }
    case "last-month": {
      const yy = m === 1 ? y - 1 : y;
      const mm = m === 1 ? 12 : m - 1;
      return [`${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`];
    }
    case "custom":
      return [from || today, to || today];
    case "month":
    default: {
      // Trọn vẹn tháng hiện tại để xem đầy đủ lịch học và sự kiện trong tháng
      return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(lastDay(y, m))}`];
    }
  }
}

export default function DashboardPage({ user }: { user: ProfileOk["data"] }) {
  const s = useUrlState({ preset: "month", from: "", to: "" });
  const preset = s.value("preset") || "month";
  const [start, end] = calcDashboardRange(preset, s.value("from"), s.value("to"));
  const invalidRange = preset === "custom" && end < start;

  const todayKey = vnDateKey(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  // Đồng bộ ngày được chọn khi kỳ lọc thay đổi
  useEffect(() => {
    if (invalidRange) return;
    if (todayKey >= start && todayKey <= end) {
      setSelectedDay(todayKey);
    } else {
      setSelectedDay(start);
    }
  }, [start, end, invalidRange, todayKey]);

  // ── Queries theo kỳ lọc ──
  const revenue = useQuery({
    queryKey: ["admin", "ops", "revenue", start, end],
    queryFn: ({ signal }) =>
      api<Row>("GET /reports/revenue", { query: { startDate: start, endDate: end }, signal }),
    enabled: !invalidRange,
  });

  const memberReport = useQuery({
    queryKey: ["admin", "ops", "members-report", start, end],
    queryFn: ({ signal }) =>
      api<Row>("GET /reports/members", { query: { startDate: start, endDate: end }, signal }),
    enabled: !invalidRange,
  });

  const periodSessionsQuery = useSessionsBetween(start, addDays(end, 1));

  const membersActive = useCount("GET /users", { role: "MEMBER", isActive: "true" });
  const membersAll = useCount("GET /users", { role: "MEMBER" });
  const coachesActive = useCount("GET /users", { role: "COACH", isActive: "true" });
  const coachesAll = useCount("GET /users", { role: "COACH" });
  const cvs = usePendingCv();
  const classes = usePendingClasses();

  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }));
  const greeting = hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const firstName = user.fullName.trim().split(/\s+/).pop() ?? user.fullName;

  // Số liệu tổng hợp
  const gross = Number(get(revenue.data, "data.totalRevenue") ?? 0);
  const net = Number(get(revenue.data, "data.netRevenue") ?? 0);
  const successPayments = Number(get(revenue.data, "data.successPayments") ?? 0);

  const periodRows = periodSessionsQuery.data?.data ?? [];
  const periodLive = periodRows.filter((r) => r.status !== "CANCELLED");
  const fill = fillRate(periodRows);

  const cvCount = cvs.data?.pagination?.total ?? 0;
  const clsCount = classes.data?.pagination?.total ?? 0;
  const newMembers = Number(get(memberReport.data, "data.newMembers") ?? 0);

  const activePeriodLabel = PERIODS.find(([v]) => v === preset)?.[1] ?? "Tùy chọn";

  return (
    <div className="cr-dash-stack">
      <header className="cr-head">
        <div>
          <h1>
            {greeting}, {firstName}
          </h1>
          <p>Tổng quan hoạt động và vận hành của trung tâm thể thao</p>
        </div>
      </header>

      <div className="cr-dash-toolbar">
        <div className="cr-dash-filters-left">
          <div className="cr-seg" role="group" aria-label="Kỳ lọc số liệu">
            {PERIODS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={preset === v}
                onClick={() => {
                  if (v === "custom") {
                    s.set({ preset: v, from: start, to: end });
                  } else {
                    s.set({ preset: v, from: "", to: "" });
                  }
                }}
              >
                {l}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="cr-custom-range-bar">
              <label className="cr-date-field-inline">
                <span>Từ:</span>
                <input
                  type="date"
                  value={s.value("from") || start}
                  max={s.value("to") || end}
                  onChange={(e) => s.set({ from: e.target.value })}
                />
              </label>
              <label className="cr-date-field-inline">
                <span>Đến:</span>
                <input
                  type="date"
                  value={s.value("to") || end}
                  min={s.value("from") || start}
                  onChange={(e) => s.set({ to: e.target.value })}
                />
              </label>
            </div>
          )}

          <span className="cr-chip" title="Khoảng thời gian áp dụng báo cáo">
            <CalendarDays size={16} aria-hidden="true" />
            {start === end ? dmy(start) : `${dmy(start)} – ${dmy(end)}`}
          </span>
        </div>

        <div className="cr-dash-actions-right">
          <Link className="cr-btn soft" to="/manager/memberships">
            <WalletCards size={16} aria-hidden="true" /> Quét thẻ
          </Link>
          <Link
            className="cr-btn"
            to={`/manager/revenue?preset=${preset}${preset === "custom" ? `&from=${start}&to=${end}` : ""}`}
          >
            <FileBarChart size={16} aria-hidden="true" /> Báo cáo & xuất CSV
          </Link>
        </div>
      </div>

      {invalidRange && (
        <div className="cr-alert warn">
          <AlertCircle size={18} />
          <div>"Đến ngày" phải sau hoặc bằng "Từ ngày". Vui lòng chọn lại khoảng thời gian hợp lệ.</div>
        </div>
      )}

      {/* ── 4 Card KPI đồng bộ theo khoảng thời gian ── */}
      <div className="cr-kpis">
        {/* Card 1: Doanh thu / Tiền thu */}
        <Link
          to={`/manager/revenue?preset=${preset}${preset === "custom" ? `&from=${start}&to=${end}` : ""}`}
          className="cr-kpi"
        >
          <span className="cr-kpi-icon" aria-hidden="true">
            <WalletCards size={18} />
          </span>
          <div className="cr-kpi-label">Tiền thu · {activePeriodLabel.toLowerCase()}</div>
          <div className="cr-kpi-value">
            {revenue.isPending ? "…" : revenue.isError ? "—" : vnd(gross)}
          </div>
          <Meter value={revenue.data ? pct(net, gross) : null} label="Tỷ lệ thực nhận" />
          <div className="cr-kpi-note">
            {revenue.isError
              ? "Chưa tải được báo cáo doanh thu"
              : revenue.isPending
              ? "Đang tải…"
              : gross
              ? `Thực nhận ${vnd(net)} · ${pct(net, gross)}% (${num(successPayments)} giao dịch)`
              : "Chưa có giao dịch thu trong kỳ"}
          </div>
        </Link>

        {/* Card 2: Hội viên */}
        <Link to="/manager/users?role=MEMBER&isActive=true" className="cr-kpi">
          <span className="cr-kpi-icon" aria-hidden="true">
            <Users size={18} />
          </span>
          <div className="cr-kpi-label">Hội viên hoạt động</div>
          <div className="cr-kpi-value">{fmtCount(membersActive.data)}</div>
          <Meter value={pct(membersActive.data, membersAll.data)} label="Tỷ lệ tài khoản hội viên đang hoạt động" />
          <div className="cr-kpi-note">
            {memberReport.isPending
              ? "Đang tải…"
              : `+${num(newMembers)} đăng ký mới trong kỳ · ${pct(membersActive.data, membersAll.data) ?? 0}% trên ${num(
                  membersAll.data
                )} hội viên`}
          </div>
        </Link>

        {/* Card 3: Buổi học theo kỳ */}
        <Link to="/manager/schedules" className="cr-kpi">
          <span className="cr-kpi-icon" aria-hidden="true">
            <CalendarDays size={18} />
          </span>
          <div className="cr-kpi-label">Buổi học · {activePeriodLabel.toLowerCase()}</div>
          <div className="cr-kpi-value">
            {periodSessionsQuery.isPending ? "…" : periodSessionsQuery.isError ? "—" : num(periodLive.length)}
          </div>
          <Meter value={fill.pct} label="Tỷ lệ lấp đầy chỗ trong kỳ" />
          <div className="cr-kpi-note">
            {periodSessionsQuery.isPending
              ? "Đang tải…"
              : fill.capacity
              ? `${num(fill.booked)}/${num(fill.capacity)} chỗ đã đặt · ${fill.pct}% lấp đầy`
              : "Không có buổi học nào trong kỳ"}
          </div>
        </Link>

        {/* Card 4: Huấn luyện viên & Vận hành */}
        <Link to="/manager/coaches" className={"cr-kpi" + (cvCount || clsCount ? " attention" : "")}>
          <span className={"cr-kpi-icon" + (cvCount || clsCount ? " warn" : "")} aria-hidden="true">
            <Dumbbell size={18} />
          </span>
          <div className="cr-kpi-label">HLV đang hoạt động</div>
          <div className="cr-kpi-value">{fmtCount(coachesActive.data)}</div>
          <Meter value={pct(coachesActive.data, coachesAll.data)} label="Tỷ lệ huấn luyện viên đang hoạt động" />
          <div className="cr-kpi-note">
            {cvCount || clsCount
              ? `${num(cvCount)} CV chờ duyệt · ${num(clsCount)} khóa chờ duyệt`
              : "Không có hồ sơ chờ duyệt"}
          </div>
        </Link>
      </div>

      {/* ── Hàng 1: Biểu đồ Dòng tiền (trái) + Cần xử lý (phải) ── */}
      <div className="cr-dash-row">
        <CashflowChart start={start} end={end} presetLabel={activePeriodLabel} />
        <ActionQueue />
      </div>

      {/* ── Hàng 2: Lịch học (trái) + Danh sách buổi học (phải) ── */}
      <div className="cr-dash-row reverse">
        <MonthCalendar
          initialMonth={start.slice(0, 7)}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
        <DaySessionsPanel
          selectedDay={selectedDay}
          onSelectSession={setSelectedSessionId}
          onResetToday={() => setSelectedDay(todayKey)}
        />
      </div>

      {selectedSessionId && (
        <ScheduleDetailDialog id={selectedSessionId} onClose={() => setSelectedSessionId("")} />
      )}
    </div>
  );
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="cr-kpi-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0}>
      <i style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

// ── Dòng tiền theo khoảng thời gian đã lọc (Biểu đồ + Bảng) ──
function CashflowChart({
  start,
  end,
  presetLabel,
}: {
  start: string;
  end: string;
  presetLabel: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  // Query tất cả giao dịch thanh toán thành công trong kỳ
  const payments = useQuery({
    queryKey: ["admin", "ops", "cashflow-payments", start, end],
    queryFn: ({ signal }) =>
      allPages<Row>("GET /payments", {
        query: {
          startDate: vnStartOf(start).toISOString(),
          endDate: new Date(`${end}T23:59:59.999+07:00`).toISOString(),
          status: "SUCCESS",
        },
        signal,
      }),
    staleTime: 60_000,
  });

  // Tạo danh sách các ngày trong kỳ
  const dayKeys = useMemo(() => {
    if (end < start) return [];
    const arr: string[] = [];
    let cur = start;
    let limit = 0;
    while (cur <= end && limit < 100) {
      arr.push(cur);
      cur = addDays(cur, 1);
      limit++;
    }
    return arr;
  }, [start, end]);

  // Gom nhóm dữ liệu thanh toán theo từng ngày
  const { dayData, totalSum, totalTx, peakDay, peakAmount, avgPerDay } = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    for (const d of dayKeys) map[d] = { amount: 0, count: 0 };

    const rows = payments.data?.data ?? [];
    for (const p of rows) {
      const dKey = vnDateKey(new Date(str(p.paidAt || p.createdAt)));
      if (map[dKey]) {
        map[dKey].amount += Number(p.amount ?? 0);
        map[dKey].count += 1;
      }
    }

    let sum = 0;
    let tx = 0;
    let pDay = dayKeys[0] ?? "";
    let pAmt = 0;

    for (const d of dayKeys) {
      const amt = map[d]?.amount ?? 0;
      const c = map[d]?.count ?? 0;
      sum += amt;
      tx += c;
      if (amt >= pAmt) {
        pAmt = amt;
        pDay = d;
      }
    }

    return {
      dayData: dayKeys.map((d) => ({
        date: d,
        amount: map[d]?.amount ?? 0,
        count: map[d]?.count ?? 0,
      })),
      totalSum: sum,
      totalTx: tx,
      peakDay: pDay,
      peakAmount: pAmt,
      avgPerDay: dayKeys.length ? Math.round(sum / dayKeys.length) : 0,
    };
  }, [dayKeys, payments.data]);

  const top = niceMax(peakAmount);
  const todayKey = vnDateKey(new Date());

  return (
    <Panel
      title={`Dòng tiền ${presetLabel.toLowerCase()}`}
      desc={
        start === end
          ? `Ngày ${dmy(start)}`
          : `Từ ${dmy(start)} đến ${dmy(end)} (${num(dayKeys.length)} ngày)`
      }
      actions={
        <div className="cr-seg" role="group" aria-label="Kiểu hiển thị">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
            Biểu đồ
          </button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
            Bảng
          </button>
        </div>
      }
    >
      {payments.isError ? (
        <ErrorBox error={payments.error} retry={() => void payments.refetch()} />
      ) : payments.isPending ? (
        <Skeleton rows={6} />
      ) : (
        <>
          {/* Hàng chỉ số nhanh */}
          <div className="cr-chart-substats">
            <div className="cr-chart-substats-item">
              <small>Tổng thu trong kỳ</small>
              <strong>{vnd(totalSum)}</strong>
            </div>
            <div className="cr-chart-substats-item">
              <small>Bình quân/ngày</small>
              <strong style={{ color: "var(--text-2)" }}>{vnd(avgPerDay)}</strong>
            </div>
            {peakAmount > 0 && (
              <div className="cr-chart-substats-item">
                <small>Đỉnh doanh thu ({dm(peakDay)})</small>
                <strong style={{ color: "var(--primary)" }}>{vnd(peakAmount)}</strong>
              </div>
            )}
            <div className="cr-chart-substats-item" style={{ marginLeft: "auto" }}>
              <small>Giao dịch</small>
              <strong>{num(totalTx)} đơn</strong>
            </div>
          </div>

          {view === "chart" ? (
            <div className="cr-chart">
              <div className="cr-chart-axis" aria-hidden="true">
                {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                  <span key={f}>{compactVnd(top * f)}</span>
                ))}
              </div>

              <div
                className="cr-chart-plot"
                style={{ ["--n" as string]: Math.max(1, dayData.length) }}
                role="list"
                aria-label={`Biểu đồ dòng tiền ${presetLabel}`}
              >
                {dayData.map((item) => {
                  const pctHeight = top > 0 ? (item.amount / top) * 100 : 0;
                  const isToday = item.date === todayKey;
                  return (
                    <div
                      key={item.date}
                      className="cr-chart-col"
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${DOW[dowOf(item.date)]} ${dmy(item.date)}: ${vnd(item.amount)} (${item.count} giao dịch)`}
                    >
                      <span
                        className={"cr-chart-bar cur" + (item.amount ? "" : " zero")}
                        style={{
                          height: `${Math.max(2, pctHeight)}%`,
                          background: isToday ? "var(--primary)" : "var(--chart-1)",
                        }}
                      />
                      <div className="cr-chart-tip" aria-hidden="true">
                        <b>
                          {DOW[dowOf(item.date)]}, {dmy(item.date)} {isToday ? "(Hôm nay)" : ""}
                        </b>
                        <span>
                          <span>
                            <i style={{ background: isToday ? "var(--primary)" : "var(--chart-1)" }} /> Tiền thu:
                          </span>
                          <b>{vnd(item.amount)}</b>
                        </span>
                        <span>
                          <span>Số giao dịch:</span>
                          <b>{num(item.count)} đơn</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="cr-chart-x"
                style={{ ["--n" as string]: Math.max(1, dayData.length) }}
                aria-hidden="true"
              >
                {dayData.map((item, idx) => {
                  const isToday = item.date === todayKey;
                  // Nếu nhiều hơn 12 ngày thì hiển thị các mốc chính để tránh đè chữ
                  const showLabel =
                    dayData.length <= 12 ||
                    idx === 0 ||
                    idx === dayData.length - 1 ||
                    idx % Math.ceil(dayData.length / 7) === 0 ||
                    isToday;

                  return (
                    <span key={item.date} className={isToday ? "today" : ""}>
                      {showLabel ? (
                        <>
                          <b>{isToday ? "Hôm nay" : DOW[dowOf(item.date)]}</b>
                          {dm(item.date)}
                        </>
                      ) : (
                        <span>·</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="cr-table-scroll-wrap">
              <DataTable
                label="Bảng tiền thu theo ngày"
                rows={dayData.map((item) => ({
                  id: item.date,
                  amount: item.amount,
                  count: item.count,
                  pctOfTotal: totalSum ? pct(item.amount, totalSum) : 0,
                }))}
                columns={[
                  {
                    key: "d",
                    title: "Ngày",
                    render: (r) => (
                      <span className={str(r.id) === todayKey ? "cr-time" : ""}>
                        {DOW[dowOf(str(r.id))]}, {dmy(str(r.id))} {str(r.id) === todayKey && "(Hôm nay)"}
                      </span>
                    ),
                  },
                  {
                    key: "cnt",
                    title: "Giao dịch",
                    className: "num",
                    render: (r) => num(r.count),
                  },
                  {
                    key: "v",
                    title: "Tiền thu",
                    className: "num",
                    render: (r) => <b>{vnd(r.amount)}</b>,
                  },
                  {
                    key: "pct",
                    title: "Tỷ trọng",
                    className: "num",
                    render: (r) => <span className="cr-muted">{r.pctOfTotal}%</span>,
                  },
                ]}
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Lịch học theo tháng đồng bộ ──
function MonthCalendar({
  initialMonth,
  selectedDay,
  onSelectDay,
}: {
  initialMonth: string;
  selectedDay: string;
  onSelectDay: (day: string) => void;
}) {
  const todayKey = vnDateKey(new Date());
  const [month, setMonth] = useState(initialMonth || todayKey.slice(0, 7));

  // Tự động chuyển tháng khi kỳ lọc ở trên thay đổi
  useEffect(() => {
    if (initialMonth && initialMonth !== month) {
      setMonth(initialMonth);
    }
  }, [initialMonth]);

  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const next = addDays(first, daysIn);

  const sessions = useSessionsBetween(first, next);
  const rows = sessions.data?.data ?? [];

  const byDay = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const r of rows) {
      const k = vnDateKey(new Date(str(r.startTime)));
      (map[k] ??= []).push(r);
    }
    for (const k in map) {
      map[k].sort((a, b) => str(a.startTime).localeCompare(str(b.startTime)));
    }
    return map;
  }, [rows]);

  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    const key = d.toISOString().slice(0, 7);
    setMonth(key);
    onSelectDay(todayKey.startsWith(key) ? todayKey : `${key}-01`);
  };

  const lead = dowOf(first);
  const monthLabel = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const activeDays = Object.keys(byDay).length;

  return (
    <Panel
      title="Lịch học"
      desc={`Tháng ${m}/${y} · ${num(rows.length)} buổi`}
      actions={
        <div className="cr-cal-head">
          <button className="cr-icon-btn" onClick={() => shift(-1)} aria-label="Tháng trước">
            <ChevronLeft size={16} />
          </button>
          <strong>{monthLabel.replace(/^./, (c) => c.toUpperCase())}</strong>
          <button className="cr-icon-btn" onClick={() => shift(1)} aria-label="Tháng sau">
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      {sessions.isError ? (
        <ErrorBox error={sessions.error} retry={() => void sessions.refetch()} />
      ) : (
        <>
          <div className="cr-cal" role="group" aria-label={`Lịch ${monthLabel}`} aria-busy={sessions.isPending}>
            {DOW.map((d) => (
              <span key={d} className="cr-cal-dow" aria-hidden="true">
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={"lead-" + i} />
            ))}
            {Array.from({ length: daysIn }, (_, i) => {
              const key = addDays(first, i);
              const list = byDay[key] ?? [];
              const live = list.filter((r) => r.status !== "CANCELLED").length;
              const cancelled = list.length - live;
              const isSelected = key === selectedDay;
              const isToday = key === todayKey;

              return (
                <button
                  key={key}
                  type="button"
                  className={
                    "cr-cal-day" +
                    (list.length ? " has" : "") +
                    (isToday ? " today" : "") +
                    (cancelled ? " cancel" : "")
                  }
                  aria-pressed={isSelected}
                  aria-label={`${dmy(key)}: ${
                    list.length ? `${live} buổi${cancelled ? `, ${cancelled} đã hủy` : ""}` : "không có buổi"
                  }`}
                  onClick={() => onSelectDay(key)}
                >
                  <span>{i + 1}</span>
                  {list.length > 0 && (
                    <i aria-hidden="true">
                      {Array.from({ length: Math.min(3, list.length) }, (_, j) => (
                        <b key={j} />
                      ))}
                    </i>
                  )}
                </button>
              );
            })}
          </div>

          <div className="cr-cal-foot">
            <span>
              {sessions.isPending
                ? "Đang tải lịch…"
                : `${num(rows.length)} buổi học · ${num(activeDays)} ngày có lịch`}
            </span>
            <Link to="/manager/schedules" className="cr-crumb" style={{ margin: 0 }}>
              Xem lịch tuần <ArrowUpRight size={14} />
            </Link>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Danh sách buổi học trong ngày (Cuộn mượt, chống tràn trang) ──
function DaySessionsPanel({
  selectedDay,
  onSelectSession,
  onResetToday,
}: {
  selectedDay: string;
  onSelectSession: (id: string) => void;
  onResetToday: () => void;
}) {
  const todayKey = vnDateKey(new Date());
  const sessions = useSessionsBetween(selectedDay, addDays(selectedDay, 1));
  const dayRows = sessions.data?.data ?? [];
  const fill = fillRate(dayRows);

  const isToday = selectedDay === todayKey;
  const title = isToday ? "Buổi học hôm nay" : `Buổi học ${DOW[dowOf(selectedDay)]}, ${dmy(selectedDay)}`;

  return (
    <Panel
      flush
      title={title}
      desc={
        sessions.data
          ? `${num(dayRows.length)} buổi · ${
              fill.capacity ? `lấp đầy ${fill.pct}% (${num(fill.booked)}/${num(fill.capacity)} chỗ)` : "chưa có đăng ký"
            }`
          : undefined
      }
      actions={
        !isToday ? (
          <button className="cr-btn sm" onClick={onResetToday}>
            Về hôm nay
          </button>
        ) : undefined
      }
    >
      <QueryView q={sessions} rows={4}>
        {() => (
          <div className="cr-table-scroll-wrap">
            <DataTable
              label="Danh sách buổi học trong ngày"
              rows={dayRows}
              empty={
                <EmptyState
                  title="Không có buổi học"
                  text="Không có lịch học nào được sắp xếp trong ngày này."
                />
              }
              columns={[
                {
                  key: "time",
                  title: "Thời gian",
                  render: (r) => (
                    <span className="cr-time">
                      {clock(r.startTime)}
                      <small>đến {clock(r.endTime)}</small>
                    </span>
                  ),
                },
                {
                  key: "class",
                  title: "Khóa học & HLV",
                  render: (r) => (
                    <div className="cr-cell-main">
                      <Link to={`/manager/classes/${str(get(r, "class.id") ?? r.classId)}`}>
                        {str(get(r, "class.name"))}
                      </Link>
                      <small>{str(get(r, "class.coach.user.fullName")) || "—"}</small>
                    </div>
                  ),
                },
                {
                  key: "room",
                  title: "Phòng",
                  className: "nowrap",
                  render: (r) => str(get(r, "room.name")) || "—",
                },
                {
                  key: "seat",
                  title: "Sĩ số",
                  render: (r) => {
                    const [b, c] = seats(r);
                    return <Ring value={b} total={c} label={`${b}/${c} chỗ`} />;
                  },
                },
                {
                  key: "st",
                  title: "Trạng thái",
                  render: (r) => <SchedulePill status={r.status} />,
                },
                {
                  key: "act",
                  title: "",
                  className: "actions",
                  render: (r) => (
                    <RowAction
                      label={`Chi tiết buổi ${str(get(r, "class.name"))}`}
                      onClick={() => onSelectSession(str(r.id))}
                    >
                      <ChevronRight size={16} />
                    </RowAction>
                  ),
                },
              ]}
            />
          </div>
        )}
      </QueryView>
    </Panel>
  );
}

// ── Hàng chờ xử lý (Action Queue) ──
function ActionQueue() {
  const [tab, setTab] = useState<"cv" | "class">("cv");
  const cvs = usePendingCv();
  const classes = usePendingClasses();
  const shop = useQuery({
    queryKey: ["admin", "ops", "shop"],
    queryFn: ({ signal }) => api<Row>("GET /shop/manage/summary", { signal }),
    staleTime: 60_000,
  });

  const nCv = cvs.data?.pagination?.total;
  const nCls = classes.data?.pagination?.total;
  const low = Number(get(shop.data, "data.lowStockProducts") ?? 0);
  const orders = Number(get(shop.data, "data.needsAction") ?? 0);

  return (
    <Panel
      title="Cần xử lý"
      desc="Hồ sơ và khóa học đang chờ duyệt"
      actions={
        <div className="cr-seg" role="tablist" aria-label="Hàng chờ">
          <button role="tab" aria-selected={tab === "cv"} onClick={() => setTab("cv")}>
            Hồ sơ HLV {nCv != null && `(${num(nCv)})`}
          </button>
          <button role="tab" aria-selected={tab === "class"} onClick={() => setTab("class")}>
            Khóa học {nCls != null && `(${num(nCls)})`}
          </button>
        </div>
      }
    >
      <div className="cr-queue-list-scroll">
        {tab === "cv" ? (
          <QueryView q={cvs} rows={3}>
            {(res) =>
              res.data.length ? (
                <ul className="cr-list">
                  {res.data.map((p) => (
                    <li key={str(p.id)}>
                      <div className="cr-cell-media">
                        <span className="cr-avatar" aria-hidden="true">
                          {str(get(p, "user.fullName")).trim().slice(0, 1).toUpperCase()}
                        </span>
                        <div className="cr-cell-main" style={{ minWidth: 0 }}>
                          <strong>{str(get(p, "user.fullName"))}</strong>
                          <small>Nộp {dateTime(get(p, "certification.submittedAt"))}</small>
                        </div>
                      </div>
                      <Link className="cr-btn sm primary" to={`/manager/coaches/${str(get(p, "user.id"))}#cv`}>
                        Xem & duyệt
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Không có hồ sơ chờ duyệt" text="Hồ sơ CV mới của HLV sẽ xuất hiện tại đây." />
              )
            }
          </QueryView>
        ) : (
          <QueryView q={classes} rows={3}>
            {(res) =>
              res.data.length ? (
                <ul className="cr-list">
                  {res.data.map((c) => (
                    <li key={str(c.id)}>
                      <div className="cr-cell-main" style={{ minWidth: 0 }}>
                        <strong>{str(c.name)}</strong>
                        <small>
                          {str(get(c, "coach.user.fullName"))} · {vnd(c.price)}
                        </small>
                      </div>
                      <Link className="cr-btn sm primary" to={`/manager/classes/${str(c.id)}`}>
                        Xem & duyệt
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Không có khóa chờ duyệt" text="Khóa học HLV gửi lên từ ứng dụng sẽ xuất hiện tại đây." />
              )
            }
          </QueryView>
        )}
      </div>

      {(tab === "cv" ? (nCv ?? 0) > 5 : (nCls ?? 0) > 5) && (
        <Link
          className="cr-crumb"
          style={{ marginTop: 10 }}
          to={tab === "cv" ? "/manager/coaches?tab=cv" : "/manager/classes?status=PENDING"}
        >
          Xem tất cả <ArrowUpRight size={14} />
        </Link>
      )}

      <div className="cr-queue-foot">
        {shop.isError ? (
          <span className="cr-note">Chưa tải được tình trạng cửa hàng.</span>
        ) : (
          <>
            <div className="cr-queue-row">
              <span>
                Sản phẩm sắp hết hàng: <b>{shop.data ? num(low) : "…"}</b>
              </span>
              <Link to="/manager/products">Kiểm kho</Link>
            </div>
            <div className="cr-queue-row">
              <span>
                Đơn hàng đang xử lý: <b>{shop.data ? num(orders) : "…"}</b> ·{" "}
                <Link to="/manager/orders">Xử lý đơn</Link>
              </span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
