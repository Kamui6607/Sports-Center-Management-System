import { labels } from "./config";

type FieldError = { field: string; message: string };

const messages: Record<string, string> = {
  "user not found": "Không tìm thấy tài khoản.",
  "user not found or inactive":
    "Tài khoản không tồn tại hoặc đã ngừng hoạt động.",
  "class not found": "Không tìm thấy lớp học.",
  "coach not found": "Không tìm thấy huấn luyện viên.",
  "room not found": "Không tìm thấy phòng tập.",
  "sport not found": "Không tìm thấy bộ môn.",
  "refresh token not found":
    "Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.",
  "invalid or expired refresh token":
    "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
  "refresh token has been revoked":
    "Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.",
  "refresh token has expired":
    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "phone must not contain special characters":
    "Số điện thoại chỉ được chứa số và dấu +, -, ngoặc hoặc khoảng trắng.",
  "unauthorized: account is locked":
    "Tài khoản đã bị khóa. Vui lòng liên hệ trung tâm.",
  "unauthorized: role has changed, please login again":
    "Vai trò tài khoản đã thay đổi. Vui lòng đăng nhập lại.",
  "unauthorized: user not found":
    "Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.",
  "your account has been deactivated":
    "Tài khoản đã ngừng hoạt động. Vui lòng liên hệ trung tâm.",
  "current password is incorrect": "Mật khẩu hiện tại không chính xác.",
  "schedule not found": "Không tìm thấy lịch học.",
  "coach profile not found": "Không tìm thấy hồ sơ huấn luyện viên.",
  "forbidden: you are not assigned to this class":
    "Bạn chưa được phân công phụ trách lớp này.",
  "member is not actively enrolled in this schedule":
    "Hội viên chưa có đăng ký hợp lệ trong buổi học này.",
  "attendance not found": "Không tìm thấy bản ghi điểm danh.",
  "class not found or inactive": "Lớp không tồn tại hoặc đã ngừng hoạt động.",
  "room not found or inactive": "Phòng không tồn tại hoặc đã ngừng hoạt động.",
  "sport not found or inactive":
    "Bộ môn không tồn tại hoặc đã ngừng hoạt động.",
  "endtime must be strictly greater than starttime":
    "Thời gian kết thúc phải sau thời gian bắt đầu.",
  "room capacity is too small for this class":
    "Sức chứa phòng nhỏ hơn sĩ số tối đa của lớp.",
  "cannot complete a cancelled schedule": "Không thể hoàn tất buổi học đã hủy.",
  "cannot complete a schedule that has not ended yet":
    "Chỉ được hoàn tất buổi học sau giờ kết thúc.",
  "cannot deactivate class with upcoming schedules":
    "Không thể ngừng lớp đang có lịch học sắp tới.",
  "active coach not found": "Không tìm thấy huấn luyện viên đang hoạt động.",
  "coach assignment not found": "Không tìm thấy phân công huấn luyện viên.",
  "cannot book class: user is not an active member":
    "Chỉ hội viên đang hoạt động mới được đăng ký lớp.",
  "this schedule is not available for booking":
    "Lịch học này không còn mở đăng ký.",
  "cannot book a past class": "Không thể đăng ký buổi học đã bắt đầu.",
  "active membership required to book classes. please purchase a membership plan":
    "Bạn cần gói hội viên còn hiệu lực để đăng ký lớp. Vui lòng liên hệ quầy lễ tân.",
  "premium membership required to book this class":
    "Lớp này yêu cầu gói Premium còn hiệu lực.",
  "this class is full": "Lớp đã đủ số lượng học viên.",
  "you are already enrolled in this class": "Bạn đã đăng ký buổi học này.",
  "enrollment not found": "Không tìm thấy lượt đăng ký lớp.",
  "only booked enrollments can be cancelled":
    "Chỉ được hủy lượt đăng ký đang ở trạng thái đã đặt.",
  "cannot cancel enrollment for a past or ongoing class":
    "Không thể hủy đăng ký buổi học đã bắt đầu hoặc đã kết thúc.",
  "forbidden: you can only cancel your own enrollments":
    "Bạn chỉ được hủy lượt đăng ký của chính mình.",
  "forbidden: coaches cannot cancel member enrollments":
    "Huấn luyện viên không được hủy đăng ký của hội viên.",
  "forbidden: coaches cannot book classes for members":
    "Huấn luyện viên không được đăng ký lớp thay hội viên.",
  "member profile not found": "Không tìm thấy hồ sơ hội viên.",
  "member not found": "Không tìm thấy hội viên.",
  "subscription not found": "Không tìm thấy gói đã đăng ký.",
  "subscription belongs to a different member":
    "Gói đăng ký thuộc hội viên khác. Vui lòng chọn lại.",
  "payment not found": "Không tìm thấy thanh toán.",
  "invoice not found": "Không tìm thấy hóa đơn.",
  "notification not found": "Không tìm thấy thông báo.",
  "a successful payment can only be refunded":
    "Thanh toán thành công chỉ có thể chuyển sang trạng thái hoàn tiền.",
  "cannot deactivate plan with active subscriptions":
    "Không thể ngừng gói đang có hội viên sử dụng.",
  "cannot deactivate room with upcoming schedules":
    "Không thể ngừng phòng đang có lịch học sắp tới.",
  "cannot deactivate sport with active classes":
    "Không thể ngừng bộ môn đang có lớp hoạt động.",
  "cannot create subscription: user is not an active member":
    "Không thể đăng ký gói cho tài khoản không còn là hội viên hoạt động.",
  "cannot renew subscription: user is no longer an active member":
    "Không thể gia hạn cho tài khoản không còn là hội viên hoạt động.",
  "membership plan not found or inactive":
    "Gói tập không tồn tại hoặc đã ngừng bán.",
  "membership plan not found": "Không tìm thấy gói tập.",
  "cannot assign training plan: user is not an active member":
    "Chỉ được giao kế hoạch cho hội viên đang hoạt động.",
  "training plan not found": "Không tìm thấy kế hoạch tập luyện.",
  "forbidden: you can only manage your own training plans":
    "Bạn chỉ được quản lý kế hoạch do mình phụ trách.",
  "forbidden: you do not have permission to manage training plans":
    "Bạn không có quyền quản lý kế hoạch tập luyện.",
  "cannot deactivate your own account":
    "Bạn không thể tự khóa tài khoản đang đăng nhập.",
  "cannot change your own role":
    "Bạn không thể tự thay đổi vai trò đang sử dụng.",
  "cannot deactivate or demote the last active manager":
    "Phải giữ ít nhất một quản lý đang hoạt động trong hệ thống.",
  "cannot deactivate the last active manager":
    "Không thể khóa quản lý đang hoạt động cuối cùng.",
  "cannot change role: member has active subscriptions. cancel them first":
    "Hội viên còn gói ACTIVE. Hãy xử lý gói trước khi đổi vai trò.",
  "cannot change role: member has upcoming booked classes. cancel them first":
    "Hội viên còn lớp đã đặt. Hãy xử lý các lượt đăng ký trước khi đổi vai trò.",
  "cannot change role: coach is assigned to upcoming classes":
    "Huấn luyện viên còn lịch dạy sắp tới. Hãy điều chỉnh phân công trước khi đổi vai trò.",
  "a plan with this name already exists": "Tên gói tập đã được sử dụng.",
  "room with this name already exists": "Tên phòng đã được sử dụng.",
  "sport with this name already exists": "Tên bộ môn đã được sử dụng.",
  "validation failed":
    "Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường bên dưới.",
  "invalid email address": "Email không hợp lệ.",
  "invalid phone number": "Số điện thoại không hợp lệ.",
  "invalid credentials": "Email hoặc mật khẩu không chính xác.",
  "invalid email or password": "Email hoặc mật khẩu không chính xác.",
  "incorrect password": "Mật khẩu không chính xác.",
  "unauthorized: invalid or expired token":
    "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
  "forbidden: insufficient permissions":
    "Bạn không có quyền thực hiện thao tác này.",
  unauthorized: "Vui lòng đăng nhập để tiếp tục.",
  forbidden: "Bạn không có quyền thực hiện thao tác này.",
  "record not found": "Không tìm thấy dữ liệu được yêu cầu.",
  "internal server error": "Máy chủ gặp lỗi. Vui lòng thử lại sau.",
  "too many requests": "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
  "must be positive": "Giá trị phải lớn hơn 0.",
};

// Only infer a field from an explicit backend message, never from HTTP 409 alone.
function duplicateFields(message: string): string[] {
  const explicit = message.match(/^Duplicate value for:\s*(.+?)[.!]?$/i);
  if (explicit) return explicit[1].split(",").map((s) => s.trim());
  const named = message.match(
    /^(email|phone(?: number)?)\s+(?:already exists|exists|is already (?:in use|registered|taken)|already registered)[.!]?$/i,
  );
  return named
    ? [named[1].toLowerCase().startsWith("phone") ? "phone" : "email"]
    : [];
}

export function translateApiMessage(message: string, field?: string): string {
  const key = message.trim().replace(/[.!]$/, "").toLowerCase();
  if (messages[key]) return messages[key];
  if (
    /^forbidden: you can only view your own (invoices|payments|subscriptions)$/.test(
      key,
    )
  )
    return "Bạn chỉ được xem dữ liệu thanh toán và gói của chính mình.";
  if (
    /^forbidden: coaches cannot view (invoices|payment details|member financial subscriptions)$/.test(
      key,
    )
  )
    return "Huấn luyện viên không có quyền xem thông tin tài chính này.";
  if (
    /^cannot update payment from (FAILED|REFUNDED) to (PENDING|SUCCESS|FAILED|REFUNDED)$/i.test(
      key,
    )
  )
    return "Thanh toán đã kết thúc xử lý, không thể chuyển trạng thái.";
  if (/^you have a conflicting class /i.test(message))
    return `Bạn bị trùng giờ với lớp đã đăng ký: ${message.replace(/^You have a conflicting class /i, "").replace(/ at this time$/, "")}.`;
  if (/^coach has a conflicting schedule between /i.test(message))
    return "Huấn luyện viên bị trùng lịch trong khoảng thời gian đã chọn.";
  const roomConflict = message.match(
    /^Room is already booked for "(.+)" from (.+) to (.+)$/,
  );
  if (roomConflict)
    return `Phòng đã có lịch cho lớp “${roomConflict[1]}” từ ${roomConflict[2]} đến ${roomConflict[3]}.`;
  const coachConflict = message.match(
    /^Coach "(.+)" already has a class at this time: (.+)$/,
  );
  if (coachConflict)
    return `Huấn luyện viên “${coachConflict[1]}” đã có lịch dạy trong khoảng ${coachConflict[2]}.`;
  if (key === "endtime must be after starttime")
    return "Giờ kết thúc phải sau giờ bắt đầu.";
  const duplicates = duplicateFields(message);
  if (duplicates.length)
    return duplicates
      .map((name) => `${labels[name] || name} này đã được sử dụng.`)
      .join(" ");
  const label = (field && labels[field]) || "Giá trị";
  if (/^(required|is required)$/i.test(key)) return `${label} là bắt buộc.`;
  if (/^(already exists|already in use|must be unique)$/i.test(key))
    return `${label} này đã được sử dụng.`;
  const min = message.match(
    /^(?:String must contain at least|.*must be at least) (\d+) character(?:\(s\)|s)?(?: long)?[.!]?$/i,
  );
  if (min) return `${label} cần ít nhất ${min[1]} ký tự.`;
  // Preserve messages we cannot translate reliably instead of changing their meaning.
  return message;
}

export function localizeApiError(
  message: unknown,
  errors: unknown,
  status: number,
) {
  const rawMessage = typeof message === "string" ? message : "";
  const fields: FieldError[] = Array.isArray(errors)
    ? errors
        .filter(
          (e): e is FieldError =>
            !!e && typeof e.field === "string" && typeof e.message === "string",
        )
        .map((e) => ({
          field: e.field,
          message: translateApiMessage(e.message, e.field),
        }))
    : [];
  for (const field of duplicateFields(rawMessage)) {
    if (!fields.some((e) => e.field === field))
      fields.push({
        field,
        message: `${labels[field] || field} này đã được sử dụng.`,
      });
  }
  const fallback: Record<number, string> = {
    400: "Yêu cầu chưa hợp lệ. Vui lòng kiểm tra thông tin.",
    401: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
    403: "Bạn không có quyền thực hiện thao tác này.",
    404: "Không tìm thấy dữ liệu được yêu cầu.",
    409: "Thông tin bị trùng hoặc xung đột với dữ liệu hiện có. Vui lòng kiểm tra lại.",
    422: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
    429: messages["too many requests"],
  };
  return {
    message: rawMessage.trim()
      ? translateApiMessage(rawMessage)
      : fields.map((e) => e.message).join(" ") ||
        fallback[status] ||
        "Máy chủ gặp lỗi. Vui lòng thử lại sau.",
    errors: fields,
  };
}
