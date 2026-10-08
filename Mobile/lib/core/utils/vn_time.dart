import 'package:intl/intl.dart';

/// Thời gian hiển thị theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có
/// giờ mùa hè) — độc lập với múi giờ cài trên máy. BE lưu UTC.
abstract final class VnTime {
  static const _offset = Duration(hours: 7);

  /// Trả về DateTime "giờ treo tường" Việt Nam (dưới dạng UTC để format).
  static DateTime wall(DateTime instant) => instant.toUtc().add(_offset);

  /// Tạo thời điểm từ giờ Việt Nam.
  static DateTime fromWall(int year, int month, int day, [int hour = 0, int minute = 0]) =>
      DateTime.utc(year, month, day, hour, minute).subtract(_offset);

  /// Đầu ngày (00:00 giờ VN) chứa [instant].
  static DateTime startOfDay(DateTime instant) {
    final w = wall(instant);
    return fromWall(w.year, w.month, w.day);
  }

  /// Thứ Hai đầu tuần (giờ VN) chứa [instant].
  static DateTime startOfWeek(DateTime instant) {
    final day = startOfDay(instant);
    return day.subtract(Duration(days: wall(day).weekday - 1));
  }

  static bool sameDay(DateTime a, DateTime b) {
    final wa = wall(a), wb = wall(b);
    return wa.year == wb.year && wa.month == wb.month && wa.day == wb.day;
  }

  /// "Thứ 2" … "Chủ nhật" (ISO weekday 1..7).
  static String weekdayLabel(int isoWeekday, {bool short = false}) {
    if (isoWeekday == DateTime.sunday) return short ? 'CN' : 'Chủ nhật';
    return short ? 'T${isoWeekday + 1}' : 'Thứ ${isoWeekday + 1}';
  }

  static String weekdayOf(DateTime instant, {bool short = false}) => weekdayLabel(wall(instant).weekday, short: short);

  static final _date = DateFormat('dd/MM/yyyy');
  static final _dateShort = DateFormat('dd/MM');
  static final _time = DateFormat('HH:mm');

  /// 08/10/2026
  static String date(DateTime instant) => _date.format(wall(instant));

  /// 08/10
  static String dateShort(DateTime instant) => _dateShort.format(wall(instant));

  /// 18:30
  static String time(DateTime instant) => _time.format(wall(instant));

  /// 18:30 – 19:30
  static String timeRange(DateTime start, DateTime end) => '${time(start)} – ${time(end)}';

  /// 18:30, 08/10/2026
  static String dateTime(DateTime instant) => '${time(instant)}, ${date(instant)}';

  /// Thứ 5, 08/10
  static String dayLabel(DateTime instant) => '${weekdayOf(instant)}, ${dateShort(instant)}';

  /// Thứ 5, 08/10 · 18:30 – 19:30
  static String sessionLabel(DateTime start, DateTime end) => '${dayLabel(start)} · ${timeRange(start, end)}';

  /// "Hôm nay", "Ngày mai", "Hôm qua" hoặc "Thứ 5, 08/10".
  static String friendlyDay(DateTime instant, DateTime now) {
    final diff = startOfDay(instant).difference(startOfDay(now)).inDays;
    return switch (diff) {
      0 => 'Hôm nay',
      1 => 'Ngày mai',
      -1 => 'Hôm qua',
      _ => dayLabel(instant),
    };
  }

  /// "Vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước", hoặc ngày.
  static String relative(DateTime instant, DateTime now) {
    final d = now.difference(instant);
    if (d.isNegative) return dateTime(instant);
    if (d.inMinutes < 1) return 'Vừa xong';
    if (d.inMinutes < 60) return '${d.inMinutes} phút trước';
    if (d.inHours < 24) return '${d.inHours} giờ trước';
    if (d.inDays < 7) return '${d.inDays} ngày trước';
    return date(instant);
  }

  /// Đếm ngược mm:ss (hoặc h:mm:ss).
  static String countdown(Duration d) {
    final s = d.isNegative ? Duration.zero : d;
    // Từ 1 ngày trở lên, đồng hồ giây vô nghĩa ("104:39:26") ⇒ "4 ngày 8 giờ".
    if (s.inDays > 0) return durationLabel(s);
    final h = s.inHours;
    final m = s.inMinutes.remainder(60).toString().padLeft(2, '0');
    final sec = s.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$sec' : '$m:$sec';
  }

  /// "2 ngày 3 giờ", "5 giờ 10 phút", "12 phút".
  static String durationLabel(Duration d) {
    if (d.inDays > 0) return '${d.inDays} ngày ${d.inHours.remainder(24)} giờ';
    if (d.inHours > 0) return '${d.inHours} giờ ${d.inMinutes.remainder(60)} phút';
    return '${d.inMinutes.clamp(0, 59)} phút';
  }
}
