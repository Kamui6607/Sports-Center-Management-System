import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import { DataTable, Dialog, Dl, Pill, QueryView, SchedulePill, clock, dateTime, get, num, str, vnDateKey, vnStartOf } from "../kit";
import type { Row } from "../kit";

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

/** Thứ 2 (giờ VN) của tuần chứa `key` (YYYY-MM-DD). */
export function mondayOf(key: string) {
  const d = new Date(`${key}T12:00:00+07:00`);
  const iso = (d.getUTCDay() + 6) % 7;
  return addDays(key, -iso);
}
export function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const todayKey = () => vnDateKey(new Date());

/** Mọi buổi giao với tuần [Thứ 2 00:00, Thứ 2 tuần sau 00:00) giờ VN — tải đủ mọi trang. */
export function useWeekSchedules(week: string, filters: Record<string, string>) {
  const from = vnStartOf(week).toISOString();
  const to = vnStartOf(addDays(week, 7)).toISOString();
  const query = Object.fromEntries(Object.entries({ ...filters, from, to }).filter(([, v]) => v));
  return useQuery({
    queryKey: ["admin", "schedules", "week", query],
    queryFn: ({ signal }) => allPages<Row>("GET /class-schedules", { query, signal }),
  });
}

export function WeekNav({ week, onWeek }: { week: string; onWeek: (w: string) => void }) {
  const end = addDays(week, 6);
  const fmt = (k: string) => k.split("-").reverse().slice(0, 2).join("/");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="cr-btn sm icon" onClick={() => onWeek(addDays(week, -7))} aria-label="Tuần trước">
        <ChevronLeft size={16} />
      </button>
      <span className="cr-mono" style={{ minWidth: 150, textAlign: "center" }}>
        {fmt(week)} – {fmt(end)}/{end.slice(0, 4)}
      </span>
      <button className="cr-btn sm icon" onClick={() => onWeek(addDays(week, 7))} aria-label="Tuần sau">
        <ChevronRight size={16} />
      </button>
      <button className="cr-btn sm" onClick={() => onWeek(mondayOf(todayKey()))}>
        Tuần này
      </button>
    </div>
  );
}

export function WeekCalendar({ week, rows, onSelect, showRoom = true }: { week: string; rows: Row[]; onSelect: (id: string) => void; showRoom?: boolean }) {
  const today = todayKey();
  return (
    <div className="cr-week">
      {WEEKDAYS.map((label, i) => {
        const key = addDays(week, i);
        const items = rows.filter((r) => vnDateKey(new Date(str(r.startTime))) === key).sort((a, b) => str(a.startTime).localeCompare(str(b.startTime)));
        return (
          <section key={key} className={"cr-day" + (key === today ? " today" : "")} aria-label={`${label} ${key}`}>
            <div className="cr-day-head">
              <strong>{label}</strong>
              <span>{key.split("-").reverse().slice(0, 2).join("/")}</span>
            </div>
            <div className="cr-day-body">
              {items.length ? (
                items.map((r) => (
                  <button key={str(r.id)} className={`cr-event ${str(r.status)}${r.makeupForId ? " makeup" : ""}`} onClick={() => onSelect(str(r.id))}>
                    <b>
                      {clock(r.startTime)}–{clock(r.endTime)}
                      {r.makeupForId ? " · Dạy bù" : r.status === "CANCELLED" ? " · Đã hủy" : r.status === "COMPLETED" ? " · Xong" : ""}
                    </b>
                    <span>{str(get(r, "class.name"))}</span>
                    <small>
                      {[showRoom ? str(get(r, "room.name")) : "", str(get(r, "class.coach.user.fullName"))].filter(Boolean).join(" · ")} · {num(get(r, "_count.enrollments"))}/
                      {num(get(r, "class.capacity"))}
                    </small>
                  </button>
                ))
              ) : (
                <div className="cr-day-empty">Trống</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ScheduleLegend() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Pill tone="info">Đã lên lịch</Pill>
      <Pill tone="warn">Buổi dạy bù</Pill>
      <Pill tone="plain">Hoàn thành</Pill>
      <Pill tone="bad">Đã hủy</Pill>
    </div>
  );
}

const RESOLUTION: Record<string, string> = { MAKEUP: "Dạy bù", REFUND: "Hoàn tiền buổi" };
const ENROLL: Record<string, ["ok" | "bad" | "info", string]> = { BOOKED: ["ok", "Đã giữ chỗ"], CANCELLED: ["bad", "Đã hủy"], COMPLETED: ["info", "Đã học"] };

/** Chi tiết buổi học + danh sách học viên giữ chỗ (chỉ xem — thao tác lịch thuộc HLV phụ trách trên ứng dụng). */
export function ScheduleDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin", "schedules", "detail", id], queryFn: ({ signal }) => api<Row>("GET /class-schedules/{id}", { params: { id }, signal }) });
  const e = useQuery({
    queryKey: ["admin", "schedules", "enrollments", id],
    queryFn: ({ signal }) => allPages<Row>("GET /enrollments/schedule/{scheduleId}", { params: { scheduleId: id }, signal }),
  });
  return (
    <Dialog title="Chi tiết buổi học" eyebrow="Lịch học" onClose={onClose} wide>
      <QueryView q={q} rows={4}>
        {(res) => {
          const s = res.data;
          const makeupFor = s.makeupFor as Row | null;
          const makeup = s.makeup as Row | null;
          return (
            <>
              <Dl
                items={[
                  ["Khóa học", <Link key="c" to={`/manager/classes/${str(get(s, "class.id") ?? s.classId)}`} onClick={onClose}>{str(get(s, "class.name"))}</Link>],
                  ["HLV", str(get(s, "class.coach.user.fullName"))],
                  ["Thời gian", `${dateTime(s.startTime)} → ${clock(s.endTime)}`],
                  ["Phòng", <Link key="r" to={`/manager/rooms/${str(s.roomId)}`} onClick={onClose}>{str(get(s, "room.name"))}</Link>],
                  ["Trạng thái", <SchedulePill key="s" status={s.status} />],
                  ["Đã giữ chỗ", `${num(get(s, "_count.enrollments"))} / ${num(get(s, "class.capacity"))}`],
                  ...(s.status === "CANCELLED"
                    ? ([
                        ["Lý do hủy", str(s.cancelReason) || "—"],
                        ["Phương án", RESOLUTION[str(s.cancelResolution)] ?? "Hủy khi chưa có học viên"],
                      ] as [string, string][])
                    : []),
                  ...(makeupFor ? ([["Dạy bù cho buổi", dateTime(makeupFor.startTime)]] as [string, string][]) : []),
                  ...(makeup ? ([["Buổi dạy bù", `${dateTime(makeup.startTime)} (${makeup.status === "SCHEDULED" ? "đã lên lịch" : str(makeup.status)})`]] as [string, string][]) : []),
                ]}
              />
              <div className="cr-alert info">
                <div>Tạo, dời, hủy (dạy bù/hoàn tiền) và hoàn thành buổi do HLV phụ trách thực hiện trên ứng dụng. Quản lý theo dõi tại đây và chuyển phòng hàng loạt ở trang Phòng tập.</div>
              </div>
            </>
          );
        }}
      </QueryView>
      <h3 style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600 }}>Học viên</h3>
      <QueryView q={e} rows={3}>
        {(res) => (
          <DataTable
            rows={res.data}
            empty={<p className="cr-muted" style={{ margin: 0 }}>Chưa có học viên giữ chỗ.</p>}
            columns={[
              {
                key: "n",
                title: "Học viên",
                render: (r) => (
                  <div className="cr-cell-main">
                    <strong>{str(get(r, "member.user.fullName"))}</strong>
                    <small>{str(get(r, "member.user.email"))}</small>
                  </div>
                ),
              },
              { key: "p", title: "Điện thoại", render: (r) => <span className="cr-mono">{str(get(r, "member.user.phone")) || "—"}</span> },
              {
                key: "s",
                title: "Trạng thái",
                render: (r) => {
                  const [t, l] = ENROLL[str(r.status)] ?? ["info", str(r.status)];
                  return <Pill tone={t}>{l}</Pill>;
                },
              },
              { key: "b", title: "Giữ chỗ lúc", render: (r) => dateTime(r.bookedAt) },
            ]}
          />
        )}
      </QueryView>
    </Dialog>
  );
}
