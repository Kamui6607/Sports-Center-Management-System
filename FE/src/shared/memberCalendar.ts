export const MEMBER_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function memberDateKey(value: string | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEMBER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Calendar anchors use UTC midnight; they represent a date, not a class time.
export function memberWeekStart(now = new Date()): Date {
  const monday = new Date(`${memberDateKey(now)}T00:00:00Z`);
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday;
}
