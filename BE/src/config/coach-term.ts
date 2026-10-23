/**
 * Ngưỡng & cấu hình "Coach đạt kỳ" (Doc/COACH_TERMS.md).
 * Tập trung một nơi — chỉnh số ở đây, không hard-code rải rác trong service.
 */
export const COACH_TERM = {
  /** 3 kỳ/năm dương lịch, mỗi kỳ 4 tháng (T1–4, T5–8, T9–12). */
  TERMS_PER_YEAR: 3,
  MONTHS_PER_TERM: 4,

  /** Số ngày ân hạn (kể từ đầu kỳ) để Coach có khóa học hợp lệ — Manager chỉnh được theo từng kỳ. */
  DEFAULT_GRACE_DAYS: 14,
  MAX_GRACE_DAYS: 60,

  /**
   * Khóa học "hợp lệ để đăng ký kỳ": PENDING/APPROVED/COMPLETED, đang bật, có tối thiểu số buổi chính
   * KHÔNG bị hủy nằm trong kỳ và các buổi trải rộng tối thiểu số ngày — chặn "khóa ma" 1–2 buổi.
   */
  MIN_MAIN_SESSIONS: 8,
  MIN_SPAN_DAYS: 28,

  /** Chốt cuối kỳ: tỷ lệ buổi đã dạy (COMPLETED) trên số buổi đến hạn. */
  MIN_COMPLETION_RATE: 0.9,
  /** Tỷ lệ buổi bị hủy tối đa trên tổng số buổi đã lên lịch trong kỳ. */
  MAX_CANCEL_RATE: 0.2,
  /** Buổi COMPLETED có học viên phải có bằng chứng dạy (điểm danh hoặc mã QR do Coach cấp). */
  MIN_EVIDENCE_RATE: 0.8,
  /** Mẫu tối thiểu (số buổi đến hạn) để cảnh báo "có nguy cơ" giữa kỳ. */
  MIN_SAMPLE_FOR_WARNING: 4,

  /** Nghỉ phép được duyệt chiếm ≥ tỷ lệ này của kỳ ⇒ miễn cả kỳ. */
  EXEMPT_LEAVE_SHARE: 0.5,
  /** Đơn nghỉ tối đa (ngày) và được nộp trước/sau tối đa bao nhiêu ngày so với hôm nay. */
  MAX_LEAVE_DAYS: 120,
  LEAVE_BACKDATE_DAYS: 14,

  /**
   * Chính sách kỳ liền sau kỳ NON_COMPLIANT: thẻ chỉ hợp lệ khi kỳ hiện tại đã COMPLIANT/EXEMPT
   * (không cho "hưởng" thêm 14 ngày ân hạn mỗi kỳ sau khi đã không đạt kỳ trước).
   */
  STRICT_AFTER_FAILED_TERM: true,

  /** Thẻ Coach: JWT sống ngắn (giây). Không dùng userId thô làm QR vì userId lộ trong dữ liệu khóa học công khai. */
  PASS_TTL_SECONDS: 60,

  /** Nhịp job nhắc/đánh giá (ms) và thời gian còn gửi kết quả sau khi kỳ kết thúc. */
  MAINTENANCE_INTERVAL_MS: 30 * 60 * 1000,
  RESULT_WINDOW_DAYS: 30,
} as const;

/**
 * Các bậc thông báo cho Coach (số tăng dần theo thời gian). Mỗi Coach × kỳ chỉ nhận bậc MỚI NHẤT đã đến hạn
 * và chưa gửi — bỏ lỡ nhiều bậc (VD server ngủ) thì không dồn thông báo.
 */
export const REMINDER_STAGE = {
  PRE_14: 1,
  PRE_7: 2,
  PRE_1: 3,
  START: 4,
  DEADLINE_7: 5,
  DEADLINE_1: 6,
  OVERDUE: 7,
  RESULT: 8,
} as const;

export type ReminderStage = (typeof REMINDER_STAGE)[keyof typeof REMINDER_STAGE];
