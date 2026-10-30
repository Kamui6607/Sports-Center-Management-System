/**
 * Chuẩn hóa URL ảnh (local upload hoặc Cloudinary/external URL).
 * Nếu là relative path (bắt đầu bằng /uploads/...), tự động ghép Base URL của máy chủ API.
 */
export function resolveAssetUrl(url?: unknown): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }

  const apiBase =
    (import.meta as unknown as { env: Record<string, string> }).env
      .VITE_API_BASE_URL || "http://localhost:8080/api/v1";
  const serverBase = apiBase.replace(/\/api\/v1\/?$/, "");
  return `${serverBase}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}
