/// Validator form, khớp ràng buộc Zod của BE (`auth.schema.ts`, ...).
/// Trả `null` khi hợp lệ, ngược lại là thông báo lỗi tiếng Việt.
abstract final class Validators {
  static final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  static final _phone = RegExp(r'^\+?[0-9]{9,15}$');

  static String? required(String? v, [String field = 'Trường này']) =>
      (v == null || v.trim().isEmpty) ? '$field là bắt buộc' : null;

  static String? email(String? v) {
    final r = required(v, 'Email');
    if (r != null) return r;
    return _email.hasMatch(v!.trim()) ? null : 'Email không hợp lệ';
  }

  /// Điện thoại 9–15 số, có thể bắt đầu bằng "+" (tùy chọn).
  static String? phoneOptional(String? v) {
    if (v == null || v.trim().isEmpty) return null;
    return _phone.hasMatch(v.trim()) ? null : 'Số điện thoại gồm 9–15 chữ số';
  }

  static String? password(String? v) {
    if (v == null || v.isEmpty) return 'Mật khẩu là bắt buộc';
    return v.length < 6 ? 'Mật khẩu tối thiểu 6 ký tự' : null;
  }

  static String? fullName(String? v) {
    final r = required(v, 'Họ tên');
    if (r != null) return r;
    final t = v!.trim();
    if (t.length < 2) return 'Họ tên tối thiểu 2 ký tự';
    if (t.length > 100) return 'Họ tên tối đa 100 ký tự';
    return null;
  }

  static String? Function(String?) confirm(String Function() original) =>
      (v) => v != original() ? 'Mật khẩu xác nhận không khớp' : null;

  static String? Function(String?) minLength(int min, String field) => (v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return '$field là bắt buộc';
    return t.length < min ? '$field tối thiểu $min ký tự' : null;
  };

  static String? Function(String?) maxLength(int max) =>
      (v) => (v != null && v.trim().length > max) ? 'Tối đa $max ký tự' : null;

  /// OTP 6 chữ số (Q8).
  static String? otp(String? v) => RegExp(r'^[0-9]{6}$').hasMatch(v ?? '') ? null : 'Mã gồm 6 chữ số';

  /// Mã điểm danh dự phòng: 6 ký tự A-HJ-NP-Z2-9 (không 0, O, 1, I).
  static final attendanceCodePattern = RegExp(r'^[A-HJ-NP-Z2-9]{6}$');

  static String? attendanceCode(String? v) =>
      attendanceCodePattern.hasMatch((v ?? '').trim().toUpperCase()) ? null : 'Mã gồm 6 ký tự (không dùng 0, O, 1, I)';
}
