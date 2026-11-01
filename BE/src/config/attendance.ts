/**
 * Ngưỡng & cấu hình nghiệp vụ chuyên cần (Attendance → No-show → Warning → Penalty).
 * Tập trung một nơi để tránh hard-code rải rác trong service.
 */
export const ATTENDANCE = {
  /** Số schedule đã kết thúc gần nhất được đưa vào mẫu cho mỗi (member × class). */
  SAMPLE_WINDOW: 10,
  /** Mẫu tối thiểu; dưới ngưỡng này luôn là OK (không warning, không penalty). */
  MIN_SAMPLE: 5,
  /** rate >= 80% -> OK. */
  WARN_THRESHOLD: 80,
  /** 70% <= rate < 80% -> WARN; rate < 70% -> RELEASE. */
  RELEASE_THRESHOLD: 70,
  /** Thời hạn chặn đặt lại Class sau khi áp dụng penalty. */
  PENALTY_BLOCK_DAYS: 30,
  /** Cửa sổ hội viên được gửi khiếu nại (appeal). */
  APPEAL_WINDOW_HOURS: 72,
  /** Marker trên Attendance.note cho ABSENT do hệ thống tự tạo khi complete schedule. */
  SYSTEM_NO_SHOW_NOTE: "SYSTEM_NO_SHOW",
  /** Marker trên Attendance.note khi member tự điểm danh bằng QR (giữ nguyên semantics cũ). */
  QR_NOTE: "Tự động điểm danh qua QR",
  /** Marker trên Attendance.note khi member nhập mã dự phòng vì không quét được QR. */
  MANUAL_CODE_NOTE: "Điểm danh bằng mã dự phòng (nhập tay)",
  /** Marker trên Attendance.note khi HLV/quản lý quét thẻ thành viên của học viên tại lớp. */
  COACH_SCAN_NOTE: "HLV quét thẻ thành viên",
  /** HLV quét thẻ sau startTime quá số phút này ⇒ ghi LATE thay vì PRESENT. */
  LATE_AFTER_MINUTES: 10,
  /** Tiền tố Attendance.note của bản ghi EXCUSED do HỌC VIÊN tự báo vắng (phân biệt với EXCUSED do HLV/quản lý). */
  MEMBER_ABSENCE_NOTE_PREFIX: "Học viên báo vắng: ",
  /** Số lần báo vắng còn hiệu lực tối đa trong MỘT khóa đã mua (Doc/MAKEUP_ABSENCE_PLAN.md §3.1). */
  MEMBER_ABSENCE_MAX_PER_COURSE: 2,
  /** TTL của JWT trong mã QR (giây) — giữ nguyên hành vi hiện tại: 600s = 10 phút, FE tự refresh 55s. */
  QR_TTL_SECONDS: 600,
  /** TTL của mã dự phòng nhập tay (giây) — ngắn hơn QR để hạn chế chia sẻ. */
  MANUAL_CODE_TTL_SECONDS: 90,
  /**
   * Cửa sổ điểm danh do SERVER quyết định: member chỉ tự điểm danh được trong
   * [startTime − SCAN_OPEN_MINUTES_BEFORE phút, endTime + SCAN_CLOSE_MINUTES_AFTER phút]
   * và buổi học phải đang SCHEDULED. QR/mã sinh cho buổi ngoài cửa sổ cũng bị chặn.
   */
  SCAN_OPEN_MINUTES_BEFORE: 30,
  SCAN_CLOSE_MINUTES_AFTER: 30,
  /** Độ dài mã dự phòng. */
  MANUAL_CODE_LENGTH: 6,
  /** Alphabet mã dự phòng — bỏ 0/O/1/I để gõ tay không nhầm. */
  MANUAL_CODE_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  /** Một mã bị dùng KHÔNG thành công đủ số lần này → mã bị thu hồi (chống dò mã/lạm dụng). */
  MANUAL_CODE_MAX_ATTEMPTS: 5,
  /** Tổng số lần nhập mã sai tối đa của MỘT member trong cửa sổ bên dưới → chặn 429. */
  MEMBER_MANUAL_CODE_MAX_FAILURES: 10,
  /** Cửa sổ đếm lần nhập sai của member (phút). */
  MEMBER_MANUAL_CODE_WINDOW_MINUTES: 15,
} as const;

export type AttendanceBucketStatus = "OK" | "WARN" | "RELEASE";

/** Xếp loại theo rate (%) và kích thước mẫu — dùng chung cho report/preview/warning. */
export function classifyAttendance(attendanceRate: number, sampleSize: number): AttendanceBucketStatus {
  if (sampleSize < ATTENDANCE.MIN_SAMPLE) return "OK";
  if (attendanceRate >= ATTENDANCE.WARN_THRESHOLD) return "OK";
  if (attendanceRate >= ATTENDANCE.RELEASE_THRESHOLD) return "WARN";
  return "RELEASE";
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isSystemNoShow(note: string | null | undefined): boolean {
  return note === ATTENDANCE.SYSTEM_NO_SHOW_NOTE;
}

/** Bản ghi EXCUSED do học viên tự báo vắng? */
export function isMemberAbsence(note: string | null | undefined): boolean {
  return !!note && note.startsWith(ATTENDANCE.MEMBER_ABSENCE_NOTE_PREFIX);
}

/** Lý do học viên báo vắng (null nếu bản ghi không phải báo vắng của học viên). */
export function memberAbsenceReason(note: string | null | undefined): string | null {
  return isMemberAbsence(note) ? note!.slice(ATTENDANCE.MEMBER_ABSENCE_NOTE_PREFIX.length) : null;
}

/** Gắn cờ báo vắng cho bản ghi điểm danh trả về client. */
export function withAbsenceInfo<T extends { status: string; note: string | null }>(record: T) {
  const reason = record.status === "EXCUSED" ? memberAbsenceReason(record.note) : null;
  return { ...record, reportedByMember: reason !== null, absenceReason: reason };
}
