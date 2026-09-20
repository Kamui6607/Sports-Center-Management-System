import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types/member";
import { ShieldAlert, LogOut } from "lucide-react";

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles = ["MEMBER"] }: ProtectedRouteProps) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="fullscreen" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ width: 42, height: 42, border: "4px solid #e7ece9", borderTopColor: "#203d31", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: "#7b8982", fontSize: 14 }}>Đang tải thông tin tài khoản...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // If user is manager and tried to access member route, redirect to /manager
    if (user.role === "MANAGER") {
      return <Navigate to="/manager" replace />;
    }

    return (
      <div className="fullscreen" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
        <ShieldAlert size={48} color="#e53e3e" style={{ marginBottom: 16 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#203d31" }}>Không có quyền truy cập</h1>
        <p style={{ color: "#7b8982", maxWidth: 420, marginBottom: 24 }}>
          Tài khoản của bạn ({user.email} - Vai trò: <strong>{user.role}</strong>) không có quyền truy cập khu vực này.
        </p>
        <button
          onClick={logout}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "#203d31",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <LogOut size={16} /> Đăng nhập tài khoản khác
        </button>
      </div>
    );
  }

  return <Outlet />;
}
