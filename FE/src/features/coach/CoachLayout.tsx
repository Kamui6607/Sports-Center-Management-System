import { CoachFeedback } from "../../shared/CoachFeedback";
import { Route, Routes } from "react-router-dom";
import type { PortalProps } from "../../app/RoleRouter";
import { PortalLayout } from "../../shared/PortalLayout";
import { Placeholder } from "../../shared/Placeholder";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  UserRound,
} from "lucide-react";
import { CoachWorkspace } from "./CoachWorkspace";
import { CoachProfile } from "./CoachProfile";
import { idOf, type Row } from "./data";
import "./coach.css";
const items = [
  ["dashboard", "Tổng quan huấn luyện viên", LayoutDashboard],
  ["schedule", "Lịch dạy", CalendarDays],
  ["classes", "Lớp phụ trách", BookOpen],
  ["profile", "Tài khoản", UserRound],
  ["feedback", "Đánh giá của hội viên", UserRound],
] as const;
export function CoachLayout(props: PortalProps) {
  const coachId = idOf((props.user as unknown as Row).coachProfile);
  return (
    <PortalLayout
      {...props}
      title="Huấn luyện viên"
      base="/coach"
      items={items}
    >
      <Routes>
        <Route
          path="/coach/feedback"
          element={
            coachId ? (
              <CoachFeedback coachId={coachId} role="COACH" />
            ) : (
              <Placeholder title="Chưa có hồ sơ huấn luyện viên" />
            )
          }
        />
        {(["dashboard", "schedule", "classes"] as const).map((mode) => (
          <Route
            key={mode}
            path={"/coach/" + mode}
            element={
              <CoachWorkspace key={mode} coachId={coachId} mode={mode} />
            }
          />
        ))}
        <Route
          path="/coach/profile"
          element={<CoachProfile user={props.user} />}
        />
        <Route
          path="*"
          element={<Placeholder title="Không tìm thấy trang" />}
        />
      </Routes>
    </PortalLayout>
  );
}
