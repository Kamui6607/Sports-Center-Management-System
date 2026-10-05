/**
 * Vai trò người dùng — lưu ở bảng `Role` (User.roleId → Role.id), tra theo `Role.name`.
 * 3 vai trò hệ thống được tạo sẵn bởi migration `20261005010000_role_table` và `prisma/seed.ts`.
 *
 * Quy ước dùng với Prisma:
 * - Lọc user theo vai trò:      `where: { role: { name: "COACH" } }`
 * - Lấy tên vai trò của user:   `select: { role: ROLE_NAME_SELECT }`  ⇒ `user.role.name`
 * - Gán vai trò khi tạo/sửa:     `data: { role: connectRole("MEMBER") }`
 * - Trả về cho FE:              `flattenRole(user)` ⇒ `role: "COACH"` (giữ nguyên định dạng API cũ)
 */
export const ROLES = ["MEMBER", "COACH", "MANAGER"] as const;
export type RoleName = (typeof ROLES)[number];

/** Lồng trong select/include của User để lấy đúng tên vai trò. */
export const ROLE_NAME_SELECT = { select: { name: true as const } };

/** Gán vai trò cho User theo tên (Role.name là UNIQUE). */
export function connectRole(name: RoleName) {
  return { connect: { name } };
}

/** `{ ...user, role: { name } }` ⇒ `{ ...user, role: "COACH" }` để response cho FE không đổi. */
export function flattenRole<T extends { role: { name: string } }>(user: T): Omit<T, "role"> & { role: RoleName } {
  const { role, ...rest } = user;
  return { ...rest, role: role.name as RoleName };
}
