import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Activity, Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { AlertBanner } from "../../components/common";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login({ email, password });
      if (from) {
        navigate(from, { replace: true });
      } else if (user.role === "MANAGER") {
        navigate("/manager", { replace: true });
      } else {
        navigate("/member/dashboard", { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Đăng nhập thất bại. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f6f8f7 0%, #e8efe9 100%)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#ffffff",
          borderRadius: 20,
          padding: "36px 32px",
          boxShadow: "0 20px 25px -5px rgba(32, 61, 49, 0.08), 0 8px 10px -6px rgba(32, 61, 49, 0.04)",
          border: "1px solid #e2eae5",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: "#203d31",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d3f879",
              marginBottom: 14,
            }}
          >
            <Activity size={28} strokeWidth={2.6} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#203d31", letterSpacing: -0.8, margin: "0 0 6px" }}>
            PULSE SPORTS
          </h1>
          <p style={{ margin: 0, color: "#7b8982", fontSize: 14 }}>
            Đăng nhập vào cổng thông tin hội viên & quản trị
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 20 }}>
            <AlertBanner type="error" message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#344054",
                marginBottom: 6,
              }}
            >
              Email tài khoản
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={18}
                color="#98a2b3"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@sports.com"
                style={{ paddingLeft: 38 }}
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#344054",
                marginBottom: 6,
              }}
            >
              Mật khẩu
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={18}
                color="#98a2b3"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: 38, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "#98a2b3",
                  display: "flex",
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: "13px 20px",
              backgroundColor: "#203d31",
              color: "#ffffff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(32, 61, 49, 0.18)",
              transition: "background 0.15s, transform 0.15s",
            }}
          >
            {loading ? "Đang xác thực..." : "Đăng nhập ngay"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: "1px solid #f0f4f2",
            textAlign: "center",
            fontSize: 13,
            color: "#667085",
          }}
        >
          Chưa có tài khoản hội viên?{" "}
          <Link
            to="/register"
            style={{ color: "#203d31", fontWeight: 700, textDecoration: "underline" }}
          >
            Đăng ký tham gia
          </Link>
        </div>
      </div>
    </div>
  );
}
