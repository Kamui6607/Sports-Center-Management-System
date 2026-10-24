import type { RoleName } from "../utils/roles.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: RoleName;
        /** BE-9: Coach chưa được duyệt CV (isActive=false) — chỉ dùng được hồ sơ/CV. */
        restricted?: boolean;
      };
    }
  }
}
