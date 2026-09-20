import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import type { PortalProps } from "../../app/RoleRouter";
import { PortalLayout } from "../../shared/PortalLayout";
import { Placeholder } from "../../shared/Placeholder";
import { Loading } from "../../shared/feedback";
import { MemberSessionProvider } from "../../context/AuthContext";
import type { User } from "../../types/member";
const Dashboard = lazy(() =>
  import("../../pages/member/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);
const Membership = lazy(() =>
  import("../../pages/member/MembershipPage").then((m) => ({
    default: m.MembershipPage,
  })),
);
const Classes = lazy(() =>
  import("../../pages/member/BrowseClassesPage").then((m) => ({
    default: m.BrowseClassesPage,
  })),
);
const ClassDetail = lazy(() =>
  import("../../pages/member/ClassDetailPage").then((m) => ({
    default: m.ClassDetailPage,
  })),
);
const MyClasses = lazy(() =>
  import("../../pages/member/MyClassesPage").then((m) => ({
    default: m.MyClassesPage,
  })),
);
const Schedule = lazy(() =>
  import("../../pages/member/SchedulePage").then((m) => ({
    default: m.SchedulePage,
  })),
);
const Profile = lazy(() =>
  import("../../pages/member/ProfilePage").then((m) => ({
    default: m.ProfilePage,
  })),
);
const Training = lazy(() =>
  import("../../pages/member/TrainingPage").then((m) => ({
    default: m.TrainingPage,
  })),
);
const Attendance = lazy(() =>
  import("../../pages/member/AttendancePage").then((m) => ({
    default: m.AttendancePage,
  })),
);
const Notifications = lazy(() =>
  import("../../pages/member/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const items = [
  ["dashboard", "Tổng quan hội viên"],
  ["membership", "Gói thành viên"],
  ["classes", "Khám phá lớp học"],
  ["my-classes", "Lớp của tôi"],
  ["schedule", "Lịch tập"],
  ["training", "Mục tiêu tập luyện"],
  ["attendance", "Điểm danh"],
  ["notifications", "Thông báo"],
  ["profile", "Tài khoản"],
] as const;
export function UserLayout(props: PortalProps) {
  return (
    <MemberSessionProvider
      user={props.user as unknown as User}
      onLogout={props.onLogout}
    >
      <PortalLayout {...props} title="Hội viên" base="/member" items={items}>
        <div className="member-content">
          <Suspense fallback={<Loading variant="page" />}>
            <Routes>
              <Route
                path="/member/dashboard"
                element={
                  <>
                    <h1 className="member-page-title">Tổng quan hội viên</h1>
                    <Dashboard />
                  </>
                }
              />
              <Route path="/member/membership" element={<Membership />} />
              <Route path="/member/classes" element={<Classes />} />
              <Route path="/member/classes/:id" element={<ClassDetail />} />
              <Route path="/member/my-classes" element={<MyClasses />} />
              <Route path="/member/schedule" element={<Schedule />} />
              <Route path="/member/training" element={<Training />} />
              <Route path="/member/attendance" element={<Attendance />} />
              <Route path="/member/notifications" element={<Notifications />} />
              <Route path="/member/profile" element={<Profile />} />
              <Route
                path="*"
                element={<Placeholder title="Không tìm thấy trang" />}
              />
            </Routes>
          </Suspense>
        </div>
      </PortalLayout>
    </MemberSessionProvider>
  );
}
