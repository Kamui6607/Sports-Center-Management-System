import { Route, Routes } from "react-router-dom";
import type { PortalProps } from "../../app/RoleRouter";
import { PortalLayout } from "../../shared/PortalLayout";
import { Placeholder } from "../../shared/Placeholder";
const items = [
  ["dashboard", "Tổng quan huấn luyện viên"],
  ["schedule", "Lịch dạy"],
  ["classes", "Lớp phụ trách"],
  ["profile", "Tài khoản"],
] as const;
export function CoachLayout(props: PortalProps) {
  return (
    <PortalLayout
      {...props}
      title="Huấn luyện viên"
      base="/coach"
      items={items}
    >
      <Routes>
        {items.map(([path, title]) => (
          <Route
            key={path}
            path={"/coach/" + path}
            element={<Placeholder title={title} />}
          />
        ))}
        <Route
          path="*"
          element={<Placeholder title="Không tìm thấy trang" />}
        />
      </Routes>
    </PortalLayout>
  );
}
