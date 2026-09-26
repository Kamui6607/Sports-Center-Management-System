import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
import type { RecordData } from "../../shared/api";
import { at, display } from "../../shared/config";

export type ScheduleCalendarView = "week" | "month";

const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(value: Date) {
  const result = startOfDay(value);
  const offset = (result.getDay() + 6) % 7;
  return addDays(result, -offset);
}

export function calendarRange(cursor: Date, view: ScheduleCalendarView) {
  if (view === "week") {
    const start = startOfWeek(cursor);
    return { start, end: addDays(start, 7) };
  }
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(monthStart);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const end = addDays(startOfWeek(addDays(monthEnd, -1)), 7);
  return { start, end };
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function time(value: unknown) {
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function title(cursor: Date, view: ScheduleCalendarView) {
  if (view === "month") {
    return cursor.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  }
  const { start, end } = calendarRange(cursor, "week");
  const last = addDays(end, -1);
  return `${start.toLocaleDateString("vi-VN")} – ${last.toLocaleDateString("vi-VN")}`;
}

function ScheduleCard({ row, compact, onSelect }: { row: RecordData; compact: boolean; onSelect: (row: RecordData) => void }) {
  const status = String(row.status || "SCHEDULED").toLowerCase();
  return (
    <button
      type="button"
      className={`calendar-event ${status}`}
      onClick={() => onSelect(row)}
      title={`${display(at(row, "class.name"))} · ${time(row.startTime)}–${time(row.endTime)}`}
    >
      <strong>{display(at(row, "class.name"))}</strong>
      <span><Clock3 size={12} /> {time(row.startTime)}–{time(row.endTime)}</span>
      {!compact && <span><MapPin size={12} /> {display(at(row, "room.name"))}</span>}
    </button>
  );
}

export function ScheduleCalendar({
  rows,
  cursor,
  view,
  onCursorChange,
  onViewChange,
  onSelect,
}: {
  rows: RecordData[];
  cursor: Date;
  view: ScheduleCalendarView;
  onCursorChange: (value: Date) => void;
  onViewChange: (value: ScheduleCalendarView) => void;
  onSelect: (row: RecordData) => void;
}) {
  const { start, end } = calendarRange(cursor, view);
  const days: Date[] = [];
  for (let day = new Date(start); day < end; day = addDays(day, 1)) days.push(day);
  const grouped = new Map<string, RecordData[]>();
  for (const row of [...rows].sort((a, b) => Date.parse(String(a.startTime)) - Date.parse(String(b.startTime)))) {
    const parsed = new Date(String(row.startTime));
    if (Number.isNaN(parsed.getTime())) continue;
    const key = dateKey(parsed);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  const today = dateKey(new Date());
  const move = view === "week" ? 7 : 1;

  return (
    <div className={`schedule-calendar ${view}`}>
      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button className="icon-button" type="button" aria-label="Kỳ trước" onClick={() => onCursorChange(view === "week" ? addDays(cursor, -move) : new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
          <button className="button small" type="button" onClick={() => onCursorChange(new Date())}>Hôm nay</button>
          <button className="icon-button" type="button" aria-label="Kỳ sau" onClick={() => onCursorChange(view === "week" ? addDays(cursor, move) : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        </div>
        <h3><CalendarDays size={18} /> {title(cursor, view)}</h3>
        <div className="calendar-view-switch" role="group" aria-label="Kiểu hiển thị lịch">
          <button type="button" className="button small" aria-pressed={view === "week"} onClick={() => onViewChange("week")}>Tuần</button>
          <button type="button" className="button small" aria-pressed={view === "month"} onClick={() => onViewChange("month")}>Tháng</button>
        </div>
      </div>
      <div className="calendar-scroll" tabIndex={0} role="region" aria-label={`Thời khóa biểu theo ${view === "week" ? "tuần" : "tháng"}`}>
        <div className="calendar-grid calendar-weekdays">
          {dayLabels.map((label) => <div key={label}>{label}</div>)}
        </div>
        <div className="calendar-grid calendar-days">
          {days.map((day) => {
            const key = dateKey(day);
            const outsideMonth = view === "month" && day.getMonth() !== cursor.getMonth();
            return (
              <section key={key} className={`calendar-day${key === today ? " today" : ""}${outsideMonth ? " outside" : ""}`}>
                <header>
                  <span>{view === "week" ? day.toLocaleDateString("vi-VN", { weekday: "long" }) : ""}</span>
                  <strong>{day.getDate()}</strong>
                </header>
                <div className="calendar-events">
                  {(grouped.get(key) || []).map((row) => <ScheduleCard key={String(row.id)} row={row} compact={view === "month"} onSelect={onSelect} />)}
                  {view === "week" && !(grouped.get(key) || []).length && <span className="calendar-empty-day">Chưa có lịch</span>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="calendar-legend"><span><i className="scheduled" /> Đã lên lịch</span><span><i className="completed" /> Hoàn thành</span><span><i className="cancelled" /> Đã hủy</span></div>
    </div>
  );
}
