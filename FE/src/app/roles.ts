export const roleHomes: Record<string, string> = {
  MANAGER: "/manager",
  COACH: "/coach",
  MEMBER: "/member",
};
export const roleHome = (role: string) =>
  Object.hasOwn(roleHomes, role) ? roleHomes[role] : undefined;
