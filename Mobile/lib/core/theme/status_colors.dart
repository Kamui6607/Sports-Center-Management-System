import 'package:flutter/material.dart';

import 'app_palette.dart';

/// Sắc thái trạng thái dùng cho tag, banner, icon nền.
enum StatusTone { success, warning, danger, info, brand, neutral }

@immutable
class ToneColors {
  const ToneColors({required this.background, required this.foreground, required this.border});

  final Color background;
  final Color foreground;
  final Color border;

  ToneColors lerp(ToneColors other, double t) => ToneColors(
    background: Color.lerp(background, other.background, t)!,
    foreground: Color.lerp(foreground, other.foreground, t)!,
    border: Color.lerp(border, other.border, t)!,
  );
}

/// Màu theo [StatusTone]. Đọc qua `context.tones.of(StatusTone.success)`.
@immutable
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors(this._tones);

  final Map<StatusTone, ToneColors> _tones;

  ToneColors of(StatusTone tone) => _tones[tone]!;

  static const light = StatusColors({
    StatusTone.success: ToneColors(
      background: AppPalette.successBg,
      foreground: AppPalette.successFg,
      border: AppPalette.successBorder,
    ),
    StatusTone.warning: ToneColors(
      background: AppPalette.warningBg,
      foreground: AppPalette.warningFg,
      border: AppPalette.warningBorder,
    ),
    StatusTone.danger: ToneColors(
      background: AppPalette.dangerBg,
      foreground: AppPalette.dangerFg,
      border: AppPalette.dangerBorder,
    ),
    StatusTone.info: ToneColors(
      background: AppPalette.infoBg,
      foreground: AppPalette.infoFg,
      border: AppPalette.infoBorder,
    ),
    StatusTone.brand: ToneColors(
      background: AppPalette.brandBg,
      foreground: AppPalette.brandFg,
      border: AppPalette.brandBorder,
    ),
    StatusTone.neutral: ToneColors(
      background: AppPalette.neutralBg,
      foreground: AppPalette.neutralFg,
      border: AppPalette.neutralBorder,
    ),
  });

  @override
  StatusColors copyWith() => this;

  @override
  StatusColors lerp(StatusColors? other, double t) {
    if (other == null) return this;
    return StatusColors({for (final tone in StatusTone.values) tone: of(tone).lerp(other.of(tone), t)});
  }
}
