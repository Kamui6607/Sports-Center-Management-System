import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api";
import { allPages } from "../../shared/pagedApi";
import { get, num, vnDateKey, vnStartOf } from "./kit";
import type { Row } from "./kit";

/** Dữ liệu vận hành dùng chung giữa thẻ "Hôm nay" ở sidebar và trang Tổng quan (cùng query key ⇒ 1 lần gọi). */
const K = ["admin", "ops"];

export function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Mọi buổi học bắt đầu trong [from, to) theo ngày giờ Việt Nam — tải đủ mọi trang. */
export function useSessionsBetween(from: string, to: string) {
  return useQuery({
    queryKey: [...K, "sessions", from, to],
    queryFn: ({ signal }) =>
      allPages<Row>("GET /class-schedules", { query: { from: vnStartOf(from).toISOString(), to: vnStartOf(to).toISOString() }, signal }),
    staleTime: 60_000,
  });
}

export function useTodaySessions() {
  const today = vnDateKey(new Date());
  return useSessionsBetween(today, addDays(today, 1));
}

/** Tổng số bản ghi (pagination.total) của một danh sách — dùng `limit=1` để chỉ đếm. */
export function useCount(key: string, query: Record<string, string>) {
  return useQuery({
    queryKey: [...K, "count", key, query],
    queryFn: ({ signal }) => api<Row[]>(key, { query: { ...query, limit: "1" }, signal }),
    select: (res) => res.pagination?.total ?? res.data.length,
    staleTime: 60_000,
  });
}

/** Hàng chờ Quản lý: CV HLV và khóa học đang chờ duyệt. */
export function usePendingCv(limit = "5") {
  return useQuery({
    queryKey: [...K, "cv", limit],
    queryFn: ({ signal }) => api<Row[]>("GET /coaches/cv/pending", { query: { status: "PENDING", limit }, signal }),
    staleTime: 60_000,
  });
}
export function usePendingClasses(limit = "5") {
  return useQuery({
    queryKey: [...K, "classes", limit],
    queryFn: ({ signal }) => api<Row[]>("GET /classes", { query: { status: "PENDING", limit }, signal }),
    staleTime: 60_000,
  });
}

/** Sĩ số đã đặt / sức chứa của một buổi. */
export function seats(s: Row): [number, number] {
  return [Number(get(s, "_count.enrollments") ?? 0), Number(get(s, "class.capacity") ?? 0)];
}

/** Tổng chỗ đã đặt / tổng sức chứa của các buổi chưa hủy. */
export function fillRate(rows: Row[]) {
  let booked = 0;
  let capacity = 0;
  for (const s of rows) {
    if (s.status === "CANCELLED") continue;
    const [b, c] = seats(s);
    booked += b;
    capacity += c;
  }
  return { booked, capacity, pct: capacity ? Math.round((booked / capacity) * 100) : null };
}

export const pct = (part: number | undefined, whole: number | undefined) =>
  part == null || !whole ? null : Math.min(100, Math.round((part / whole) * 100));

export const fmtCount = (v: number | undefined) => (v == null ? "…" : num(v));
