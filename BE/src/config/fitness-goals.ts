import type { TrainingLevel } from "@prisma/client";

/**
 * Danh mục MỤC TIÊU TẬP LUYỆN dùng chung (phạm vi Gym — Doc/GYM_SCOPE_CHANGES.md §9):
 * - Coach gắn 1–4 mục tiêu cho khóa (`Class.goalTags`).
 * - Member chọn tối đa 5 mục tiêu của mình (`MemberProfile.fitnessGoals`).
 * Hệ thống so khớp hai danh sách để báo khóa học có phù hợp với học viên hay không.
 */
export const FITNESS_GOALS = [
  { code: "WEIGHT_LOSS", label: "Giảm mỡ / giảm cân", description: "Đốt mỡ, kiểm soát cân nặng, cải thiện chỉ số cơ thể." },
  { code: "MUSCLE_GAIN", label: "Tăng cơ", description: "Phát triển khối cơ, tăng cân nạc." },
  { code: "STRENGTH", label: "Tăng sức mạnh", description: "Nâng mức tạ các bài compound (squat, deadlift, bench…)." },
  { code: "ENDURANCE", label: "Tăng sức bền", description: "Cải thiện tim mạch, thể lực, khả năng tập lâu." },
  { code: "BODY_SHAPING", label: "Săn chắc, cải thiện vóc dáng", description: "Định hình cơ thể, vòng eo – mông – tay săn chắc." },
  { code: "MOBILITY", label: "Linh hoạt & tư thế", description: "Giãn cơ, cải thiện biên độ khớp, chỉnh tư thế." },
  { code: "REHAB", label: "Phục hồi chấn thương", description: "Tập phục hồi chức năng an toàn, có hướng dẫn kỹ." },
  { code: "GENERAL_HEALTH", label: "Nâng cao sức khỏe tổng quát", description: "Duy trì sức khỏe, giảm stress, ngủ ngon hơn." },
  { code: "GYM_FOUNDATION", label: "Làm quen phòng gym", description: "Dành cho người mới: kỹ thuật cơ bản, dùng máy an toàn." },
  { code: "COMPETITION", label: "Chuẩn bị thi đấu thể hình", description: "Giáo án chuyên sâu cho vận động viên/thi đấu." },
] as const;

export type FitnessGoalCode = (typeof FITNESS_GOALS)[number]["code"];

export const FITNESS_GOAL_CODES = FITNESS_GOALS.map((g) => g.code) as [FitnessGoalCode, ...FitnessGoalCode[]];

export const MAX_CLASS_GOALS = 4;
export const MAX_MEMBER_GOALS = 5;

/** Bộ môn duy nhất của hệ thống (cột `Class.fitness` giữ để tương thích dữ liệu cũ). */
export const GYM_FITNESS = "Gym";

export function goalLabel(code: string): string {
  return FITNESS_GOALS.find((g) => g.code === code)?.label ?? code;
}

export type GoalMatchLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE" | "UNKNOWN";

export interface GoalMatch {
  /** 0–100. */
  score: number;
  level: GoalMatchLevel;
  /** Mục tiêu trùng giữa học viên và khóa. */
  matchedGoals: { code: string; label: string }[];
  /** Trình độ học viên khớp trình độ khóa (true nếu khóa không giới hạn trình độ). */
  levelMatched: boolean | null;
  /** Câu giải thích ngắn hiển thị cho học viên. */
  message: string;
}

/**
 * Độ phù hợp khóa ↔ học viên: 80% theo tỷ lệ mục tiêu trùng (trên số mục tiêu của học viên)
 * + 20% nếu trình độ khớp (hoặc khóa không giới hạn trình độ).
 */
export function computeGoalMatch(
  member: { fitnessGoals: string[]; trainingLevel: TrainingLevel | null } | null,
  cls: { goalTags: string[]; targetLevel: TrainingLevel | null }
): GoalMatch {
  const memberGoals = member?.fitnessGoals ?? [];
  if (memberGoals.length === 0) {
    return {
      score: 0,
      level: "UNKNOWN",
      matchedGoals: [],
      levelMatched: null,
      message: "Cập nhật mục tiêu tập luyện trong hồ sơ để xem khóa học có phù hợp với bạn không.",
    };
  }
  const matched = memberGoals.filter((g) => cls.goalTags.includes(g));
  const levelMatched = !cls.targetLevel || !member?.trainingLevel ? !cls.targetLevel : cls.targetLevel === member.trainingLevel;
  const score = Math.round((matched.length / memberGoals.length) * 80 + (levelMatched ? 20 : 0));
  const level: GoalMatchLevel = matched.length === 0 ? "NONE" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const matchedGoals = matched.map((code) => ({ code, label: goalLabel(code) }));
  const message =
    matched.length === 0
      ? "Khóa học chưa khớp mục tiêu tập luyện của bạn."
      : `Khớp ${matched.length}/${memberGoals.length} mục tiêu của bạn: ${matchedGoals.map((g) => g.label).join(", ")}` +
        (cls.targetLevel && levelMatched === false ? " (khác trình độ hiện tại của bạn)." : ".");
  return { score, level, matchedGoals, levelMatched, message };
}
