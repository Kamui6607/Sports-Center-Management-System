import { lazy, Suspense } from "react";
import { Loading } from "../shared/ui";
import { Navigate, useLocation, Link } from "react-router-dom";
import type { ProfileOk } from "../shared/generated";
import { roleHome } from "./roles";
const ManagerLayout = lazy(() =>
  import("../features/manage/ManagerLayout").then((module) => ({
    default: module.ManagerLayout,
  })),
);
const ReceptionLayout = lazy(() =>
  import("../features/reception/ReceptionLayout").then((module) => ({
    default: module.ReceptionLayout,
  })),
);
const CoachLayout = lazy(() =>
  import("../features/coach/CoachLayout").then((module) => ({
    default: module.CoachLayout,
  })),
);
const UserLayout = lazy(() =>
  import("../features/user/UserLayout").then((module) => ({
    default: module.UserLayout,
  })),
);
export type PortalProps = {
  user: ProfileOk["data"];
  onLogout: () => Promise<void>;
};
export function RoleRouter(props: PortalProps) {
  const { pathname, search, hash } = useLocation();
  const home = roleHome(props.user.role);
  if (
    props.user.role === "MEMBER" &&
    (pathname === "/user" || pathname.startsWith("/user/"))
  )
    return (
      <Navigate
        replace
        to={pathname.replace(/^\/user/, "/member") + search + hash}
      />
    );
  if (["/", "/login", "/register", home, home + "/"].includes(pathname))
    return <Navigate replace to={home + "/dashboard"} />;
  if (pathname !== home && !pathname.startsWith(home + "/"))
    return (
      <div className="fullscreen">
        <h1>Không có quyền truy cập</h1>
        <p>Trang này không thuộc vai trò của bạn.</p>
        <Link className="button primary" to={home + "/dashboard"}>
          Về không gian của tôi
        </Link>
        <button className="button" onClick={props.onLogout}>
          Đăng xuất
        </button>
      </div>
    );
  return (
    <Suspense
      fallback={
        <div className="fullscreen">
          <Loading variant="page" />
        </div>
      }
    >
      <Portal {...props} />
    </Suspense>
  );
}
function Portal(props: PortalProps) {
  switch (props.user.role) {
    case "MANAGER":
      return <ManagerLayout {...props} />;
    case "STAFF":
      return <ReceptionLayout {...props} />;
    case "COACH":
      return <CoachLayout {...props} />;
    default:
      return <UserLayout {...props} />;
  }
}
