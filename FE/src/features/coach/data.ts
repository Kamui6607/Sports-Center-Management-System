import { useQuery } from "@tanstack/react-query";
import { api, type RecordData } from "../../shared/api";

export type Row = RecordData;
export const obj = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
export const str = (value: unknown, fallback = "Chưa cập nhật") =>
  typeof value === "string" && value.trim() ? value : fallback;
export const idOf = (value: unknown) => str(obj(value).id, "");
export function rows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.map(obj);
  throw new Error(
    "Dữ liệu danh sách chưa đúng định dạng. Vui lòng thử lại hoặc liên hệ quản lý.",
  );
}
export async function all(
  key: string,
  query: Record<string, string>,
  signal: AbortSignal,
  params?: Record<string, string>,
) {
  const result: Row[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await api<Row[]>(key, {
      query: { ...query, page: String(page), limit: "100" },
      params,
      signal,
    });
    if (response.pagination && Number(response.pagination.page) !== page)
      throw new Error(
        "Máy chủ chưa trả đúng trang dữ liệu. Vui lòng thử lại hoặc liên hệ quản lý.",
      );
    result.push(...rows(response.data));
    if (!response.pagination || page >= response.pagination.totalPages)
      return result;
  }
  throw new Error("Danh sách quá lớn. Hãy thu hẹp khoảng thời gian cần xem.");
}
export function useClasses(coachId: string) {
  return useQuery({
    queryKey: ["coach", coachId, "classes"],
    enabled: !!coachId,
    queryFn: async ({ signal }) => {
      const result = await all("GET /classes", { coachId }, signal);
      if (result.some((c) => !idOf(c)))
        throw new Error(
          "Lớp học thiếu mã định danh. Vui lòng liên hệ quản lý.",
        );
      return result;
    },
  });
}
export function useSchedules(
  coachId: string,
  classes: Row[] | undefined,
  start: string,
  end: string,
) {
  const ids = (classes || []).map(idOf).sort();
  return useQuery({
    queryKey: ["coach", coachId, "schedules", ids, start, end],
    enabled: !!classes && !!coachId,
    queryFn: async ({ signal }) => {
      // Query only assigned classes. Never fetch the entire centre and expose unrelated rosters.
      const result: Row[] = [];
      for (let offset = 0; offset < ids.length; offset += 4) {
        const batch = await Promise.all(
          ids.slice(offset, offset + 4).map(async (classId) => {
            const list = await all(
              "GET /class-schedules",
              {
                classId,
                startAfter: `${start}T00:00:00+07:00`,
                startBefore: `${end}T23:59:59.999+07:00`,
              },
              signal,
            );
            return list.filter(
              (s) => s.classId === classId || idOf(s.class) === classId,
            );
          }),
        );
        result.push(...batch.flat());
      }
      return result.sort(
        (a, b) =>
          Date.parse(String(a.startTime)) - Date.parse(String(b.startTime)),
      );
    },
  });
}
export function dateKey(value: unknown = new Date()) {
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d.toISOString());
}
export function monday(day: string) {
  const weekday = new Date(`${day}T12:00:00+07:00`).getUTCDay();
  return addDays(day, -(weekday === 0 ? 6 : weekday - 1));
}
export function fmt(value: unknown, time = false) {
  const d = new Date(String(value));
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        ...(time
          ? ({ hour: "2-digit", minute: "2-digit" } as const)
          : ({ day: "2-digit", month: "2-digit", year: "numeric" } as const)),
      }).format(d)
    : "Chưa cập nhật";
}
export const states: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  CANCELLED: "Đã hủy",
  COMPLETED: "Hoàn thành",
  BOOKED: "Đã đăng ký",
  PRESENT: "Có mặt",
  ABSENT: "Vắng mặt",
  LATE: "Đi muộn",
  EXCUSED: "Có phép",
  BEGINNER: "Mới bắt đầu",
  INTERMEDIATE: "Trung bình",
  ADVANCED: "Nâng cao",
  REGULAR: "Tiêu chuẩn",
  PREMIUM: "Cao cấp",
};
export const state = (value: unknown) => states[String(value)] || str(value);
