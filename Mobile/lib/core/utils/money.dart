import 'package:intl/intl.dart';

/// Tiền VND được biểu diễn bằng `int` (đồng). BE trả `Decimal(12,2)` dạng chuỗi
/// (VD "1200000.00") ⇒ parse bằng [parseMoney], không tính toán bằng `double`.
abstract final class Money {
  static final _number = NumberFormat.decimalPattern('vi_VN');

  /// 1.200.000 đ
  static String format(int amount) => '${_number.format(amount)} đ';

  /// +1.200.000 đ / −85.000 đ
  static String signed(int amount) {
    if (amount == 0) return format(0);
    return '${amount > 0 ? '+' : '−'}${format(amount.abs())}';
  }

  /// 1.200.000 (không ký hiệu) — dùng trong ô nhập.
  static String plain(int amount) => _number.format(amount);

  /// Parse chuỗi decimal của BE ("1200000.00") hoặc số.
  static int parse(Object? raw) {
    if (raw == null) return 0;
    if (raw is int) return raw;
    if (raw is num) return raw.round();
    final cleaned = raw.toString().trim();
    final value = num.tryParse(cleaned);
    return value?.round() ?? 0;
  }

  /// Parse chuỗi người dùng gõ ("1.200.000") ⇒ 1200000.
  static int? parseInput(String input) {
    final digits = input.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) return null;
    return int.tryParse(digits);
  }
}
