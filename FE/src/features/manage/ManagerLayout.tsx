import { UserAvatar } from "../../components/UserAvatar";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity,
  Building2,
  CalendarDays,
  CalendarClock,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Dumbbell,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Menu,
  Landmark,
  Package,
  ReceiptText,
  Undo2,
  Banknote,
  Settings,
  Settings2,
  Store,
  UserRound,
  Users,
  UsersRound,
  WalletCards,
  ClipboardCheck,
} from "lucide-react";
import { IdCard, ScanLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProfileOk } from "../../shared/generated";
import { NotificationBell } from "../../shared/Communication";
import { Skeleton, num, PageErrorBoundary } from "./kit";
import { ThemeToggle, useThemePref } from "./theme";
import { GlobalSearch } from "./GlobalSearch";
import { fillRate, usePendingClasses, usePendingCv, useTodaySessions } from "./opsQueries";
import "./admin.css";
import "./motion.css";
import "./notifications.css";
import { managerNotificationLink } from "./notificationLinks";
import { RouteProgress } from "./RouteProgress";

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
const RefundsPage = lazy(() => import("./pages/RefundsPage"));
const WithdrawalsPage = lazy(() => import("./pages/WithdrawalsPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const CenterSettingsPage = lazy(() => import("./pages/CenterSettingsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const MembershipPlansPage = lazy(() => import("./pages/MembershipPlansPage"));
const MembershipsPage = lazy(() => import("./pages/MembershipsPage"));
const AttendancePenaltiesPage = lazy(() => import("./pages/AttendancePenaltiesPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));

type NavItem = [path: string, label: string, icon: LucideIcon];
type NavGroup = { title: string; icon: LucideIcon; items: NavItem[] };
const HOME: NavItem = ["dashboard", "Tổng quan", LayoutGrid];
const NAV: NavGroup[] = [
  {
    title: "Con người",
    icon: UsersRound,
    items: [
      ["users", "Người dùng", Users],
      ["coaches", "Huấn luyện viên", Dumbbell],
      ["terms", "Kỳ học & quyền lợi HLV", CalendarClock],
    ],
  },
  {
    title: "Đào tạo",
    icon: BookOpen,
    items: [
      ["classes", "Khóa học & lớp", GraduationCap],
      ["schedules", "Lịch học", CalendarDays],
      ["rooms", "Phòng tập", DoorOpen],
      ["attendance", "Chuyên cần & khiếu nại", ClipboardCheck],
    ],
  },
  {
    title: "Kinh doanh",
    icon: Store,
    items: [
      ["membership-plans", "Gói thành viên", IdCard],
      ["memberships", "Hội viên & thẻ", ScanLine],
      ["products", "Sản phẩm", Package],
      ["orders", "Đơn hàng", ReceiptText],
      ["revenue", "Doanh thu", WalletCards],
    ],
  },
  {
    title: "Tài chính",
    icon: Landmark,
    items: [
      ["refunds", "Hoàn tiền", Undo2],
      ["withdrawals", "Rút tiền HLV", Banknote],
    ],
  },
  { title: "Hệ thống", icon: Settings2, items: [["center", "Cài đặt trung tâm", Building2]] },
];

const SIDEBAR_KEY = "pulse.sidebar";
const GROUPS_KEY = "pulse.sidebar.groups";
const WIDE_QUERY = "(min-width: 901px)";

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Các nhóm menu người dùng đã mở — giữ lại giữa các lần tải trang. */
function readOpenGroups(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const isOn = (pathname: string, path: string) => pathname === `/manager/${path}` || pathname.startsWith(`/manager/${path}/`);

/** Chế độ "rail" (chỉ icon) chỉ dùng trên màn rộng; màn hẹp luôn là ngăn kéo đầy đủ. */
function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const m = matchMedia(WIDE_QUERY);
    const update = () => setWide(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return wide;
}

/** Mục cha (nhóm) thu gọn/mở được; ở chế độ rail chỉ hiện icon các mục con. */
function NavSection({ group, open, rail, active, onToggle }: { group: NavGroup; open: boolean; rail: boolean; active: boolean; onToggle: () => void }) {
  const listId = useId();
  const Icon = group.icon;
  const shown = open;
  return (
    <div className={"cr-group" + (shown ? " open" : "") + (active ? " has-active" : "")}>
      <button
        type="button"
        className="cr-group-btn"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rail ? group.title : undefined}
        title={rail ? group.title : undefined}
        onClick={onToggle}
      >
        <span className="cr-group-icon" aria-hidden="true">
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className="cr-group-label">{group.title}</span>
        {active && !open && <span className="cr-group-dot" title="Chứa trang đang mở" />}
        <ChevronRight size={16} strokeWidth={2.2} className="cr-group-chevron" aria-hidden="true" />
      </button>
      <div className="cr-sub" id={listId} inert={!shown}>
        <div className="cr-sub-inner">
          {group.items.map(([path, label, ItemIcon]) => (
            <NavLink key={path} to={`/manager/${path}`} className="cr-sub-link" title={rail ? label : undefined}>
              <ItemIcon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
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
        <UserAvatar name={user.fullName} url={user.avatarUrl} size={32} className="cr-avatar" />
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
  const wide = useWide();
  const rail = collapsed && wide;
  const sideId = useId();
  const activeGroup = NAV.find((g) => g.items.some(([p]) => isOn(pathname, p)));
  const found = [HOME, ...NAV.flatMap((g) => g.items)].find(([p]) => isOn(pathname, p));
  const section = found?.[1] ?? (pathname.startsWith("/manager/profile") ? "Tài khoản của tôi" : pathname.startsWith("/manager/notifications") ? "Thông báo" : "Quản trị");
  const [openGroups, setOpenGroups] = useState<string[]>(readOpenGroups);
  // Mặc định mở nhóm chứa trang đang xem (cả khi điều hướng sang nhóm khác).
  useEffect(() => {
    if (activeGroup) setOpenGroups((g) => (g.length === 1 && g[0] === activeGroup.title ? g : [activeGroup.title]));
  }, [activeGroup]);
  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups));
    } catch {
      /* bỏ qua khi storage bị chặn */
    }
  }, [openGroups]);
  const toggleGroup = (title: string) =>
    setOpenGroups((g) => (g.includes(title) ? [] : [title]));
  // Thanh bên thu gọn (rail): mọi nhóm thu lại; bấm icon cha chỉ bung nhóm đó (không đổi trạng thái của chế độ mở rộng).
  const [railGroup, setRailGroup] = useState<string | null>(null);
  useEffect(() => setRailGroup(null), [rail]);
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
  function toggleCollapsed() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, v ? "expanded" : "collapsed");
      } catch {
        /* bỏ qua khi storage bị chặn */
      }
      return !v;
    });
  }

  const pages = [HOME, ...NAV.flatMap((g) => g.items)].map(([path, label, icon]) => ({ path, label, icon }));
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <div className={"cr" + (rail ? " collapsed" : "")}>
      <a className="skip-link" href="#cr-main">
        Đến nội dung chính
      </a>
      {open && <button className="cr-scrim" aria-label="Đóng menu" onClick={() => setOpen(false)} />}
      <div className="cr-side-wrap">
      <aside id={sideId} className={"cr-side" + (open ? " open" : "")} aria-label="Điều hướng quản trị">
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
          <NavLink to={`/manager/${HOME[0]}`} className="cr-top-link" title={rail ? HOME[1] : undefined}>
            <span className="cr-group-icon" aria-hidden="true">
              <LayoutGrid size={17} strokeWidth={2} />
            </span>
            <span className="cr-group-label">{HOME[1]}</span>
          </NavLink>
          {NAV.map((g) => (
            <NavSection
              key={g.title}
              group={g}
              rail={rail}
              open={rail ? railGroup === g.title : openGroups.includes(g.title)}
              active={activeGroup === g}
              onToggle={() => (rail ? setRailGroup((t) => (t === g.title ? null : g.title)) : toggleGroup(g.title))}
            />
          ))}
        </nav>
        <div className="cr-side-foot">
          <NavLink to="/manager/profile" className={({ isActive }) => "cr-side-link" + (isActive ? " active" : "")} title={rail ? "Cài đặt tài khoản" : undefined}>
            <Settings size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>Cài đặt tài khoản</span>
          </NavLink>
          <button
            type="button"
            className="cr-side-link logout"
            disabled={loggingOut}
            title={rail ? "Đăng xuất" : undefined}
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
        {/* Nút tròn nằm đè lên đường kẻ ngăn sidebar / nội dung, căn giữa theo chiều dọc. */}
        <button
          type="button"
          className="cr-side-toggle"
          onClick={toggleCollapsed}
          aria-controls={sideId}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          title={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>
      </div>
      <div className="cr-main">
        <header className="cr-top">
          <button className="cr-round cr-burger" aria-label="Mở menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={18} />
          </button>
          <GlobalSearch pages={pages} />
          <div className="cr-top-actions">
            <ThemeToggle />
            <NotificationBell allHref="/manager/notifications" linkFor={managerNotificationLink} />
            <span className="cr-top-sep" aria-hidden="true" />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </header>
        <RouteProgress />
        <main id="cr-main" className="cr-content" tabIndex={-1}>
          <PageErrorBoundary resetKey={pathname}>
          <Suspense fallback={<Skeleton rows={8} />}>
            {/* key theo đường dẫn ⇒ mỗi trang mới chạy hiệu ứng vào (motion.css `.cr-page`). */}
            <div className="cr-page" key={pathname}>
            <Routes>
              <Route path="/manager/dashboard" element={<Dashboard user={user} />} />
              <Route path="/manager/users" element={<UsersPage selfId={user.id} />} />
              <Route path="/manager/users/:id" element={<UserDetail selfId={user.id} />} />
              <Route path="/manager/coaches" element={<CoachesPage />} />
              <Route path="/manager/coaches/:id" element={<CoachDetail />} />
              <Route path="/manager/terms" element={<TermsPage />} />
              <Route path="/manager/rooms" element={<RoomsPage />} />
              <Route path="/manager/rooms/:id" element={<RoomDetail />} />
              <Route path="/manager/classes" element={<ClassesPage />} />
              <Route path="/manager/classes/:id" element={<ClassDetail />} />
              <Route path="/manager/schedules" element={<SchedulesPage />} />
              <Route path="/manager/products" element={<ProductsPage />} />
              <Route path="/manager/products/:id" element={<ProductDetail />} />
              <Route path="/manager/revenue" element={<RevenuePage />} />
              <Route path="/manager/orders" element={<OrdersPage />} />
              <Route path="/manager/refunds" element={<RefundsPage />} />
              <Route path="/manager/withdrawals" element={<WithdrawalsPage />} />
              <Route path="/manager/center" element={<CenterSettingsPage />} />
              <Route path="/manager/membership-plans" element={<MembershipPlansPage />} />
              <Route path="/manager/memberships" element={<MembershipsPage />} />
              <Route path="/manager/attendance" element={<AttendancePenaltiesPage />} />
              <Route path="/manager/reports" element={<Navigate replace to="/manager/revenue" />} />
              <Route path="/manager/profile" element={<ProfilePage user={user} />} />
              <Route path="/manager/notifications" element={<NotificationsPage />} />
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
            </div>
          </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
