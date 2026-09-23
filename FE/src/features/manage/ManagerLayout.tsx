import { Link, Navigate, Route, Routes } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  Volleyball,
  Warehouse,
  ClipboardList,
  ContactRound,
} from "lucide-react";
import type { ProfileOk } from "../../shared/generated";
import { PortalLayout } from "../../shared/PortalLayout";
import type { NavigationGroup } from "../../shared/PortalLayout";
import { resources } from "./config";
import { Dashboard } from "./Dashboard";
import { ResourcePage } from "./ResourcePage";
import { Profile } from "../../shared/Profile";
import { MembershipPage } from "../reception/membership/MembershipPage";
import { PaymentsPage } from "../reception/payments/PaymentsPage";
import { ClassesPage } from "../reception/classes/ClassesPage";
const navGroups: NavigationGroup[] = [
  { title: "TỔNG QUAN", items: [["dashboard", "Tổng quan", LayoutDashboard]] },
  {
    title: "CON NGƯỜI",
    items: [
      ["users", "Người dùng", Users],
      ["members", "Hội viên", ContactRound],
      ["coaches", "Huấn luyện viên", Dumbbell],
      ["staff", "Đội ngũ lễ tân", UserRound],
    ],
  },
  {
    title: "VẬN HÀNH",
    items: [
      ["membership-plans", "Gói thành viên", CreditCard],
      ["sports", "Bộ môn", Volleyball],
      ["rooms", "Phòng tập", Warehouse],
      ["classes", "Lớp học", Trophy],
      ["schedules", "Lịch hoạt động", CalendarDays],
      ["membership", "Đăng ký & gia hạn gói", CreditCard],
      ["payments", "Thanh toán & hóa đơn", CreditCard],
      ["bookings", "Đăng ký lớp", CalendarDays],
    ],
  },
  {
    title: "QUẢN TRỊ",
    items: [
      ["reports", "Báo cáo & phân tích", ChartNoAxesCombined],
      ["roles", "Vai trò & quyền hạn", ShieldCheck],
      ["audit-logs", "Nhật ký hoạt động", ClipboardList],
    ],
  },
];

export function ManagerLayout({
  user,
  onLogout,
}: {
  user: ProfileOk["data"];
  onLogout: () => Promise<void>;
}) {
  return (
    <PortalLayout
      user={user}
      onLogout={onLogout}
      title="Quản lý trung tâm"
      base="/manager"
      items={[]}
      groups={navGroups}
    >
      <Routes>
        <Route path="/manager/dashboard" element={<Dashboard />} />
        <Route path="/manager/reports" element={<Dashboard reports />} />
        <Route
          path="/manager/membership"
          element={<MembershipPage role="MANAGER" />}
        />
        <Route
          path="/manager/payments"
          element={<PaymentsPage role="MANAGER" />}
        />
        <Route path="/manager/bookings" element={<ClassesPage />} />
        {resources.map((r) => (
          <Route
            key={r.slug}
            path={"/manager/" + r.slug}
            element={
              <ResourcePage key={r.slug} resource={r} userId={user.id} />
            }
          />
        ))}
        <Route path="/manager/profile" element={<Profile user={user} />} />
        <Route path="/manager/roles" element={<Unavailable type="roles" />} />
        <Route
          path="/manager/audit-logs"
          element={<Unavailable type="audit" />}
        />
        <Route
          path="/"
          element={<Navigate replace to="/manager/dashboard" />}
        />
        <Route
          path="/login"
          element={<Navigate replace to="/manager/dashboard" />}
        />
        <Route
          path="*"
          element={
            <div className="fullscreen">
              <h1>Không tìm thấy trang</h1>
              <Link className="button primary" to="/manager/dashboard">
                Về tổng quan
              </Link>
            </div>
          }
        />
      </Routes>
    </PortalLayout>
  );
}
function Unavailable({ type }: { type: "roles" | "audit" }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUẢN TRỊ HỆ THỐNG</div>
          <h1>
            {type === "roles" ? "Vai trò & quyền hạn" : "Nhật ký hoạt động"}
          </h1>
          <p>
            {type === "roles"
              ? "Quyền truy cập gắn với vai trò của từng tài khoản."
              : "Theo dõi các thay đổi quan trọng tại trung tâm."}
          </p>
        </div>
      </div>
      {type === "roles" && (
        <div className="role-grid">
          {[
            ["MANAGER", "Quản lý trung tâm"],
            ["COACH", "Huấn luyện viên"],
            ["MEMBER", "Hội viên"],
            ["STAFF", "Lễ tân"],
          ].map(([key, name]) => (
            <section className="panel role-card" key={key}>
              <ShieldCheck />
              <h3>{name}</h3>
              <code>{key}</code>
            </section>
          ))}
        </div>
      )}
      <section className="panel unavailable">
        <span className="unavailable-icon">
          <ShieldCheck size={30} />
        </span>
        <h2>
          {type === "roles"
            ? "Chưa hỗ trợ tùy chỉnh quyền"
            : "Nhật ký chưa khả dụng"}
        </h2>
        <p>
          {type === "roles"
            ? "Backend hiện cung cấp bốn vai trò cố định. Chưa có API đọc hoặc thay đổi quyền chi tiết cho từng vai trò."
            : "Backend hiện chưa cung cấp API nhật ký hoạt động để hiển thị dữ liệu tại đây."}
        </p>
        <Link
          className="button"
          to={type === "roles" ? "/manager/users" : "/manager/dashboard"}
        >
          {type === "roles" ? "Quản lý tài khoản" : "Về tổng quan"}
          <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}
