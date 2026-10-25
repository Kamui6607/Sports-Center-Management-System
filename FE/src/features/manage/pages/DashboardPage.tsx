import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, FileBarChart, Users, WalletCards } from "lucide-react";
import { api } from "../../../shared/api";
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
  vnd,
} from "../kit";
import type { Row } from "../kit";
import { addDays, fillRate, fmtCount, pct, seats, useCount, usePendingClasses, usePendingCv, useSessionsBetween, useTodaySessions } from "../opsQueries";
import { periodRange } from "./RevenuePage";
import { ScheduleDetailDialog } from "./scheduleKit";

const TZ = "Asia/Ho_Chi_Minh";
const PERIODS: [string, string][] = [
  ["month", "Tháng này"],
  ["30d", "30 ngày"],
  ["last-month", "Tháng trước"],
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

export default function DashboardPage({ user }: { user: ProfileOk["data"] }) {
  const s = useUrlState({ preset: "month" });
  const preset = s.value("preset");
  const [start, end] = periodRange(preset, "", "");
  const [selected, setSelected] = useState("");

  const revenue = useQuery({
    queryKey: ["admin", "ops", "revenue", start, end],
    queryFn: ({ signal }) => api<Row>("GET /reports/revenue", { query: { startDate: start, endDate: end }, signal }),
  });
  const membersActive = useCount("GET /users", { role: "MEMBER", isActive: "true" });
  const membersAll = useCount("GET /users", { role: "MEMBER" });
  const coachesActive = useCount("GET /users", { role: "COACH", isActive: "true" });
  const coachesAll = useCount("GET /users", { role: "COACH" });
  const today = useTodaySessions();
  const cvs = usePendingCv();

  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }));
  const greeting = hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const firstName = user.fullName.trim().split(/\s+/).pop() ?? user.fullName;

  const gross = Number(get(revenue.data, "data.totalRevenue") ?? 0);
  const net = Number(get(revenue.data, "data.netRevenue") ?? 0);
  const todayRows = today.data?.data ?? [];
  const todayLive = todayRows.filter((r) => r.status !== "CANCELLED");
  const fill = fillRate(todayRows);
  const cvCount = cvs.data?.pagination?.total ?? 0;

  return (
    <>
      <header className="cr-head">
        <div>
          <h1>
            {greeting}, {firstName}
          </h1>
          <p>Tổng quan hoạt động của phòng tập</p>
        </div>
        <div className="cr-head-actions">
          <span className="cr-chip" title="Kỳ áp dụng cho chỉ số doanh thu">
            <CalendarDays size={16} aria-hidden="true" />
            {dmy(start)} – {dmy(end)}
          </span>
          <div className="cr-seg" role="group" aria-label="Kỳ doanh thu">
            {PERIODS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={preset === v} onClick={() => s.set({ preset: v })}>
                {l}
              </button>
            ))}
          </div>
          <Link className="cr-btn soft" to="/manager/memberships"><WalletCards size={16} aria-hidden="true" /> Quét thẻ</Link><Link className="cr-btn" to={`/manager/revenue?preset=${preset}`}>
            <FileBarChart size={16} aria-hidden="true" /> Báo cáo & xuất CSV
          </Link>
        </div>
      </header>

      <div className="cr-kpis">
        <Link to={`/manager/revenue?preset=${preset}`} className="cr-kpi">
          <span className="cr-kpi-icon" aria-hidden="true">
            <WalletCards size={18} />
          </span>
          <div className="cr-kpi-label">Tiền thu · {PERIODS.find(([v]) => v === preset)?.[1].toLowerCase()}</div>
          <div className="cr-kpi-value">{revenue.isPending ? "…" : revenue.isError ? "—" : vnd(gross)}</div>
          <Meter value={revenue.data ? pct(net, gross) : null} label="Tỷ lệ thực nhận" />
          <div className="cr-kpi-note">
            {revenue.isError
              ? "Chưa tải được báo cáo doanh thu"
              : !revenue.data
                ? "Đang tải…"
                : gross
                  ? `Thực nhận ${vnd(net)} · ${pct(net, gross)}%`
                  : "Chưa có giao dịch thu trong kỳ"}
          </div>
        </Link>
        <Link to="/manager/users?role=MEMBER&isActive=true" className="cr-kpi">
          <span className="cr-kpi-icon" aria-hidden="true">
            <Users size={18} />
          </span>
          <div className="cr-kpi-label">Hội viên hoạt động</div>
          <div className="cr-kpi-value">{fmtCount(membersActive.data)}</div>
          <Meter value={pct(membersActive.data, membersAll.data)} label="Tỷ lệ tài khoản hội viên đang hoạt động" />
          <div className="cr-kpi-note">
            {membersAll.data != null ? `${pct(membersActive.data, membersAll.data) ?? 0}% trong ${num(membersAll.data)} tài khoản hội viên` : "Đang tải…"}
          </div>
        </Link>
        <Link to="/manager/schedules" className="cr-kpi">
          <span className="cr-kpi-icon" aria-hidden="true">
            <CalendarDays size={18} />
          </span>
          <div className="cr-kpi-label">Buổi học hôm nay</div>
          <div className="cr-kpi-value">{today.data ? num(todayLive.length) : today.isError ? "—" : "…"}</div>
          <Meter value={fill.pct} label="Tỷ lệ lấp đầy chỗ hôm nay" />
          <div className="cr-kpi-note">
            {today.data ? (fill.capacity ? `${num(fill.booked)}/${num(fill.capacity)} chỗ đã đặt · ${fill.pct}%` : "Không có buổi nào hôm nay") : "Đang tải…"}
          </div>
        </Link>
        <Link to="/manager/coaches" className={"cr-kpi" + (cvCount ? " attention" : "")}>
          <span className={"cr-kpi-icon" + (cvCount ? " warn" : "")} aria-hidden="true">
            <Dumbbell size={18} />
          </span>
          <div className="cr-kpi-label">HLV đang hoạt động</div>
          <div className="cr-kpi-value">{fmtCount(coachesActive.data)}</div>
          <Meter value={pct(coachesActive.data, coachesAll.data)} label="Tỷ lệ huấn luyện viên đang hoạt động" />
          <div className="cr-kpi-note">{cvs.data ? (cvCount ? `${num(cvCount)} hồ sơ CV đang chờ duyệt` : "Không có hồ sơ CV chờ duyệt") : "Đang tải…"}</div>
        </Link>
      </div>

      <div className="cr-grid-side stretch">
        <CashflowChart />
        <MonthCalendar onSelect={setSelected} />
      </div>

      {selected && <ScheduleDetailDialog id={selected} onClose={() => setSelected("")} />}
    </>
  );
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="cr-kpi-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0}>
      <i style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

// ── Dòng tiền 7 ngày: tiền thu theo ngày (GET /reports/revenue từng ngày), so với 7 ngày liền trước ──
function CashflowChart() {
  const [view, setView] = useState<"chart" | "table">("chart");
  const todayKey = vnDateKey(new Date());
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(todayKey, i - 13)), [todayKey]);
  const qs = useQueries({
    queries: days.map((d) => ({
      queryKey: ["admin", "ops", "revenue-day", d],
      queryFn: ({ signal }: { signal: AbortSignal }) => api<Row>("GET /reports/revenue", { query: { startDate: d, endDate: d }, signal }),
      staleTime: 5 * 60_000,
    })),
  });
  const pending = qs.some((q) => q.isPending);
  const failed = qs.find((q) => q.isError);
  const value = (i: number) => Number(get(qs[i].data, "data.totalRevenue") ?? 0);
  const prev = days.slice(0, 7).map((_, i) => value(i));
  const cur = days.slice(7).map((_, i) => value(i + 7));
  const sumCur = cur.reduce((a, b) => a + b, 0);
  const sumPrev = prev.reduce((a, b) => a + b, 0);
  const delta = sumPrev ? Math.round(((sumCur - sumPrev) / sumPrev) * 100) : null;
  const top = niceMax(Math.max(...cur, ...prev));

  return (
    <Panel
      title="Dòng tiền 7 ngày"
      desc="So với 7 ngày liền trước"
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
      {failed ? (
        <ErrorBox error={failed.error} retry={() => qs.forEach((q) => q.isError && void q.refetch())} />
      ) : pending ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <div className="cr-chart-sum">
            <div>
              <small>7 ngày qua</small>
              <strong>{vnd(sumCur)}</strong>
            </div>
            <div>
              <small>7 ngày trước</small>
              <strong style={{ color: "var(--text-2)" }}>{vnd(sumPrev)}</strong>
            </div>
            {delta != null && (
              <span className={"cr-delta" + (delta > 0 ? " up" : delta < 0 ? " down" : "")}>
                {delta > 0 ? "+" : ""}
                {delta}% so với kỳ trước
              </span>
            )}
            <div className="cr-legend" style={{ marginLeft: "auto", alignSelf: "end" }}>
              <span>
                <i className="cur" /> 7 ngày qua
              </span>
              <span>
                <i className="prev" /> 7 ngày trước
              </span>
            </div>
          </div>
          {view === "chart" ? (
            <div className="cr-chart">
              <div className="cr-chart-axis" aria-hidden="true">
                {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                  <span key={f}>{compactVnd(top * f)}</span>
                ))}
              </div>
              <div className="cr-chart-plot" style={{ ["--n" as string]: 7 }} role="list" aria-label="Tiền thu theo ngày">
                {cur.map((v, i) => {
                  const day = days[i + 7];
                  const before = days[i];
                  return (
                    <div
                      key={day}
                      className="cr-chart-col"
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${DOW[dowOf(day)]} ${dm(day)}: ${vnd(v)}; cùng thứ tuần trước ${dm(before)}: ${vnd(prev[i])}`}
                    >
                      <span className={"cr-chart-bar prev" + (prev[i] ? "" : " zero")} style={{ height: `${(prev[i] / top) * 100}%` }} />
                      <span className={"cr-chart-bar cur" + (v ? "" : " zero")} style={{ height: `${(v / top) * 100}%` }} />
                      <div className="cr-chart-tip" aria-hidden="true">
                        <b>
                          {DOW[dowOf(day)]}, {dm(day)}
                        </b>
                        <span>
                          <span>
                            <i style={{ background: "var(--chart-1)" }} /> Ngày này
                          </span>
                          {vnd(v)}
                        </span>
                        <span>
                          <span>
                            <i style={{ background: "var(--chart-2)" }} /> {dm(before)}
                          </span>
                          {vnd(prev[i])}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="cr-chart-x" style={{ ["--n" as string]: 7 }} aria-hidden="true">
                {cur.map((_, i) => {
                  const day = days[i + 7];
                  return (
                    <span key={day} className={day === todayKey ? "today" : ""}>
                      <b>{day === todayKey ? "Hôm nay" : DOW[dowOf(day)]}</b>
                      {dm(day)}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <DataTable
              label="Tiền thu theo ngày"
              rows={cur.map((v, i) => ({ id: days[i + 7], v, p: prev[i], before: days[i] }))}
              columns={[
                { key: "d", title: "Ngày", render: (r) => `${DOW[dowOf(str(r.id))]}, ${dmy(str(r.id))}` },
                { key: "v", title: "Tiền thu", className: "num", render: (r) => vnd(r.v) },
                { key: "p", title: "Cùng thứ tuần trước", className: "num", render: (r) => <span className="cr-muted">{vnd(r.p)}</span> },
              ]}
            />
          )}
        </>
      )}
    </Panel>
  );
}

// ── Lịch tháng + danh sách buổi trong ngày + hàng chờ duyệt ──
function MonthCalendar({ onSelect }: { onSelect: (id: string) => void }) {
  const todayKey = vnDateKey(new Date());
  const [month, setMonth] = useState(todayKey.slice(0, 7));
  const [day, setDay] = useState(todayKey);
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
    for (const k in map) map[k].sort((a, b) => str(a.startTime).localeCompare(str(b.startTime)));
    return map;
  }, [rows]);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    const key = d.toISOString().slice(0, 7);
    setMonth(key);
    setDay(todayKey.startsWith(key) ? todayKey : `${key}-01`);
  };
  const lead = dowOf(first);
  const monthLabel = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayRows = byDay[day] ?? [];
  const activeDays = Object.keys(byDay).length;

  return (
    <>
      <Panel
        title="Lịch học"
        desc="Theo ngày đã chọn"
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
                <span key={"l" + i} />
              ))}
              {Array.from({ length: daysIn }, (_, i) => {
                const key = addDays(first, i);
                const list = byDay[key] ?? [];
                const live = list.filter((r) => r.status !== "CANCELLED").length;
                const cancelled = list.length - live;
                return (
                  <button
                    key={key}
                    type="button"
                    className={"cr-cal-day" + (list.length ? " has" : "") + (key === todayKey ? " today" : "") + (cancelled ? " cancel" : "")}
                    aria-pressed={key === day}
                    aria-label={`${dmy(key)}: ${list.length ? `${live} buổi${cancelled ? `, ${cancelled} đã hủy` : ""}` : "không có buổi"}`}
                    onClick={() => setDay(key)}
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
              <span>{sessions.isPending ? "Đang tải lịch…" : `${num(rows.length)} buổi · ${num(activeDays)} ngày có lịch`}</span>
              <Link to="/manager/schedules" className="cr-crumb" style={{ margin: 0 }}>
                Lịch tuần <ArrowUpRight size={14} />
              </Link>
            </div>
          </>
        )}
      </Panel>

      <Panel
        flush
        title={day === todayKey ? "Buổi học hôm nay" : `Buổi học ${DOW[dowOf(day)]}, ${dmy(day)}`}
        desc={sessions.data ? `${num(dayRows.length)} buổi · ${(() => { const f = fillRate(dayRows); return f.capacity ? `lấp đầy ${f.pct}%` : "chưa có đăng ký"; })()}` : undefined}
        actions={
          day !== todayKey ? (
            <button
              className="cr-btn sm"
              onClick={() => {
                setMonth(todayKey.slice(0, 7));
                setDay(todayKey);
              }}
            >
              Về hôm nay
            </button>
          ) : undefined
        }
      >
        <QueryView q={sessions} rows={4}>
          {() => (
            <DataTable
              label="Danh sách buổi học trong ngày"
              rows={dayRows}
              empty={<EmptyState title="Không có buổi học" text="Lịch do HLV tạo trên ứng dụng sẽ hiển thị tại đây." />}
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
                  title: "Khóa học",
                  render: (r) => (
                    <div className="cr-cell-main">
                      <Link to={`/manager/classes/${str(get(r, "class.id") ?? r.classId)}`}>{str(get(r, "class.name"))}</Link>
                      <small>{str(get(r, "class.coach.user.fullName")) || "—"}</small>
                    </div>
                  ),
                },
                { key: "room", title: "Phòng", className: "nowrap", render: (r) => str(get(r, "room.name")) || "—" },
                {
                  key: "seat",
                  title: "Sĩ số",
                  render: (r) => {
                    const [b, c] = seats(r);
                    return <Ring value={b} total={c} label={`${b}/${c} chỗ`} />;
                  },
                },
                { key: "st", title: "Trạng thái", render: (r) => <SchedulePill status={r.status} /> },
                {
                  key: "act",
                  title: "",
                  className: "actions",
                  render: (r) => (
                    <RowAction label={`Chi tiết buổi ${str(get(r, "class.name"))}`} onClick={() => onSelect(str(r.id))}>
                      <ChevronRight size={16} />
                    </RowAction>
                  ),
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      <ActionQueue />
    </>
  );
}

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
      {(tab === "cv" ? (nCv ?? 0) > 5 : (nCls ?? 0) > 5) && (
        <Link className="cr-crumb" style={{ marginTop: 10 }} to={tab === "cv" ? "/manager/coaches?tab=cv" : "/manager/classes?status=PENDING"}>
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
                Đơn hàng đang xử lý: <b>{shop.data ? num(orders) : "…"}</b> · <Link to="/manager/orders">Xử lý đơn</Link>
              </span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
