/** Tiện ích giờ Việt Nam (UTC+7, không có giờ mùa hè) — không phụ thuộc timezone của server. */

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const WEEKDAY_LABELS_VI = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const VN_WEEKDAY_TO_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const weekdayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TIME_ZONE, weekday: "short" });
const clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Thứ trong tuần ISO 1..7 (1 = Thứ 2) theo giờ VN. */
export function vnWeekdayIso(date: Date): number {
  return VN_WEEKDAY_TO_ISO[weekdayFmt.format(date).slice(0, 3)] ?? 1;
}

/** "Thứ 2".."Chủ nhật" từ ISO 1..7. */
export function vnWeekdayLabel(iso: number): string {
  return WEEKDAY_LABELS_VI[iso - 1] ?? `Thứ ${iso + 1}`;
}

/** "HH:mm" theo giờ VN. */
export function vnClock(date: Date): string {
  return clockFmt.format(date);
}

/** "YYYY-MM-DD" theo giờ VN (ngày lịch của buổi học). */
export function vnDateKey(date: Date): string {
  return dateFmt.format(date);
}

/** Thời điểm UTC của `YYYY-MM-DD` + `HH:mm` theo giờ VN. */
export function vnDateTime(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+07:00`);
}

/** Cộng `days` ngày vào `YYYY-MM-DD` (lịch dương, không phụ thuộc timezone). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Thứ ISO 1..7 của `YYYY-MM-DD` (ngày lịch). */
export function weekdayIsoOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = CN
  return js === 0 ? 7 : js;
}
