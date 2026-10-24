/**
 * Hồ sơ chứng nhận HLV (CV) nằm ở bảng `Certification` (1–1 với CoachProfile).
 * API vẫn trả `coachProfile.cvUrl` + `coachProfile.approvalStatus` như trước để FE không phải sửa:
 * - include:  `coachProfile: COACH_PROFILE_WITH_CERT` (hoặc `include: { certification: true }`)
 * - trả về:   `withCvFields(coachProfile)` / `withUserCvFields(user)`
 */
export const COACH_PROFILE_WITH_CERT = { include: { certification: true as const } };

type CertLite = { fileUrl: string | null; status: string } | null;

/** Thêm `cvUrl`, `approvalStatus` (lấy từ Certification) vào CoachProfile. Chưa nộp CV ⇒ PENDING. */
export function withCvFields<T extends { certification: CertLite }>(profile: T) {
  return {
    ...profile,
    cvUrl: profile.certification?.fileUrl ?? null,
    approvalStatus: profile.certification?.status ?? "PENDING",
  };
}

/** Áp `withCvFields` cho `user.coachProfile` (nếu có). */
export function withUserCvFields<T extends { coachProfile: { certification: CertLite } | null }>(user: T) {
  return { ...user, coachProfile: user.coachProfile ? withCvFields(user.coachProfile) : null };
}

type RestrictionCandidate = {
  isActive: boolean;
  role: { name: string } | string;
  coachProfile?: { certification: { status: string } | null } | null;
};

/**
 * BE-9: "phiên giới hạn" — Coach đã đăng ký nhưng CV CHƯA được duyệt (chưa nộp / PENDING / REJECTED)
 * nên `isActive=false`. Được đăng nhập để xem/sửa hồ sơ và nộp CV; mọi API khác vẫn bị chặn.
 * Coach đã duyệt rồi bị khóa (certification APPROVED + isActive=false) KHÔNG thuộc nhóm này.
 */
export function isRestrictedCoach(user: RestrictionCandidate): boolean {
  const role = typeof user.role === "string" ? user.role : user.role.name;
  if (user.isActive || role !== "COACH") return false;
  return user.coachProfile?.certification?.status !== "APPROVED";
}
