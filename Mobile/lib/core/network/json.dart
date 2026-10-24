import '../utils/money.dart';

/// Object JSON đã decode từ BE.
typedef Json = Map<String, Object?>;

/// Đọc an toàn field JSON của BE: field thiếu / null / sai kiểu ⇒ giá trị mặc định,
/// không ném lỗi cast (bật `strict-casts`).
extension JsonRead on Json {
  String str(String key, [String fallback = '']) => strOrNull(key) ?? fallback;

  String? strOrNull(String key) {
    final v = this[key];
    if (v == null) return null;
    if (v is String) return v;
    return v.toString();
  }

  int integer(String key, [int fallback = 0]) => intOrNull(key) ?? fallback;

  int? intOrNull(String key) {
    final v = this[key];
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return num.tryParse(v)?.round();
    return null;
  }

  double dbl(String key, [double fallback = 0]) {
    final v = this[key];
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? fallback;
    return fallback;
  }

  bool boolean(String key, [bool fallback = false]) {
    final v = this[key];
    if (v is bool) return v;
    if (v is String) return v == 'true';
    return fallback;
  }

  /// Tiền: BE trả `Decimal` dạng chuỗi ("1200000.00") hoặc số.
  int money(String key) => Money.parse(this[key]);

  /// Thời gian ISO (UTC) ⇒ giờ địa phương.
  DateTime? dateOrNull(String key) {
    final v = this[key];
    if (v is! String || v.isEmpty) return null;
    return DateTime.tryParse(v)?.toLocal();
  }

  DateTime date(String key) => dateOrNull(key) ?? DateTime.fromMillisecondsSinceEpoch(0);

  Json? objOrNull(String key) {
    final v = this[key];
    return v is Map ? v.cast<String, Object?>() : null;
  }

  Json obj(String key) => objOrNull(key) ?? const {};

  List<Json> objList(String key) => asJsonList(this[key]);

  List<String> strList(String key) {
    final v = this[key];
    if (v is! List) return const [];
    return [
      for (final e in v)
        if (e != null) e.toString(),
    ];
  }

  /// Enum theo tên BE (`SCHEDULED`, `MEMBER_CANCEL_COURSE`...) ⇔ enum Dart
  /// `lowerCamel` cùng tên (`scheduled`, `memberCancelCourse`).
  T? enumOrNull<T extends Enum>(String key, List<T> values) => parseBeEnum(strOrNull(key), values);

  T enumOr<T extends Enum>(String key, List<T> values, T fallback) => enumOrNull(key, values) ?? fallback;
}

/// Ép giá trị bất kỳ về danh sách object JSON (bỏ phần tử không phải object).
List<Json> asJsonList(Object? raw) {
  if (raw is! List) return const [];
  return [
    for (final e in raw)
      if (e is Map) e.cast<String, Object?>(),
  ];
}

/// Ép giá trị bất kỳ về object JSON (khác kiểu ⇒ rỗng).
Json asJson(Object? raw) => raw is Map ? raw.cast<String, Object?>() : const {};

/// Chuỗi enum BE (`SNAKE_CASE`) ⇒ tên enum Dart (`lowerCamel`).
String enumKey(String beValue) {
  final parts = beValue.toLowerCase().split('_');
  return parts.first + parts.skip(1).map((p) => p.isEmpty ? p : p[0].toUpperCase() + p.substring(1)).join();
}

/// Chuỗi enum BE ⇒ enum Dart (null nếu không khớp).
T? parseBeEnum<T extends Enum>(String? raw, List<T> values) {
  if (raw == null) return null;
  final key = enumKey(raw);
  for (final v in values) {
    if (v.name == key) return v;
  }
  return null;
}

/// Tên BE (`SNAKE_CASE`) của enum Dart (`lowerCamel`).
String beName(Enum value) => value.name.replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m.group(0)}').toUpperCase();
