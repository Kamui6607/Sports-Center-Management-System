import operations from "./operations.json";
import { localizeApiError } from "./apiErrors";
import { terminalSessionError } from "./businessRules";
import type { LoginOk, ProfileOk, PostAuthLoginRequest } from "./generated";
export type RecordData = { [key: string]: unknown };
export interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  errors?: { field: string; message: string }[];
}
export interface Schema {
  type: string;
  format?: string;
  enum?: string[];
  minLength?: number;
  default?: unknown;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
}
export interface Operation {
  path: string;
  method: string;
  summary: string;
  security: unknown[];
  parameters: {
    name: string;
    in: string;
    required?: boolean;
    schema: Schema;
  }[];
  body: Schema | null;
  statusCodes: string[];
}
export const contract = operations as unknown as Record<string, Operation>;
export const BASE_URL = (
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_API_BASE_URL ||
  "https://sports-center-management-system.onrender.com/api/v1"
).replace(/\/$/, "");
let accessToken = sessionStorage.getItem("pulse.access") || "";
let refreshToken = sessionStorage.getItem("pulse.refresh") || "";
export const hasSession = () => Boolean(accessToken || refreshToken);
export function clearSession() {
  accessToken = "";
  refreshToken = "";
  sessionStorage.removeItem("pulse.access");
  sessionStorage.removeItem("pulse.refresh");
}
export function saveTokens(tokens: LoginOk["data"]) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  sessionStorage.setItem("pulse.access", accessToken);
  sessionStorage.setItem("pulse.refresh", refreshToken);
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Envelope<unknown>["errors"] = [],
    public terminalSession = false,
  ) {
    super(message);
  }
}
async function transport(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(
      "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.",
      0,
    );
  }
  const text = await res.text();
  let payload: Envelope<unknown>;
  try {
    payload = text
      ? JSON.parse(text)
      : { success: res.ok, data: null, message: "" };
  } catch {
    throw new ApiError(
      "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.",
      res.status,
    );
  }
  if (!res.ok || payload.success === false) {
    const localized = localizeApiError(
      payload.message,
      payload.errors,
      res.status,
    );
    throw new ApiError(
      localized.message,
      res.status,
      localized.errors,
      terminalSessionError(String(payload.message || "")),
    );
  }
  return payload;
}
let refreshing: Promise<void> | null = null;
async function refresh() {
  if (!refreshing)
    refreshing = (async () => {
      try {
        const r = await transport("/auth/refresh-token", "POST", {
          refreshToken,
        });
        const tokens = r.data as { accessToken: string; refreshToken?: string };
        saveTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || refreshToken,
        });
      } catch (e) {
        if (e instanceof ApiError && [400, 401, 403].includes(e.status)) {
          clearSession();
          window.dispatchEvent(new Event("session-expired"));
        }
        throw e;
      } finally {
        refreshing = null;
      }
    })();
  return refreshing;
}
export async function api<T = RecordData>(
  key: string,
  options: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<Envelope<T>> {
  const op = contract[key];
  if (!op) throw new Error("Undocumented operation: " + key);
  let path = op.path.replace(/\{(\w+)\}/g, (_, p) => {
    if (!options.params?.[p]) throw new Error("Missing path parameter " + p);
    return encodeURIComponent(options.params[p]);
  });
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(options.query || {})) {
    if (!v) continue;
    if (!op.parameters.some((p) => p.in === "query" && p.name === k))
      throw new Error("Undocumented query parameter " + k);
    const schema = op.parameters.find(
      (p) => p.in === "query" && p.name === k,
    )!.schema;
    search.set(
      k,
      schema.format === "date-time" ? new Date(v).toISOString() : v,
    );
  }
  if (search.size) path += "?" + search.toString();
  try {
    return (await transport(
      path,
      op.method,
      options.body,
      options.signal,
    )) as Envelope<T>;
  } catch (e) {
    if (
      e instanceof ApiError &&
      e.status === 401 &&
      e.terminalSession &&
      op.security.length
    ) {
      clearSession();
      window.dispatchEvent(
        new CustomEvent("session-expired", { detail: e.message }),
      );
      throw e;
    }
    if (
      e instanceof ApiError &&
      e.status === 401 &&
      op.security.length &&
      refreshToken
    ) {
      await refresh();
      try {
        return (await transport(
          path,
          op.method,
          options.body,
          options.signal,
        )) as Envelope<T>;
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) {
          clearSession();
          window.dispatchEvent(new Event("session-expired"));
        }
        throw retryError;
      }
    }
    if (e instanceof ApiError && e.status === 401 && op.security.length) {
      clearSession();
      window.dispatchEvent(new Event("session-expired"));
    }
    throw e;
  }
}
export const authService = {
  async login(body: PostAuthLoginRequest) {
    const r = await api<LoginOk["data"]>("POST /auth/login", { body });
    saveTokens(r.data);
    return authService.me();
  },
  me: () => api<ProfileOk["data"]>("GET /auth/me"),
  async logout() {
    try {
      await api("POST /auth/logout", { body: { refreshToken } });
    } finally {
      clearSession();
    }
  },
};
