import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import { DataTable, PageHead, Pager, Panel, Pill, QueryView, SchedulePill, Select, clock, dateTime, get, num, str, useUrlState, vnStartOf } from "../kit";
import type { Row } from "../kit";
import { useCoachOptions } from "./ClassesPage";
import { ScheduleDetailDialog, ScheduleLegend, WeekCalendar, WeekNav, addDays, mondayOf, todayKey, useWeekSchedules } from "./scheduleKit";

export default function SchedulesPage() {
  const s = useUrlState({ view: "week" });
  const [selected, setSelected] = useState("");
  const coaches = useCoachOptions();
  const rooms = useQuery({
    queryKey: ["admin", "rooms", "options"],
    queryFn: ({ signal }) => allPages<Row>("GET /rooms", { signal }),
    staleTime: 60_000,
  });
  const classes = useQuery({
    queryKey: ["admin", "classes", "options"],
    queryFn: ({ signal }) => allPages<Row>("GET /classes", { signal }),
    staleTime: 60_000,
  });
  const filters = { roomId: s.value("roomId"), coachId: s.value("coachId"), classId: s.value("classId"), status: s.value("status") };
  const view = s.value("view");
  const week = s.value("week") || mondayOf(todayKey());
  return (
    <>
      <PageHead
        eyebrow="Đào tạo · Thời khóa biểu"
        title="Lịch học"
        actions={
          <div className="cr-seg" role="group" aria-label="Kiểu hiển thị">
            <button aria-pressed={view === "week"} onClick={() => s.set({ view: "week" })}>
              Lịch tuần
            </button>
            <button aria-pressed={view === "table"} onClick={() => s.set({ view: "table" })}>
              Bảng
            </button>
          </div>
        }
      />
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <Select label="Phòng" value={filters.roomId} onChange={(v) => s.set({ roomId: v })} options={(rooms.data?.data ?? []).map((r) => [str(r.id), str(r.name)])} />
          <Select label="Huấn luyện viên" value={filters.coachId} onChange={(v) => s.set({ coachId: v })} options={coaches.data ?? []} />
          <Select label="Khóa học" value={filters.classId} onChange={(v) => s.set({ classId: v })} options={(classes.data?.data ?? []).map((c) => [str(c.id), str(c.name)])} />
          <Select
            label="Trạng thái"
            value={filters.status}
            onChange={(v) => s.set({ status: v })}
            options={[
              ["SCHEDULED", "Đã lên lịch"],
              ["COMPLETED", "Hoàn thành"],
              ["CANCELLED", "Đã hủy"],
            ]}
          />
          {view === "table" && (
            <>
              <label className="cr-field">
                <span>Từ ngày</span>
                <input type="date" value={s.value("fromDate")} onChange={(e) => s.set({ fromDate: e.target.value })} />
              </label>
              <label className="cr-field">
                <span>Đến ngày</span>
                <input type="date" value={s.value("toDate")} onChange={(e) => s.set({ toDate: e.target.value })} />
              </label>
            </>
          )}
        </div>
        {view === "week" ? (
          <WeekView week={week} filters={filters} onWeek={(w) => s.set({ week: w }, false)} onSelect={setSelected} />
        ) : (
          <TableView filters={filters} fromDate={s.value("fromDate")} toDate={s.value("toDate")} page={s.page} onPage={s.setPage} onSelect={setSelected} />
        )}
      </Panel>
      {selected && <ScheduleDetailDialog id={selected} onClose={() => setSelected("")} />}
    </>
  );
}

function WeekView({ week, filters, onWeek, onSelect }: { week: string; filters: Record<string, string>; onWeek: (w: string) => void; onSelect: (id: string) => void }) {
  const q = useWeekSchedules(week, filters);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <WeekNav week={week} onWeek={onWeek} />
        <ScheduleLegend />
      </div>
      <QueryView q={q}>
        {(res) => (
          <>
            <WeekCalendar week={week} rows={res.data} onSelect={onSelect} />
            <p className="cr-muted" style={{ margin: 0, fontSize: 12.5 }}>{num(res.data.length)} buổi trong tuần.</p>
          </>
        )}
      </QueryView>
    </div>
  );
}

function TableView({
  filters,
  fromDate,
  toDate,
  page,
  onPage,
  onSelect,
}: {
  filters: Record<string, string>;
  fromDate: string;
  toDate: string;
  page: number;
  onPage: (p: number) => void;
  onSelect: (id: string) => void;
}) {
  const query: Record<string, string> = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  if (fromDate) query.from = vnStartOf(fromDate).toISOString();
  if (toDate) query.to = vnStartOf(addDays(toDate, 1)).toISOString();
  query.page = String(page);
  query.limit = "20";
  const invalidRange = Boolean(fromDate && toDate && toDate < fromDate);
  const q = useQuery({
    queryKey: ["admin", "schedules", "table", query],
    queryFn: ({ signal }) => api<Row[]>("GET /class-schedules", { query, signal }),
    enabled: !invalidRange,
    placeholderData: keepPreviousData,
  });
  if (invalidRange) return <div className="cr-alert warn"><div>"Đến ngày" phải sau "Từ ngày".</div></div>;
  return (
    <QueryView q={q}>
      {(res) => (
        <>
          <DataTable
            rows={res.data}
            columns={[
              { key: "t", title: "Thời gian", render: (r) => <span className="cr-mono">{dateTime(r.startTime)}–{clock(r.endTime)}</span> },
              {
                key: "c",
                title: "Khóa học",
                render: (r) => (
                  <div className="cr-cell-main">
                    <Link to={`/manager/classes/${str(r.classId)}`}>{str(get(r, "class.name"))}</Link>
                    <small>{str(get(r, "class.coach.user.fullName"))}</small>
                  </div>
                ),
              },
              { key: "r", title: "Phòng", render: (r) => <Link to={`/manager/rooms/${str(r.roomId)}`}>{str(get(r, "room.name"))}</Link> },
              {
                key: "s",
                title: "Trạng thái",
                render: (r) => (
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <SchedulePill status={r.status} />
                    {r.makeupForId ? <Pill tone="warn">Dạy bù</Pill> : null}
                  </span>
                ),
              },
              { key: "b", title: "Giữ chỗ", className: "num", render: (r) => `${num(get(r, "_count.enrollments"))}/${num(get(r, "class.capacity"))}` },
              {
                key: "x",
                title: "",
                className: "actions",
                render: (r) => (
                  <button className="cr-btn sm" onClick={() => onSelect(str(r.id))}>
                    Chi tiết
                  </button>
                ),
              },
            ]}
          />
          <Pager meta={res.pagination} onPage={onPage} />
        </>
      )}
    </QueryView>
  );
}
