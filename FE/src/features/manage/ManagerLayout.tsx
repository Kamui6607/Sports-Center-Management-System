import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  CalendarClock,
  ChevronDown,
  DoorOpen,
  Dumbbell,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProfileOk } from "../../shared/generated";
import { NotificationBell } from "../../shared/Communication";
import { Skeleton, num } from "./kit";
import { ThemeToggle, useThemePref } from "./theme";
import { GlobalSearch } from "./GlobalSearch";
import { fillRate, usePendingClasses, usePendingCv, useTodaySessions } from "./opsQueries";
import "./admin.css";

const Dashboard = lazy(() => import("./pages/DashboardPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const UserDetail = lazy(() => import("./pages/UserDetailPage"));
const CoachesPage = lazy(() => import("./pages/CoachesPage"));
const CoachDetail = lazy(() => import("./pages/CoachDetailPage"));
const RoomsPage = lazy(() => import("./pages/RoomsPage"));
const RoomDetail = lazy(() => import("./pages/RoomDetailPage"));
const ClassesPage = lazy(() => import("./pages/ClassesPage"));
const ClassDetail = lazy(() => import("./pages/ClassDetailPage"));
const SchedulesPage = lazy(() => import("./pages/SchedulesPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const ProductDetail = lazy(() => import("./pages/ProductDetailPage"));
const RevenuePage = lazy(() => import("./pages/RevenuePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

type NavItem = [path: string, label: string, icon: LucideIcon];
const NAV: { title: string; items: NavItem[] }[] = [
  { title: "", items: [["dashboard", "Tổng quan", LayoutGrid]] },
  {
    title: "Con người",
    items: [
      ["users", "Người dùng", Users],
      ["coaches", "Huấn luyện viên", Dumbbell],
    ],
  },
  {
    title: "Đào tạo",
    items: [
      ["classes", "Khóa học & lớp", GraduationCap],
      ["schedules", "Lịch học", CalendarDays],
      ["rooms", "Phòng tập", DoorOpen],
    ],
  },
  {
    title: "Kinh doanh",
    items: [
      ["products", "Sản phẩm", Package],
      ["revenue", "Doanh thu", WalletCards],
    ],
  },
];

function readCollapsed() {
  try {
    return localStorage.getItem("pulse.sidebar") === "collapsed";
  } catch {
    return false;
  }
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** Thẻ "Hôm nay" cuối sidebar: số buổi, tỷ lệ lấp đầy, việc chờ duyệt — dữ liệu thật, dùng chung cache với Tổng quan. */
function TodayCard() {
  const sessions = useTodaySessions();
  const cv = usePendingCv();
  const classes = usePendingClasses();
  const rows = sessions.data?.data ?? [];
  const live = rows.filter((s) => s.status !== "CANCELLED");
  const fill = fillRate(rows);
  const pending = (cv.data?.pagination?.total ?? 0) + (classes.data?.pagination?.total ?? 0);
  const date = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" });
  return (
    <div className="cr-today">
      <div className="cr-today-head">
        <div>
          <small>Hôm nay</small>
          <strong>{date.replace(/^./, (c) => c.toUpperCase())}</strong>
        </div>
        <span aria-hidden="true">
          <CalendarClock size={16} />
        </span>
      </div>
      <div className="cr-today-stats">
        {sessions.isError ? (
          <span>Chưa tải được lịch hôm nay.</span>
        ) : (
          <>
            <span>
              <b>{sessions.data ? num(live.length) : "…"}</b> buổi học
              {fill.pct != null && (
                <>
                  {" "}
                  · lấp đầy <b>{fill.pct}%</b>
                </>
              )}
            </span>
            <span>
              <b>{cv.data && classes.data ? num(pending) : "…"}</b> mục chờ duyệt
            </span>
          </>
        )}
      </div>
      <Link className="cr-btn sm" to="/manager/schedules">
        Mở lịch học
      </Link>
    </div>
  );
}

function UserMenu({ user, onLogout }: { user: ProfileOk["data"]; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="cr-menu" ref={root}>
      <button className="cr-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="cr-avatar" aria-hidden="true">{initials(user.fullName)}</span>
        <span className="cr-menu-name">
          {user.fullName}
          <small>Quản lý trung tâm</small>
        </span>
        <ChevronDown size={15} className="cr-subtle" aria-hidden="true" />
      </button>
      {open && (
        <div className="cr-menu-pop" role="menu">
          <div className="cr-menu-head">
            <strong>{user.fullName}</strong>
            <small>{user.email} · Quản lý</small>
          </div>
          <Link className="cr-menu-item" role="menuitem" to="/manager/profile">
            <UserRound size={16} /> Tài khoản & giao diện
          </Link>
          <button
            className="cr-menu-item danger"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onLogout();
              } finally {
                setBusy(false);
              }
            }}
          >
            <LogOut size={16} /> {busy ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ManagerLayout({ user, onLogout }: { user: ProfileOk["data"]; onLogout: () => Promise<void> }) {
  const { pathname } = useLocation();
  useThemePref();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const found = NAV.flatMap((g) => g.items.map((i) => [g.title, ...i] as const)).find(
    ([, p]) => pathname === `/manager/${p}` || pathname.startsWith(`/manager/${p}/`),
  );
  const section = found?.[2] ?? (pathname.startsWith("/manager/profile") ? "Tài khoản của tôi" : "Quản trị");
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.title = `${section} · Pulse Manager`;
  }, [section]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem("pulse.sidebar", v ? "expanded" : "collapsed");
      } catch {
        /* bỏ qua khi storage bị chặn */
      }
      return !v;
    });
  };

  const pages = NAV.flatMap((g) => g.items.map(([path, label, icon]) => ({ path, label, icon })));
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <div className={"cr" + (collapsed ? " collapsed" : "")}>
      <a className="skip-link" href="#cr-main">
        Đến nội dung chính
      </a>
      {open && <button className="cr-scrim" aria-label="Đóng menu" onClick={() => setOpen(false)} />}
      <aside className={"cr-side" + (open ? " open" : "")} aria-label="Điều hướng quản trị">
        <Link to="/manager/dashboard" className="cr-brand" title="Pulse — Quản lý trung tâm thể thao">
          <span className="cr-brand-mark" aria-hidden="true">
            <Activity size={19} strokeWidth={2.4} />
          </span>
          <span className="cr-brand-name">
            Pulse
            <small>Sports Center</small>
          </span>
        </Link>
        <nav className="cr-nav" aria-label="Menu chính">
          {NAV.map((g) => (
            <div key={g.title || "home"} style={{ display: "grid", gap: 2 }}>
              {g.title && <div className="cr-nav-title">{g.title}</div>}
              {g.items.map(([path, label, Icon]) => (
                <NavLink key={path} to={`/manager/${path}`} title={collapsed ? label : undefined}>
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="cr-side-foot">
          <NavLink to="/manager/profile" className={({ isActive }) => "cr-side-link" + (isActive ? " active" : "")} title={collapsed ? "Cài đặt tài khoản" : undefined}>
            <Settings size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>Cài đặt tài khoản</span>
          </NavLink>
          <button
            type="button"
            className="cr-side-link logout"
            disabled={loggingOut}
            title={collapsed ? "Đăng xuất" : undefined}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await onLogout();
              } finally {
                setLoggingOut(false);
              }
            }}
          >
            <LogOut size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
          </button>
          <TodayCard />
        </div>
      </aside>
      <div className="cr-main">
        <header className="cr-top">
          <button className="cr-round cr-burger" aria-label="Mở menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={18} />
          </button>
          <button
            className="cr-round cr-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            title={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <GlobalSearch pages={pages} />
          <div className="cr-top-actions">
            <ThemeToggle />
            <NotificationBell />
            <span className="cr-top-sep" aria-hidden="true" />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </header>
        <main id="cr-main" className="cr-content" tabIndex={-1}>
          <Suspense fallback={<Skeleton rows={8} />}>
            <Routes>
              <Route path="/manager/dashboard" element={<Dashboard user={user} />} />
              <Route path="/manager/users" element={<UsersPage selfId={user.id} />} />
              <Route path="/manager/users/:id" element={<UserDetail selfId={user.id} />} />
              <Route path="/manager/coaches" element={<CoachesPage />} />
              <Route path="/manager/coaches/:id" element={<CoachDetail />} />
              <Route path="/manager/rooms" element={<RoomsPage />} />
              <Route path="/manager/rooms/:id" element={<RoomDetail />} />
              <Route path="/manager/classes" element={<ClassesPage />} />
              <Route path="/manager/classes/:id" element={<ClassDetail />} />
              <Route path="/manager/schedules" element={<SchedulesPage />} />
              <Route path="/manager/products" element={<ProductsPage />} />
              <Route path="/manager/products/:id" element={<ProductDetail />} />
              <Route path="/manager/revenue" element={<RevenuePage />} />
              <Route path="/manager/reports" element={<Navigate replace to="/manager/revenue" />} />
              <Route path="/manager/profile" element={<ProfilePage user={user} />} />
              <Route path="/manager" element={<Navigate replace to="/manager/dashboard" />} />
              <Route path="/" element={<Navigate replace to="/manager/dashboard" />} />
              <Route
                path="*"
                element={
                  <div className="cr-state">
                    <h3>Không tìm thấy trang</h3>
                    <p>Đường dẫn này không thuộc khu vực quản trị.</p>
                    <Link className="cr-btn primary" to="/manager/dashboard">
                      Về tổng quan
                    </Link>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
