import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, LogOut, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSidebar } from "./useSidebar";
import { Brand } from "./Brand";
import type { ProfileOk } from "./generated";
import {
  Chat,
  FloatingChat,
  NotificationBell,
  Notifications,
} from "./Communication";
import { Policies } from "./Policies";
import { AttendanceShortcut } from "./AttendanceShortcut";
export type NavigationItem = readonly [
  path: string,
  name: string,
  icon?: LucideIcon,
];
export type NavigationGroup = {
  title: string;
  items: readonly NavigationItem[];
};
export function PortalLayout({
  user,
  onLogout,
  title,
  base,
  items,
  groups,
  children,
}: {
  user: ProfileOk["data"];
  onLogout: () => Promise<void>;
  title: string;
  base: string;
  items: readonly NavigationItem[];
  groups?: readonly NavigationGroup[];
  children: ReactNode;
}) {
  const { open, setOpen, mobile, sidebarRef, triggerRef } = useSidebar();
  const sidebarId = useId();
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigation = [
    ...(groups || [
      {
        title: "KHÔNG GIAN LÀM VIỆC",
        items: items.filter((i) => !["notifications", "chat"].includes(i[0])),
      },
    ]),
    {
      title: "KẾT NỐI",
      items: [["policies", "Chính sách sử dụng"]] as NavigationItem[],
    },
  ];
  const pageTitle =
    navigation
      .flatMap((g) => g.items)
      .find(
        ([path]) =>
          location.pathname === `${base}/${path}` ||
          location.pathname.startsWith(`${base}/${path}/`),
      )?.[1] || "Tài khoản";
  useEffect(() => {
    document.title = `${pageTitle} · Pulse Sports Center`;
  }, [pageTitle]);
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Đóng điều hướng"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id={sidebarId}
        inert={mobile && !open}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Điều hướng chính"
        className={"sidebar " + (open ? "is-open" : "")}
      >
        <Link to={base + "/dashboard"} className="brand-link">
          <Brand />
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="workspace-chip">
          <strong>{title}</strong>
        </div>
        <nav aria-label="Menu chính">
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <span>{group.title}</span>
              {group.items.map(([path, name, Icon = ChevronRight]) => (
                <NavLink key={path} to={base + "/" + path}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{name}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="logout"
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
            <LogOut size={18} />
            {busy ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
        </div>
      </aside>
      <div className="main-shell" inert={mobile && open}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              ref={triggerRef}
              aria-expanded={open}
              aria-controls={sidebarId}
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            <Link
              className="profile-link"
              to={base + "/profile"}
              aria-label={`Tài khoản của ${user.fullName}`}
            >
              <div>
                <strong>{user.fullName}</strong>
                <small>{title}</small>
              </div>
              <span className="avatar">{user.fullName.slice(0, 1)}</span>
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {location.pathname === `${base}/notifications` ? (
            <Notifications role={user.role} />
          ) : location.pathname === `${base}/chat` ? (
            <Chat userId={user.id} />
          ) : location.pathname === `${base}/policies` ? (
            <Policies role={user.role} />
          ) : (
            children
          )}
        </main>
        <footer className="main-footer">
          © {new Date().getFullYear()} Pulse Sports Center
        </footer>
      </div>
      <FloatingChat userId={user.id} />
      <AttendanceShortcut role={user.role} base={base} />
    </div>
  );
}
