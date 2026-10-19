import type { NextFunction, Request, Response } from "express";
import { z, type ZodErrorMap } from "zod";

/**
 * Tiếng Việt cho thông điệp trả về client (Doc/GYM_SCOPE_CHANGES.md §2):
 * - `localizeMessage`: dịch các thông điệp lỗi tiếng Anh cũ (khớp chính xác hoặc theo mẫu) — gọi ở `errorHandler`,
 *   nên code mới cứ viết thẳng tiếng Việt, code cũ không phải sửa từng chỗ.
 * - `viZodErrorMap`: lỗi validate (Zod) tiếng Việt.
 * - `normalizeUnicode`: chuẩn hoá NFC cho mọi chuỗi trong body/query (chữ có dấu gõ kiểu tổ hợp — NFD).
 */

const EXACT: Record<string, string> = {
  "A successful payment can only be refunded": "Chỉ hoàn được giao dịch đã thanh toán thành công.",
  "Active coach not found": "Không tìm thấy huấn luyện viên đang hoạt động.",
  "Amount must be positive": "Số tiền phải lớn hơn 0.",
  "Attachment file not found on storage": "Tệp đính kèm không còn trên máy chủ.",
  "Attachment not found": "Không tìm thấy tệp đính kèm.",
  "Attendance not found": "Không tìm thấy dữ liệu điểm danh.",
  "Avatar image content is invalid (jpeg, png, webp or gif)": "Nội dung ảnh không hợp lệ (chỉ nhận JPEG, PNG, WEBP, GIF).",
  "Avatar must be an image (jpeg, png, webp or gif)": "Ảnh đại diện phải là ảnh JPEG, PNG, WEBP hoặc GIF.",
  "Avatar image must be at most 5MB": "Ảnh đại diện tối đa 5MB.",
  "CV file not found on storage": "Tệp CV không còn trên máy chủ.",
  "CV file not found": "Không tìm thấy tệp CV.",
  "CV must be a PDF file.": "CV phải là tệp PDF.",
  "CV must be at most 10MB.": "CV tối đa 10MB.",
  "Cannot assign training plan: user is not an active MEMBER": "Chỉ giao lộ trình cho hội viên đang hoạt động.",
  "Cannot book a past class": "Không thể đặt buổi học đã bắt đầu.",
  "Cannot book class: user is not an active MEMBER": "Chỉ hội viên đang hoạt động mới được đặt lịch.",
  "Cannot cancel a completed schedule": "Không thể hủy buổi học đã hoàn thành.",
  "Cannot cancel enrollment for a past or ongoing class": "Không thể hủy buổi học đã hoặc đang diễn ra.",
  "Cannot change role: COACH is assigned to upcoming classes.": "Không thể đổi vai trò: HLV đang phụ trách khóa có lịch sắp tới.",
  "Cannot change role: MEMBER has upcoming booked classes. Cancel them first.":
    "Không thể đổi vai trò: hội viên còn buổi học sắp tới. Hãy hủy các buổi đó trước.",
  "Cannot change room/time when cancelling a schedule": "Không thể đổi phòng/giờ cùng lúc với hủy buổi học.",
  "Cannot change your own role": "Bạn không thể tự đổi vai trò của mình.",
  "Cannot checkout: user is not an active MEMBER": "Chỉ hội viên đang hoạt động mới được thanh toán.",
  "Cannot complete a cancelled schedule": "Không thể hoàn tất buổi học đã hủy.",
  "Cannot complete a schedule that has not ended yet": "Chỉ hoàn tất được buổi học sau giờ kết thúc.",
  "Cannot deactivate class with upcoming schedules": "Không thể ngừng khóa học còn lịch sắp tới.",
  "Cannot deactivate room with upcoming schedules": "Không thể ngừng phòng tập còn lịch sắp tới.",
  "Cannot deactivate your own account": "Bạn không thể tự khóa tài khoản của mình.",
  "Cannot edit a class that has already been reviewed by Manager": "Không thể sửa khóa học đã được Quản lý xét duyệt.",
  "Cannot enroll: user is not an active MEMBER": "Chỉ hội viên đang hoạt động mới được ghi danh.",
  "Cannot purchase: user is not an active MEMBER": "Chỉ hội viên đang hoạt động mới được mua.",
  "Cannot send messages to yourself": "Không thể tự nhắn tin cho chính mình.",
  "Cannot transfer enrollment for a past or ongoing class": "Không thể đổi buổi học đã hoặc đang diễn ra.",
  "Cannot transfer to a past class": "Không thể đổi sang buổi học đã diễn ra.",
  "Chat user not found or inactive": "Người nhận không tồn tại hoặc đã ngừng hoạt động.",
  "Class is inactive": "Khóa học đã ngừng hoạt động.",
  "Class is not yet approved": "Khóa học chưa được duyệt.",
  "Class not found or inactive": "Khóa học không tồn tại hoặc đã ngừng hoạt động.",
  "Class not found": "Không tìm thấy khóa học.",
  "Coach not found or inactive": "Huấn luyện viên không tồn tại hoặc đã ngừng hoạt động.",
  "Coach not found": "Không tìm thấy huấn luyện viên.",
  "Coach profile not found": "Không tìm thấy hồ sơ huấn luyện viên.",
  "Coach wallet not found": "Không tìm thấy ví HLV.",
  "Coach wallet not found. Please create a class first.": "Ví HLV chưa được tạo. Hãy mở khóa học trước.",
  "Current password is incorrect": "Mật khẩu hiện tại không đúng.",
  "Email is already in use": "Email đã được sử dụng.",
  "Enrollment not found": "Không tìm thấy chỗ đã đặt.",
  "Enrollment is no longer BOOKED (it may have been transferred or cancelled already)":
    "Chỗ đặt không còn hiệu lực (có thể đã được đổi hoặc hủy).",
  "Feedback not found": "Không tìm thấy đánh giá.",
  Forbidden: "Bạn không có quyền thực hiện thao tác này.",
  "Forbidden: insufficient permissions": "Bạn không có quyền thực hiện thao tác này.",
  "Forbidden: Coaches cannot book classes for members": "HLV không được đặt lịch thay hội viên.",
  "Forbidden: Coaches cannot cancel member enrollments": "HLV không được hủy chỗ của hội viên.",
  "Forbidden: Coaches cannot transfer member enrollments": "HLV không được đổi buổi của hội viên.",
  "Forbidden: Coaches cannot view payment details": "HLV không được xem chi tiết giao dịch.",
  "Forbidden: You are not assigned to this class": "Bạn không phụ trách khóa học này.",
  "Forbidden: You can only cancel your own enrollments": "Bạn chỉ hủy được chỗ đặt của mình.",
  "Forbidden: You can only cancel your own orders": "Bạn chỉ hủy được đơn hàng của mình.",
  "Forbidden: You can only cancel your own refund requests": "Bạn chỉ hủy được yêu cầu hoàn tiền của mình.",
  "Forbidden: You can only change the coach of your own training plans": "Bạn chỉ đổi HLV được cho lộ trình của mình.",
  "Forbidden: You can only edit your own classes": "Bạn chỉ sửa được khóa học của mình.",
  "Forbidden: You can only manage your own training plans": "Bạn chỉ quản lý được lộ trình của mình.",
  "Forbidden: You can only operate on your own SePay payment": "Bạn chỉ thao tác được giao dịch của mình.",
  "Forbidden: You can only transfer your own enrollments": "Bạn chỉ đổi được buổi học của mình.",
  "Forbidden: You can only update your own profile": "Bạn chỉ cập nhật được hồ sơ của mình.",
  "Forbidden: You can only view progress of your own plans": "Bạn chỉ xem được tiến độ lộ trình của mình.",
  "Forbidden: You can only view your own classes": "Bạn chỉ xem được khóa học của mình.",
  "Forbidden: You can only view your own enrollments": "Bạn chỉ xem được lịch đặt của mình.",
  "Forbidden: You can only view your own payments": "Bạn chỉ xem được giao dịch của mình.",
  "Forbidden: You can only view your own progress": "Bạn chỉ xem được tiến độ của mình.",
  "Forbidden: You can only view your own training plans": "Bạn chỉ xem được lộ trình của mình.",
  "Forbidden: You do not have permission to manage training plans": "Bạn không có quyền quản lý lộ trình tập luyện.",
  "Forbidden: not your feedback": "Đây không phải đánh giá của bạn.",
  "Forbidden: only MEMBER or COACH can buy products": "Chỉ hội viên hoặc HLV được mua sản phẩm.",
  "Forbidden: only the owning MEMBER or MANAGER can operate on a SePay payment":
    "Chỉ chủ giao dịch hoặc Quản lý được thao tác giao dịch này.",
  "Invalid email or password": "Email hoặc mật khẩu không đúng.",
  "Invalid from datetime": "Thời điểm bắt đầu lọc không hợp lệ.",
  "Invalid or expired refresh token": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "Invalid or expired token": "Mã/liên kết không đúng hoặc đã hết hạn.",
  "Invalid startTime or endTime": "Giờ bắt đầu hoặc kết thúc không hợp lệ.",
  "Invalid to datetime": "Thời điểm kết thúc lọc không hợp lệ.",
  "Invalid JSON request body": "Dữ liệu gửi lên không đúng định dạng.",
  "Member is not actively enrolled in this schedule": "Hội viên không có chỗ trong buổi học này.",
  "Member not found": "Không tìm thấy hội viên.",
  "Member profile not found": "Không tìm thấy hồ sơ hội viên.",
  "Membership plan not found or inactive": "Gói thành viên không tồn tại hoặc đã ngừng bán.",
  "Membership plan not found": "Không tìm thấy gói thành viên.",
  "Message content is too long": "Tin nhắn quá dài.",
  "Message content or file is required": "Vui lòng nhập nội dung hoặc đính kèm tệp.",
  "New coach must be different from the current coach": "HLV mới phải khác HLV hiện tại.",
  "Notification not found": "Không tìm thấy thông báo.",
  "Only BOOKED enrollments can be cancelled": "Chỉ hủy được buổi đang giữ chỗ.",
  "Only BOOKED enrollments can be transferred": "Chỉ đổi được buổi đang giữ chỗ.",
  "Only PENDING orders can be cancelled": "Chỉ hủy được đơn đang chờ thanh toán.",
  "Only members can scan attendance QR codes": "Chỉ hội viên mới quét được QR điểm danh.",
  "Order not found": "Không tìm thấy đơn hàng.",
  "Payment not found": "Không tìm thấy giao dịch.",
  "Product not found": "Không tìm thấy sản phẩm.",
  "Record not found": "Không tìm thấy dữ liệu.",
  "Refresh token has been revoked": "Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.",
  "Refresh token has expired": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "Refresh token not found": "Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.",
  "Refund not found": "Không tìm thấy yêu cầu hoàn tiền.",
  "Room capacity is too small for this class": "Sức chứa phòng nhỏ hơn sĩ số tối đa của khóa.",
  "Room not found or inactive": "Phòng tập không tồn tại hoặc đã ngừng hoạt động.",
  "Room not found": "Không tìm thấy phòng tập.",
  "Room with this name already exists": "Tên phòng tập đã tồn tại.",
  "Schedule is already cancelled": "Buổi học đã bị hủy.",
  "Schedule is already completed": "Buổi học đã hoàn thành.",
  "Schedule not found": "Không tìm thấy buổi học.",
  "SePay payment not found": "Không tìm thấy giao dịch thanh toán.",
  "Target room must be different from source room": "Phòng đích phải khác phòng hiện tại.",
  "Target schedule is not available for booking": "Buổi đích không còn nhận đặt chỗ.",
  "Target schedule is the same as the current schedule": "Buổi đích trùng với buổi hiện tại.",
  "Target schedule not found": "Không tìm thấy buổi đích.",
  "Target schedule must belong to the same class as the current enrollment": "Buổi đích phải thuộc cùng khóa học.",
  "The change would violate a required relation": "Thay đổi vi phạm ràng buộc dữ liệu.",
  "This class has no upcoming sessions to enroll": "Khóa học không còn buổi nào sắp diễn ra để ghi danh.",
  "This class is full": "Buổi học đã hết chỗ.",
  "This schedule is not available for booking": "Buổi học không còn nhận đặt chỗ.",
  "Training plan not found": "Không tìm thấy lộ trình tập luyện.",
  "Training result not found": "Không tìm thấy kết quả buổi tập.",
  "Transaction is not a withdrawal": "Giao dịch này không phải lệnh rút tiền.",
  "Unauthorized: account is locked": "Tài khoản chưa được kích hoạt hoặc đã bị khóa.",
  "Use /class-schedules/:id/complete to complete a schedule": "Dùng chức năng Hoàn tất buổi học để kết thúc buổi.",
  "User not found or inactive": "Người dùng không tồn tại hoặc đã ngừng hoạt động.",
  "User not found": "Không tìm thấy người dùng.",
  "Wallet not found": "Không tìm thấy ví.",
  "Wallet transaction not found": "Không tìm thấy giao dịch ví.",
  "You are already enrolled in this class": "Bạn đã có chỗ trong buổi học này.",
  "You can only review products that you have successfully purchased.": "Bạn chỉ đánh giá được sản phẩm đã mua thành công.",
  "You cannot message this user": "Bạn không thể nhắn tin với người dùng này.",
  "You have already reviewed this product. Please update your existing review.": "Bạn đã đánh giá sản phẩm này.",
  "Your account has been deactivated": "Tài khoản chưa được kích hoạt hoặc đã bị khóa.",
  "classId is required": "Thiếu mã khóa học (classId).",
  "endTime must be strictly greater than startTime": "Giờ kết thúc phải sau giờ bắt đầu.",
  "memberId is required for manager booking": "Quản lý đặt lịch thay phải chọn hội viên.",
  "Internal server error": "Lỗi hệ thống. Vui lòng thử lại sau.",
  "Too many requests": "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
};

/** Mẫu có tham số: [regex, hàm dựng câu tiếng Việt]. */
const PATTERNS: [RegExp, (...g: string[]) => string][] = [
  [/^Duplicate value for: (.+)$/, (f) => (/phone/i.test(f) ? "Số điện thoại đã được sử dụng." : /email/i.test(f) ? "Email đã được sử dụng." : "Dữ liệu bị trùng.")],
  [/^Foreign key constraint failed on: (.+)$/, () => "Dữ liệu liên kết không tồn tại."],
  [/^Cannot update payment from (\w+) to (\w+)$/, (a, b) => `Không thể chuyển giao dịch từ ${a} sang ${b}.`],
  [/^Class is already (\w+) — cannot review again$/, () => "Khóa học đã được xét duyệt trước đó."],
  [/^Coach CV has already been (\w+)$/, () => "Hồ sơ CV đã được xét duyệt trước đó."],
  [/^Transaction is already (\w+)$/, () => "Giao dịch đã được xử lý trước đó."],
  [/^Invalid status: (.+)\. Allowed: (.+)$/, (a) => `Trạng thái không hợp lệ: ${a}.`],
  [/^You have a conflicting class "(.+)" at this time$/, (n) => `Bạn đã có lịch "${n}" trùng giờ này.`],
  [/^Class area type "(\w+)" does not match Room area type "(\w+)"$/, () => "Khu vực của phòng không phù hợp với khóa học."],
  [/^Cannot change (Class|Room) area type to .+$/, () => "Không thể đổi khu vực vì còn lịch sắp tới không phù hợp."],
  [/^Avatar upload to Cloudinary failed/, () => "Tải ảnh đại diện thất bại. Vui lòng thử lại."],
  [/^No CV file uploaded/, () => "Chưa chọn tệp CV (PDF)."],
  [/^Forbidden/, () => "Bạn không có quyền thực hiện thao tác này."],
  [/^Unauthorized/, () => "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."],
  [/ not found$/, () => "Không tìm thấy dữ liệu."],
];

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Thông điệp đã là tiếng Việt ⇒ giữ nguyên; tiếng Anh cũ ⇒ dịch (không khớp thì giữ nguyên). */
export function localizeMessage(message: string): string {
  if (!message || VI_CHARS.test(message)) return message;
  const exact = EXACT[message] ?? EXACT[message.trim()];
  if (exact) return exact;
  for (const [re, build] of PATTERNS) {
    const m = re.exec(message);
    if (m) return build(...m.slice(1));
  }
  return message;
}

/** Lỗi validate Zod bằng tiếng Việt (field error hiển thị thẳng dưới ô nhập). */
export const viZodErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: "Bắt buộc nhập" };
      if (issue.expected === "integer") return { message: "Phải là số nguyên" };
      return { message: "Kiểu dữ liệu không hợp lệ" };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") return { message: Number(issue.minimum) <= 1 ? "Bắt buộc nhập" : `Tối thiểu ${issue.minimum} ký tự` };
      if (issue.type === "array") return { message: `Chọn ít nhất ${issue.minimum} mục` };
      return { message: `Giá trị phải ${issue.inclusive ? "≥" : ">"} ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `Tối đa ${issue.maximum} ký tự` };
      if (issue.type === "array") return { message: `Chọn tối đa ${issue.maximum} mục` };
      return { message: `Giá trị phải ${issue.inclusive ? "≤" : "<"} ${issue.maximum}` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Email không hợp lệ" };
      if (issue.validation === "uuid") return { message: "Mã không hợp lệ" };
      if (issue.validation === "url") return { message: "Đường dẫn không hợp lệ" };
      if (issue.validation === "datetime") return { message: "Thời gian không hợp lệ" };
      return { message: ctx.defaultError.match(VI_CHARS) ? ctx.defaultError : "Định dạng không hợp lệ" };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: "Giá trị không nằm trong danh sách cho phép" };
    case z.ZodIssueCode.invalid_date:
      return { message: "Ngày không hợp lệ" };
    case z.ZodIssueCode.not_multiple_of:
      return { message: "Giá trị không hợp lệ" };
    case z.ZodIssueCode.unrecognized_keys:
      return { message: "Có trường không được hỗ trợ" };
    default:
      return { message: VI_CHARS.test(ctx.defaultError) ? ctx.defaultError : "Giá trị không hợp lệ" };
  }
};

function normalizeDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => normalizeDeep(v, depth + 1));
  if (Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalizeDeep(v, depth + 1);
  return out;
}

/** Chuẩn hoá NFC chữ tiếng Việt trong body (raw body của webhook không bị đụng tới). */
export function normalizeUnicode(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") req.body = normalizeDeep(req.body);
  next();
}

/** Bỏ dấu tiếng Việt + chữ thường — tìm kiếm không dấu. */
export function foldVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
