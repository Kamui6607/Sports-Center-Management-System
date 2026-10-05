import type { RoleName } from "../utils/roles.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: RoleName;
      };
    }
  }
}
