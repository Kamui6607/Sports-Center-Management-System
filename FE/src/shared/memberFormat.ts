import { MEMBER_TIME_ZONE } from "./memberCalendar";
export function formatMemberDate(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return "Chưa cập nhật";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Chưa cập nhật";
  return options
    ? date.toLocaleString("vi-VN", { timeZone: MEMBER_TIME_ZONE, ...options })
    : date.toLocaleDateString("vi-VN", { timeZone: MEMBER_TIME_ZONE });
}
