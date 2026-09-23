import { api, contract, type Envelope } from "./api";

/** Never silently treat a partial first page as the full collection. */
export async function allPages<T>(
  key: string,
  options: {
    query?: Record<string, string>;
    params?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<Envelope<T[]>> {
  const rows: T[] = [];
  const paged = contract[key]?.parameters.some(
    (p) => p.in === "query" && p.name === "page",
  );
  for (let page = 1; page <= 1000; page++) {
    const res = await api<T[]>(key, {
      ...options,
      query: {
        ...options.query,
        ...(paged ? { page: String(page), limit: "100" } : {}),
      },
    });
    if (!Array.isArray(res.data))
      throw new Error("Máy chủ trả về danh sách không hợp lệ.");
    if (res.pagination && res.pagination.page !== page)
      throw new Error("Máy chủ trả sai trang dữ liệu. Vui lòng tải lại.");
    rows.push(...res.data);
    if (!res.pagination || page >= res.pagination.totalPages)
      return { ...res, data: rows, pagination: undefined };
    if (!paged) throw new Error("API chưa hỗ trợ tải đầy đủ danh sách này.");
  }
  throw new Error("Danh sách quá lớn. Vui lòng thu hẹp bộ lọc.");
}
