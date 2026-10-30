import { isDeliverableProvince, normalizeProvince } from "../../config/shop.js";
import { AppError } from "../../middlewares/errorHandler.js";

/**
 * Danh mục hành chính cho dropdown địa chỉ — địa giới 2 cấp (Tỉnh/Thành → Phường/Xã).
 * Nguồn: provinces.open-api.vn, bản `v2` (sau sáp nhập tỉnh, không còn cấp Quận/Huyện).
 * Quận/Huyện chỉ là gợi ý TÙY CHỌN: lấy từ bản cũ (v1) khi tìm được tỉnh cùng tên, không có thì trả [].
 * Đổi nguồn bằng env `LOCATIONS_API_URL` (mặc định https://provinces.open-api.vn/api).
 * Cache trong bộ nhớ 24h; nguồn lỗi mà còn cache cũ ⇒ trả cache cũ, không có ⇒ 503.
 */
export interface LocationItem {
  code: number;
  name: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;
const cache = new Map<string, { at: number; data: any }>();

function baseUrl() {
  return (process.env.LOCATIONS_API_URL ?? "https://provinces.open-api.vn/api").replace(/\/+$/, "");
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  try {
    const data = await load();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data as T;
    if (err instanceof AppError) throw err;
    throw new AppError("Không tải được danh mục địa chỉ. Vui lòng thử lại sau.", 503, { code: "LOCATIONS_UNAVAILABLE" });
  }
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) throw new AppError("Không tìm thấy mã địa danh.", 404, { code: "LOCATION_NOT_FOUND" });
  if (!res.ok) throw new Error(`locations upstream ${res.status}`);
  return res.json();
}

const toItems = (rows: any[]): LocationItem[] =>
  (rows ?? []).map((r) => ({ code: Number(r.code), name: String(r.name) })).sort((a, b) => a.name.localeCompare(b.name, "vi"));

const provincesV2 = () => cached("p2", async () => toItems(await getJson("/v2/p/")));

/** Danh sách tỉnh/thành (2 cấp); `deliverable` = nằm trong khu vực giao hàng của cửa hàng. */
export async function listProvinces() {
  return (await provincesV2()).map((p) => ({ ...p, deliverable: isDeliverableProvince(p.name) }));
}

/** Phường/Xã trực thuộc tỉnh/thành (địa giới 2 cấp). */
export async function listWards(provinceCode: number): Promise<LocationItem[]> {
  return cached(`w2:${provinceCode}`, async () => toItems((await getJson(`/v2/p/${provinceCode}?depth=2`)).wards));
}

/**
 * Quận/Huyện (TÙY CHỌN, cấp cũ): khớp tỉnh theo tên (bỏ dấu, bỏ tiền tố "Thành phố/Tỉnh") với bản v1.
 * Tỉnh đã sáp nhập có thể không khớp ⇒ trả [] — FE để trống/ẩn dropdown, người dùng vẫn lưu địa chỉ được.
 */
export async function listDistricts(provinceCode: number): Promise<LocationItem[]> {
  const province = (await provincesV2()).find((p) => p.code === provinceCode);
  if (!province) throw new AppError("Không tìm thấy mã địa danh.", 404, { code: "LOCATION_NOT_FOUND" });
  return cached(`d1:${provinceCode}`, async () => {
    try {
      const legacy = toItems(await getJson("/p/"));
      const target = normalizeProvince(province.name);
      const match = legacy.find((p) => normalizeProvince(p.name) === target);
      if (!match) return [];
      return toItems((await getJson(`/p/${match.code}?depth=2`)).districts);
    } catch {
      return [];
    }
  });
}
