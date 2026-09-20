export function formatMemberDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "Chưa cập nhật";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Chưa cập nhật";
  return options ? date.toLocaleString("vi-VN", options) : date.toLocaleDateString("vi-VN");
}
