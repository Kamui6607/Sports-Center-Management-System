import 'package:flutter/material.dart';

/// Font chính, đóng gói trong `assets/fonts/` (Be Vietnam Pro, OFL).
const kFontFamily = 'BeVietnamPro';

/// Thang chữ của app. Đọc qua `context.text.title`…
@immutable
class AppTypography extends ThemeExtension<AppTypography> {
  const AppTypography({
    required this.display,
    required this.headline,
    required this.title,
    required this.titleSmall,
    required this.body,
    required this.bodyStrong,
    required this.label,
    required this.small,
    required this.caption,
    required this.micro,
  });

  /// 32/40 — số dư ví, số tiền thanh toán.
  final TextStyle display;

  /// 24/32 — tiêu đề lớn.
  final TextStyle headline;

  /// 20/28 — tiêu đề màn hình / section lớn.
  final TextStyle title;

  /// 17/24 — tiêu đề card.
  final TextStyle titleSmall;

  /// 16/24 — nội dung, input.
  final TextStyle body;
  final TextStyle bodyStrong;

  /// 14/20 đậm — nút, nhãn, tab.
  final TextStyle label;

  /// 14/20 — mô tả phụ.
  final TextStyle small;

  /// 12/16 — badge, meta.
  final TextStyle caption;

  /// 10/12 đậm — số trên badge đếm.
  final TextStyle micro;

  factory AppTypography.fromColor(Color color) {
    TextStyle s(double size, double height, FontWeight weight) => TextStyle(
      fontFamily: kFontFamily,
      fontSize: size,
      height: height / size,
      fontWeight: weight,
      color: color,
      letterSpacing: 0,
    );
    return AppTypography(
      display: s(32, 40, FontWeight.w800),
      headline: s(24, 32, FontWeight.w800),
      title: s(20, 28, FontWeight.w700),
      titleSmall: s(17, 24, FontWeight.w700),
      body: s(16, 24, FontWeight.w400),
      bodyStrong: s(16, 24, FontWeight.w600),
      label: s(14, 20, FontWeight.w600),
      small: s(14, 20, FontWeight.w400),
      caption: s(12, 16, FontWeight.w500),
      micro: s(10, 12, FontWeight.w700),
    );
  }

  @override
  AppTypography copyWith() => this;

  @override
  AppTypography lerp(AppTypography? other, double t) {
    if (other == null) return this;
    TextStyle l(TextStyle a, TextStyle b) => TextStyle.lerp(a, b, t)!;
    return AppTypography(
      display: l(display, other.display),
      headline: l(headline, other.headline),
      title: l(title, other.title),
      titleSmall: l(titleSmall, other.titleSmall),
      body: l(body, other.body),
      bodyStrong: l(bodyStrong, other.bodyStrong),
      label: l(label, other.label),
      small: l(small, other.small),
      caption: l(caption, other.caption),
      micro: l(micro, other.micro),
    );
  }
}

/// Dùng cho tiền, giờ, đồng hồ đếm ngược để chữ số không nhảy.
const kTabularFigures = [FontFeature.tabularFigures()];
