import { labels } from "./config";

type FieldError = { field: string; message: string };

const messages: Record<string, string> = {
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
