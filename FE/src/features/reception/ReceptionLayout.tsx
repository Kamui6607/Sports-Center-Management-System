import { Routes, Route } from "react-router-dom";
import type { PortalProps } from "../../app/RoleRouter";
import { PortalLayout } from "../../shared/PortalLayout";
import { Profile } from "../../shared/Profile";
import { Placeholder } from "../../shared/Placeholder";
import { DashboardPage } from "./dashboard/DashboardPage";
import { MembersPage, CreateMemberPage } from "./members/MembersPage";
import { MembershipPage } from "./membership/MembershipPage";
import { ClassesPage } from "./classes/ClassesPage";
import { PaymentsPage } from "./payments/PaymentsPage";
const items = [
  ["dashboard", "Tổng quan"],
  ["members", "Hội viên"],
  ["membership", "Gói thành viên"],
  ["classes", "Đăng ký lớp"],
  ["checkin", "Điểm danh"],
  ["payments", "Thanh toán & hóa đơn"],
  ["support", "Yêu cầu hỗ trợ"],
] as const;
export function ReceptionLayout(props: PortalProps) {
  return (
    <PortalLayout {...props} title="Lễ tân" base="/receptionist" items={items}>
      <Routes>
        <Route path="/receptionist/dashboard" element={<DashboardPage />} />
        <Route path="/receptionist/members" element={<MembersPage />} />
        <Route
          path="/receptionist/members/create"
          element={<CreateMemberPage />}
        />
        <Route path="/receptionist/membership" element={<MembershipPage />} />
        <Route path="/receptionist/classes" element={<ClassesPage />} />
        <Route path="/receptionist/payments" element={<PaymentsPage />} />
        <Route
          path="/receptionist/checkin"
          element={
            <Placeholder
              title="Điểm danh hội viên"
              description="Chức năng điểm danh đang chờ kết nối hệ thống. Vui lòng thực hiện theo quy trình tại quầy."
            />
          }
        />
        <Route
          path="/receptionist/support"
          element={
            <Placeholder
              title="Yêu cầu hỗ trợ"
              description="Chức năng ghi nhận và theo dõi yêu cầu hỗ trợ đang chờ kết nối hệ thống."
            />
          }
        />
        <Route
          path="/receptionist/profile"
          element={<Profile user={props.user} />}
        />
        <Route
          path="*"
          element={<Placeholder title="Không tìm thấy trang" />}
        />
      </Routes>
    </PortalLayout>
  );
}
