import { api, contract, clearSession, saveTokens } from "../shared/api";
export { ApiError, BASE_URL } from "../shared/api";
export const getAccessToken = () =>
  sessionStorage.getItem("pulse.access") || "";
export const getRefreshToken = () =>
  sessionStorage.getItem("pulse.refresh") || "";
export const clearTokens = clearSession;
export const setTokens = (
  accessToken: string,
  refreshToken = getRefreshToken(),
) => saveTokens({ accessToken, refreshToken });

// Member screens use the same transport, refresh lock and Vietnamese errors as every portal.
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(path, "https://local.invalid");
  if (url.origin !== "https://local.invalid")
    throw new Error("Unsupported API origin");
  const method = (options.method || "GET").toUpperCase();
  const entries = Object.entries(contract).filter(
    ([, op]) => op.method.toUpperCase() === method,
  );
  const entry =
    entries.find(([, op]) => op.path === url.pathname) ||
    entries.find(([, op]) =>
      new RegExp("^" + op.path.replace(/\{\w+\}/g, "[^/]+") + "$").test(
        url.pathname,
      ),
    );
  if (!entry)
    throw new Error("Undocumented operation: " + method + " " + url.pathname);
  const [key, op] = entry;
  const params: Record<string, string> = {};
  op.path.split("/").forEach((part, i) => {
    if (part.startsWith("{"))
      params[part.slice(1, -1)] = decodeURIComponent(
        url.pathname.split("/")[i],
      );
  });
  const result = await api<unknown>(key, {
    params,
    query: Object.fromEntries(url.searchParams),
    body:
      typeof options.body === "string" ? JSON.parse(options.body) : undefined,
    signal: options.signal || undefined,
  });
  const collection = (
    {
      classes: "classes",
      "class-schedules": "schedules",
      sports: "sports",
      "membership-plans": "plans",
      subscriptions: "subscriptions",
      enrollments: "enrollments",
    } as Record<string, string>
  )[url.pathname.split("/")[1]];
  return (
    Array.isArray(result.data) && collection
      ? { [collection]: result.data, pagination: result.pagination }
      : result.data
  ) as T;
}
export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
