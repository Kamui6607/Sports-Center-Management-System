import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  CreditCard,
  Volleyball,
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  CheckCheck,
  Bell,
  UserCircle,
  Bot,
  LogOut,
  Menu,
  X,
  Activity,
  ChevronDown,
} from "lucide-react";

export function MemberLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const navItems = [
    { to: "/member/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/member/membership", label: "Gói hội viên", icon: CreditCard },
    { to: "/member/classes", label: "Tìm kiếm lớp học", icon: Volleyball },
    { to: "/member/my-classes", label: "Lớp của tôi", icon: CalendarCheck },
    { to: "/member/schedule", label: "Lịch tập tuần", icon: CalendarDays },
    { to: "/member/training", label: "Mục tiêu tập luyện", icon: Dumbbell },
    { to: "/member/attendance", label: "Điểm danh & Tham gia", icon: CheckCheck },
    { to: "/member/notifications", label: "Thông báo", icon: Bell },
    { to: "/member/profile", label: "Hồ sơ cá nhân", icon: UserCircle },
    { to: "/member/ai", label: "AI Trợ lý ảo", icon: Bot },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#f6f8f7" }}>
      {/* TOP NAVBAR */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          height: 64,
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e7ece9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid #e7ece9",
              borderRadius: 8,
              padding: 8,
              cursor: "pointer",
              color: "#203d31",
            }}
            className="mobile-only-btn"
            aria-label="Toggle Menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div
            onClick={() => navigate("/member/dashboard")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#203d31",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#d3f879",
              }}
            >
              <Activity size={20} strokeWidth={2.5} />
            </div>
            <div>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#203d31", letterSpacing: -0.5 }}>
                PULSE<span style={{ color: "#749b38" }}>.</span>
              </span>
              <span
                style={{
                  display: "inline-block",
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  backgroundColor: "#f3fbe8",
                  color: "#203d31",
                  border: "1px solid #d3f879",
                  padding: "1px 6px",
                  borderRadius: 4,
                  verticalAlign: "middle",
                }}
              >
                MEMBER PORTAL
              </span>
            </div>
          </div>
        </div>

        {/* User Right Menu */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <button
            onClick={() => navigate("/member/notifications")}
            style={{
              background: "transparent",
              border: "none",
              color: "#5b6b63",
              padding: 8,
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
            title="Thông báo"
          >
            <Bell size={19} />
          </button>

          {/* User Profile Pill & Dropdown */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 10px 6px 6px",
                borderRadius: 999,
                border: "1px solid #e7ece9",
                background: "#ffffff",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  backgroundColor: "#203d31",
                  color: "#d3f879",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {user?.fullName ? user.fullName.charAt(0).toUpperCase() : "M"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#203d31", lineHeight: 1.2 }}>
                  {user?.fullName || "Học viên"}
                </span>
                <span style={{ fontSize: 11, color: "#7b8982" }}>Hội viên</span>
              </div>
              <ChevronDown size={14} color="#7b8982" />
            </div>

            {userDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 8,
                  width: 210,
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
                  border: "1px solid #e7ece9",
                  padding: "6px 0",
                  zIndex: 50,
                }}
              >
                <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f4f2" }}>
                  <div style={{ fontSize: 12, color: "#7b8982" }}>Đăng nhập với email</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#203d31", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user?.email}
                  </div>
                </div>

                <div
                  onClick={() => {
                    setUserDropdownOpen(false);
                    navigate("/member/profile");
                  }}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    color: "#344054",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                  }}
                >
                  <UserCircle size={16} /> Hồ sơ cá nhân
                </div>

                <div
                  onClick={() => {
                    setUserDropdownOpen(false);
                    navigate("/member/membership");
                  }}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    color: "#344054",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                  }}
                >
                  <CreditCard size={16} /> Gói hội viên
                </div>

                <div style={{ height: 1, backgroundColor: "#f0f4f2", margin: "4px 0" }} />

                <div
                  onClick={() => {
                    setUserDropdownOpen(false);
                    handleLogout();
                  }}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    color: "#d92d20",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  <LogOut size={16} /> Đăng xuất
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY WITH SIDEBAR AND MAIN CONTENT */}
      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        {/* SIDEBAR */}
        <aside
          style={{
            width: 240,
            backgroundColor: "#ffffff",
            borderRight: "1px solid #e7ece9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "16px 12px",
            flexShrink: 0,
          }}
          className={`member-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        >
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#203d31" : "#4a5a52",
                    backgroundColor: isActive ? "#f1f8e9" : "transparent",
                    border: isActive ? "1px solid #d7eec4" : "1px solid transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={18}
                        color={isActive ? "#376228" : "#6c7d75"}
                        strokeWidth={isActive ? 2.3 : 1.8}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div style={{ paddingTop: 16, borderTop: "1px solid #f0f4f2" }}>
            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "transparent",
                color: "#d92d20",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <LogOut size={18} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* OVERLAY ON MOBILE */}
        {sidebarOpen && (
          <div
            style={{
              position: "fixed",
              top: 64,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.3)",
              zIndex: 30,
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* MAIN PAGE OUTLET */}
        <main
          style={{
            flex: 1,
            padding: "24px 32px",
            maxWidth: 1280,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
