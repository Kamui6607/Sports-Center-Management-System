import 'package:flutter/material.dart';

import 'app_palette.dart';

/// Màu ngữ nghĩa của app. Đọc qua `context.colors`.
///
/// Tách thành `ThemeExtension` để thêm bản Dark sau này (Q9) mà không sửa widget.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.primary,
    required this.onPrimary,
    required this.accent,
    required this.onAccent,
    required this.accentStrong,
    required this.focus,
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.scrim,
    required this.successText,
    required this.warningText,
    required this.errorText,
    required this.infoText,
    required this.skeletonBase,
    required this.skeletonHighlight,
  });

  final Color primary;
  final Color onPrimary;
  final Color accent;
  final Color onAccent;
  final Color accentStrong;
  final Color focus;
  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color border;
  final Color borderStrong;
  final Color text;
  final Color textMuted;
  final Color scrim;
  final Color successText;
  final Color warningText;
  final Color errorText;
  final Color infoText;
  final Color skeletonBase;
  final Color skeletonHighlight;

  static const light = AppColors(
    primary: AppPalette.forest,
    onPrimary: AppPalette.white,
    accent: AppPalette.lime,
    onAccent: AppPalette.forest,
    accentStrong: AppPalette.limeStrong,
    focus: AppPalette.limeFocus,
    background: AppPalette.background,
    surface: AppPalette.surface,
    surfaceMuted: AppPalette.surfaceMuted,
    border: AppPalette.border,
    borderStrong: AppPalette.borderStrong,
    text: AppPalette.text,
    textMuted: AppPalette.textMuted,
    scrim: AppPalette.scrim,
    successText: AppPalette.successText,
    warningText: AppPalette.warningText,
    errorText: AppPalette.errorText,
    infoText: AppPalette.infoText,
    skeletonBase: AppPalette.skeletonBase,
    skeletonHighlight: AppPalette.skeletonHighlight,
  );

  @override
  AppColors copyWith({Color? primary, Color? accent}) => AppColors(
    primary: primary ?? this.primary,
    onPrimary: onPrimary,
    accent: accent ?? this.accent,
    onAccent: onAccent,
    accentStrong: accentStrong,
    focus: focus,
    background: background,
    surface: surface,
    surfaceMuted: surfaceMuted,
    border: border,
    borderStrong: borderStrong,
    text: text,
    textMuted: textMuted,
    scrim: scrim,
    successText: successText,
    warningText: warningText,
    errorText: errorText,
    infoText: infoText,
    skeletonBase: skeletonBase,
    skeletonHighlight: skeletonHighlight,
  );

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      primary: l(primary, other.primary),
      onPrimary: l(onPrimary, other.onPrimary),
      accent: l(accent, other.accent),
      onAccent: l(onAccent, other.onAccent),
      accentStrong: l(accentStrong, other.accentStrong),
      focus: l(focus, other.focus),
      background: l(background, other.background),
      surface: l(surface, other.surface),
      surfaceMuted: l(surfaceMuted, other.surfaceMuted),
      border: l(border, other.border),
      borderStrong: l(borderStrong, other.borderStrong),
      text: l(text, other.text),
      textMuted: l(textMuted, other.textMuted),
      scrim: l(scrim, other.scrim),
      successText: l(successText, other.successText),
      warningText: l(warningText, other.warningText),
      errorText: l(errorText, other.errorText),
      infoText: l(infoText, other.infoText),
      skeletonBase: l(skeletonBase, other.skeletonBase),
      skeletonHighlight: l(skeletonHighlight, other.skeletonHighlight),
    );
  }
}
