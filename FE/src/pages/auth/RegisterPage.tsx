import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../../api/auth.api";
import { Activity, Lock, Mail, User as UserIcon, Phone, ArrowRight } from "lucide-react";
import { AlertBanner } from "../../components/common";

export function RegisterPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER">("MALE");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authApi.register({
        fullName,
        email,
        password,
        phone: phone || undefined,
        gender,
        dateOfBirth: dateOfBirth || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Đăng ký không thành công. Vui lòng thử lại.");
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
          maxWidth: 480,
          background: "#ffffff",
          borderRadius: 20,
          padding: "36px 32px",
          boxShadow: "0 20px 25px -5px rgba(32, 61, 49, 0.08), 0 8px 10px -6px rgba(32, 61, 49, 0.04)",
          border: "1px solid #e2eae5",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: "#203d31",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d3f879",
              marginBottom: 12,
            }}
          >
            <Activity size={26} strokeWidth={2.6} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#203d31", letterSpacing: -0.6, margin: "0 0 6px" }}>
            Tạo tài khoản Hội viên
          </h1>
          <p style={{ margin: 0, color: "#7b8982", fontSize: 13 }}>
            Tham gia cộng đồng thể thao hàng đầu tại Pulse Sports Center
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 18 }}>
            <AlertBanner type="error" message={error} />
          </div>
        )}

        {success && (
          <div style={{ marginBottom: 18 }}>
            <AlertBanner type="success" message="Đăng ký thành công! Đang chuyển về trang đăng nhập..." />
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
              Họ và tên *
            </label>
            <div style={{ position: "relative" }}>
              <UserIcon size={17} color="#98a2b3" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                style={{ paddingLeft: 38 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
              Email *
            </label>
            <div style={{ position: "relative" }}>
              <Mail size={17} color="#98a2b3" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@domain.com"
                style={{ paddingLeft: 38 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
              Mật khẩu (tối thiểu 6 ký tự) *
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={17} color="#98a2b3" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: 38 }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
                Số điện thoại
              </label>
              <div style={{ position: "relative" }}>
                <Phone size={17} color="#98a2b3" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912345678"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
                Giới tính
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE" | "OTHER")}
              >
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
              Ngày sinh
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
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
            }}
          >
            {loading ? "Đang tạo tài khoản..." : "Hoàn tất đăng ký"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid #f0f4f2",
            textAlign: "center",
            fontSize: 13,
            color: "#667085",
          }}
        >
          Đã có tài khoản?{" "}
          <Link
            to="/login"
            style={{ color: "#203d31", fontWeight: 700, textDecoration: "underline" }}
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
}
