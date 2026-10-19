import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { authService, clearSession, hasSession } from "../../shared/api";
import { AdminLogin, NotManager, ResetPasswordScreen } from "../manage/AuthScreens";
import { ErrorBox, Skeleton } from "../manage/kit";

const ManagerLayout = lazy(() => import("../manage/ManagerLayout").then((m) => ({ default: m.ManagerLayout })));

/**
 * Web chỉ phục vụ MANAGER (Member/Coach dùng Mobile). Vai trò lấy từ `GET /auth/me` của BE, không tự giải mã JWT.
 * Landing/Member/Coach/Reception giữ source nhưng không còn nằm trong luồng của Web quản trị.
 */
export function Session() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [session, setSession] = useState(hasSession());
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => authService.me(),
    enabled: session,
    retry: false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const expired = (event: Event) => {
      setSession(false);
      cache.clear();
      setError(new Error((event as CustomEvent<string>).detail || "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."));
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [cache]);

  async function login(email: string, password: string) {
    setLoginBusy(true);
    setError(undefined);
    try {
      const profile = await authService.login({ email, password });
      await cache.cancelQueries();
      cache.clear();
      cache.setQueryData(["me"], profile);
      // Điều hướng sau đăng nhập do render quyết định (giữ `?from=` deep link) — xem nhánh cuối.
      setSession(true);
    } catch (e) {
      clearSession();
      setError(e);
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
    try {
      await authService.logout();
    } catch {
      setError(new Error("Đã đăng xuất trên trình duyệt. Máy chủ chưa xác nhận thu hồi phiên do lỗi kết nối."));
    } finally {
      setSession(false);
      cache.clear();
      navigate("/login", { replace: true });
    }
  }

  if (pathname === "/reset-password") return <ResetPasswordScreen />;
  if (!session) {
    if (pathname.startsWith("/manager/") && pathname !== "/login")
      return <Navigate replace to={`/login?from=${encodeURIComponent(pathname + search)}`} />;
    if (pathname !== "/login") return <Navigate replace to="/login" />;
    return <AdminLogin onLogin={login} busy={loginBusy} error={error} />;
  }
  if (q.isPending)
    return (
      <div className="cr cr-solo" style={{ padding: 40 }}>
        <Skeleton rows={6} />
      </div>
    );
  if (q.isError)
    return (
      <div className="cr cr-solo">
        <div className="cr-fullscreen">
          <div>
            <ErrorBox error={q.error} retry={() => void q.refetch()} />
            <button className="cr-btn" onClick={logout}>
              Quay lại đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  const me = q.data.data as typeof q.data.data & { restricted?: boolean };
  if (me.role !== "MANAGER" || !me.isActive || me.restricted) return <NotManager name={me.fullName} onLogout={logout} />;
  if (!pathname.startsWith("/manager")) {
    // Vừa đăng nhập từ deep link: quay lại đúng trang quản trị đã mở.
    const from = pathname === "/login" ? new URLSearchParams(search).get("from") : null;
    return <Navigate replace to={from && from.startsWith("/manager/") ? from : "/manager/dashboard"} />;
  }
  return (
    <Suspense
      fallback={
        <div className="cr cr-solo" style={{ padding: 40 }}>
          <Skeleton rows={6} />
        </div>
      }
    >
      <ManagerLayout user={me} onLogout={logout} />
    </Suspense>
  );
}
