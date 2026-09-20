import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { authService, clearSession, hasSession } from "../../shared/api";
import { ErrorState, Loading } from "../../shared/ui";
import { Brand } from "../../shared/Brand";
import { Login } from "./Login";
import { RoleRouter } from "../../app/RoleRouter";
import { roleHome } from "../../app/roles";
import { useLocation, useNavigate } from "react-router-dom";
import { Landing } from "../public/Landing";
import { Register } from "./Register";
export function Session() {
  const { pathname } = useLocation();
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
  });
  useEffect(() => {
    const expired = () => {
      setSession(false);
      cache.clear();
      setError(
        new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."),
      );
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
      const home = roleHome(profile.data.role);
      navigate(home ? `${home}/dashboard` : "/login", { replace: true });
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
      setError(
        new Error(
          "Đã đăng xuất trên trình duyệt. Máy chủ chưa xác nhận thu hồi phiên do lỗi kết nối.",
        ),
      );
    } finally {
      setSession(false);
      cache.clear();
      navigate("/login", { replace: true });
    }
  }
  if (pathname === "/" && !session) return <Landing signedIn={false} />;
  if (!session && pathname === "/register") return <Register />;
  if (!session) return <Login onLogin={login} busy={loginBusy} error={error} />;
  if (q.isPending)
    return (
      <div className="fullscreen">
        <Brand />
        <Loading variant="page" />
      </div>
    );
  if (q.isError)
    return (
      <div className="fullscreen">
        <ErrorState error={q.error} retry={() => q.refetch()} />
        <button className="button" onClick={logout}>
          Quay lại đăng nhập
        </button>
      </div>
    );
  if (!roleHome(q.data.data.role) || !q.data.data.isActive)
    return (
      <div className="fullscreen">
        <ShieldCheck size={42} />
        <h1>Không có quyền truy cập</h1>
        <p>Tài khoản không hoạt động hoặc chưa được cấp vai trò phù hợp.</p>
        <button className="button primary" onClick={logout}>
          Đăng nhập tài khoản khác
        </button>
      </div>
    );
  return <RoleRouter user={q.data.data} onLogout={logout} />;
}
