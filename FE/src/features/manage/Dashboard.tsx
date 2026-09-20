import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Dumbbell,
  MoveUpRight,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../../shared/api";
import type { RecordData } from "../../shared/api";
import type {
  RevenueReportOk,
  MemberReportOk,
  EnrollmentReportOk,
  MembershipReportOk,
} from "../../shared/generated";
import { display, label, money } from "../../shared/config";
import { Empty, ErrorState, Loading } from "../../shared/ui";
function dateString(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
export function Dashboard({ reports = false }: { reports?: boolean }) {
  const today = dateString(new Date());
  const [startDate, setStart] = useState(today.slice(0, 7) + "-01");
  const [endDate, setEnd] = useState(today);
  const valid = Boolean(startDate && endDate && startDate <= endDate);
  const query = { startDate, endDate };
  const revenue = useQuery({
    queryKey: ["report", "revenue", query],
    queryFn: ({ signal }) =>
      api<RevenueReportOk["data"]>("GET /reports/revenue", { query, signal }),
    enabled: valid,
  });
  const members = useQuery({
    queryKey: ["report", "members", query],
    queryFn: ({ signal }) =>
      api<MemberReportOk["data"]>("GET /reports/members", { query, signal }),
    enabled: valid,
  });
  const enrollments = useQuery({
    queryKey: ["report", "enrollments", query],
    queryFn: ({ signal }) =>
      api<EnrollmentReportOk["data"]>("GET /reports/enrollments", {
        query,
        signal,
      }),
    enabled: valid,
  });
  const memberships = useQuery({
    queryKey: ["report", "memberships", query],
    queryFn: ({ signal }) =>
      api<MembershipReportOk["data"]>("GET /reports/memberships", {
        query,
        signal,
      }),
    enabled: valid,
  });
  const schedule = useQuery({
    queryKey: ["today-schedule", today],
    queryFn: ({ signal }) =>
      api<RecordData[]>("GET /class-schedules", {
        query: { date: today, limit: "5", page: "1" },
        signal,
      }),
    enabled: !reports,
  });
  const cards = [
    {
      title: "Doanh thu",
      icon: Wallet,
      q: revenue,
      value: revenue.data?.data.totalRevenue,
      money: true,
      sub: "Trong khoảng thời gian đã chọn",
    },
    {
      title: "Tổng hội viên",
      icon: Users,
      q: members,
      value: members.data?.data.totalMembers,
      sub: "Cộng đồng của trung tâm",
    },
    {
      title: "Lượt đăng ký lớp",
      icon: Dumbbell,
      q: enrollments,
      value: enrollments.data?.data.totalEnrollments,
      sub: "Trong khoảng thời gian đã chọn",
    },
    {
      title: "Gói đang hiệu lực",
      icon: CreditCard,
      q: memberships,
      value: memberships.data?.data.activeSubscriptions,
      sub: "Sẵn sàng cho buổi tập tiếp theo",
    },
  ];
  function exportCsv() {
    const rows = [["Báo cáo", "Chỉ tiêu", "Giá trị", "Từ ngày", "Đến ngày"]];
    for (const [name, q] of [
      ["Doanh thu", revenue],
      ["Hội viên", members],
      ["Đăng ký lớp", enrollments],
      ["Gói thành viên", memberships],
    ] as const) {
      if (q.data)
        for (const [k, v] of Object.entries(q.data.data)) {
          if (typeof v === "number")
            rows.push([name, label(k), String(v), startDate, endDate]);
          else if (v && typeof v === "object" && !Array.isArray(v))
            for (const [sub, n] of Object.entries(v))
              rows.push([name, label(sub), String(n), startDate, endDate]);
        }
    }
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((cell) => '"' + String(cell).replace(/"/g, '""') + '"')
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulse-reports-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {reports
              ? "HIỂU DỮ LIỆU. DẪN DẮT TĂNG TRƯỞNG."
              : "MỖI NGÀY LÀ MỘT BƯỚC TIẾN"}
          </div>
          <h1>
            {reports ? "Báo cáo & phân tích" : "Tổng quan trung tâm"}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {reports
              ? "Bức tranh hoạt động, được cập nhật từ dữ liệu thực."
              : "Chào ngày mới! Cùng giữ nhịp vận hành trung tâm."}
          </p>
        </div>
        <div className="date-label">
          <CalendarDays size={17} />
          {new Date().toLocaleDateString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      </div>
      {!reports && (
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span /> YOUR CENTER. YOUR PACE.
            </span>
            <h2>
              Vận hành nhịp nhàng.
              <br />
              <em>Bứt phá mỗi ngày.</em>
            </h2>
            <p>
              Tập trung vào điều quan trọng — con người,
              <br className="desktop-break" /> chuyển động và những trải nghiệm
              tốt hơn.
            </p>
            <Link className="button lime" to="/manager/schedules">
              Khám phá lịch hoạt động <ArrowUpRight size={19} />
            </Link>
          </div>
          <div className="track-art" aria-hidden="true">
            <div className="track t1" />
            <div className="track t2" />
            <div className="track t3" />
            <div className="track t4" />
            <div className="sport-symbol">
              <Dumbbell strokeWidth={1.3} />
            </div>
            <span className="track-text">
              KEEP
              <br />
              MOVING<span>↗</span>
            </span>
            <span className="track-number">01 / PULSE</span>
          </div>
        </section>
      )}
      <div className="section-heading">
        <h2>{reports ? "Hiệu quả hoạt động" : "Trung tâm trong tầm tay"}</h2>
        <div className="date-range">
          <label>
            Từ
            <input
              aria-label="Từ ngày"
              type="date"
              value={startDate}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Đến
            <input
              aria-label="Đến ngày"
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {reports && (
            <button
              className="button small"
              disabled={
                !valid || cards.some((c) => !c.q.isSuccess || c.q.isFetching)
              }
              onClick={exportCsv}
            >
              <ArrowDownToLine size={16} />
              Xuất CSV
            </button>
          )}
        </div>
      </div>
      {!valid ? (
        <ErrorState
          error={
            new Error(
              "Chọn khoảng ngày hợp lệ: ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
            )
          }
        />
      ) : (
        <>
          <div className="stats-grid">
            {cards.map(
              ({ title, icon: Icon, q, value, money: isMoney, sub }) => (
                <section className="stat-card" key={title}>
                  <div className="stat-top">
                    <span>{title}</span>
                    <span className="stat-icon">
                      <Icon size={19} />
                    </span>
                  </div>
                  {q.isPending ? (
                    <Loading variant="field" />
                  ) : q.isError ? (
                    <ErrorState error={q.error} retry={() => q.refetch()} />
                  ) : (
                    <>
                      <strong className="stat-value">
                        {value == null
                          ? "—"
                          : isMoney
                            ? money(value)
                            : value.toLocaleString("vi-VN")}
                      </strong>
                      <small>
                        <span className="mini-dot" />
                        {sub}
                      </small>
                    </>
                  )}
                </section>
              ),
            )}
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">DÒNG TIỀN</span>
                  <h2>Doanh thu theo phương thức</h2>
                </div>
                <Wallet size={20} />
              </div>
              {revenue.isPending ? (
                <Loading variant="chart" />
              ) : revenue.isError ? (
                <ErrorState
                  error={revenue.error}
                  retry={() => revenue.refetch()}
                />
              ) : (
                <div className="chart-body">
                  <strong className="chart-total">
                    {money(revenue.data.data.totalRevenue)}
                  </strong>
                  <p>Tổng doanh thu trong kỳ đã chọn</p>
                  <Bars values={revenue.data.data.revenueByMethod} currency />
                  <div className="chart-note">
                    <Activity size={15} />
                    Dữ liệu từ thanh toán tại trung tâm
                  </div>
                </div>
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CỘNG ĐỒNG</span>
                  <h2>Cơ cấu hội viên</h2>
                </div>
                <Users size={20} />
              </div>
              {members.isPending ? (
                <Loading variant="chart" />
              ) : members.isError ? (
                <ErrorState
                  error={members.error}
                  retry={() => members.refetch()}
                />
              ) : (
                <div className="chart-body">
                  <Bars values={members.data.data.membersByTier} />
                  <div className="member-mini">
                    <div>
                      <strong>{members.data.data.newMembers}</strong>
                      <span>Hội viên mới</span>
                    </div>
                    <div>
                      <strong>{members.data.data.activeMembers}</strong>
                      <span>Còn hiệu lực</span>
                    </div>
                    <div>
                      <strong>{members.data.data.expiredMembers}</strong>
                      <span>Hết hạn</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    {reports ? "SỨC HÚT LỚP HỌC" : "NHỊP SỐNG TRUNG TÂM"}
                  </span>
                  <h2>
                    {reports
                      ? "Lớp học được yêu thích"
                      : "Lịch hoạt động hôm nay"}
                  </h2>
                </div>
                <Link
                  className="text-link"
                  to={reports ? "/manager/classes" : "/manager/schedules"}
                >
                  Xem tất cả <MoveUpRight size={15} />
                </Link>
              </div>
              {reports ? (
                enrollments.isPending ? (
                  <Loading />
                ) : enrollments.isError ? (
                  <ErrorState
                    error={enrollments.error}
                    retry={() => enrollments.refetch()}
                  />
                ) : enrollments.data.data.topClasses.length ? (
                  <div className="chart-body">
                    {enrollments.data.data.topClasses.map((c, i) => (
                      <div className="ranking" key={c.classId}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <strong>{c.className}</strong>
                        <span className="badge">{c.count} lượt</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty text="Chưa có lượt đăng ký trong kỳ" />
                )
              ) : schedule.isPending ? (
                <Loading />
              ) : schedule.isError ? (
                <ErrorState
                  error={schedule.error}
                  retry={() => schedule.refetch()}
                />
              ) : schedule.data.data.length ? (
                <div className="schedule-list">
                  {schedule.data.data.map((s) => (
                    <div className="schedule-item" key={String(s.id)}>
                      <span className="schedule-icon">
                        <Dumbbell size={21} />
                      </span>
                      <div>
                        <strong>
                          {display((s.class as RecordData)?.name)}
                        </strong>
                        <p>
                          {display((s.room as RecordData)?.name)} ·{" "}
                          {display(s.startTime)}
                        </p>
                      </div>
                      <span className="badge">{display(s.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  text="Hôm nay chưa có lịch tập"
                  detail="Tạo lịch để bắt đầu một ngày đầy năng lượng."
                />
              )}
            </section>
            <section className="quick-panel">
              <span className="eyebrow">SẴN SÀNG CHO BƯỚC TIẾP THEO?</span>
              <h2>
                Ít thao tác hơn.
                <br />
                Nhiều chuyển động hơn.
              </h2>
              <p>
                Những công việc thường ngày,
                <br />
                chỉ cách bạn một chạm.
              </p>
              {[
                ["/manager/members", "Quản lý hội viên", Users],
                ["/manager/classes", "Tổ chức lớp học", Dumbbell],
                ["/manager/membership-plans", "Thiết lập gói tập", CreditCard],
              ].map(([to, title, Icon]) => {
                const I = Icon as typeof Users;
                return (
                  <Link key={String(to)} to={String(to)}>
                    <I size={18} />
                    <span>{String(title)}</span>
                    <ArrowUpRight size={18} />
                  </Link>
                );
              })}
            </section>
          </div>
          {reports && (
            <div className="dashboard-grid">
              {[
                [revenue, "Chi tiết thanh toán"],
                [enrollments, "Chi tiết đăng ký lớp"],
                [memberships, "Chi tiết gói thành viên"],
              ].map(([raw, title]) => {
                const q = raw as typeof revenue;
                return (
                  <section className="panel" key={String(title)}>
                    <div className="panel-heading">
                      <h2>{String(title)}</h2>
                    </div>
                    {q.isPending ? (
                    <Loading variant="field" />
                    ) : q.isError ? (
                      <ErrorState error={q.error} retry={() => q.refetch()} />
                    ) : (
                      <div className="chart-body">
                        {Object.entries(q.data!.data)
                          .filter(([, v]) => typeof v === "number")
                          .map(([k, v]) => (
                            <div className="report-line" key={k}>
                              <span>{label(k)}</span>
                              <strong>
                                {k === "totalRevenue" ? money(v) : display(v)}
                              </strong>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
function Bars({
  values,
  currency = false,
}: {
  values: Record<string, number>;
  currency?: boolean;
}) {
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  return total === 0 ? (
    <Empty
      text="Chưa có dữ liệu trong kỳ"
      detail="Thử chọn một khoảng thời gian khác."
    />
  ) : (
    <div className="bars">
      {Object.entries(values).map(([k, v], i) => (
        <div key={k}>
          <div className="bar-label">
            <span>
              <i className={"legend legend-" + i} />
              {label(k)}
            </span>
            <strong>{currency ? money(v) : v.toLocaleString("vi-VN")}</strong>
          </div>
          <div className="bar-track">
            <div
              className={"bar-fill fill-" + i}
              style={{ width: `${(100 * v) / total}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
