import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_tokens.dart';
import 'app_typography.dart';
import 'status_colors.dart';

/// Lối tắt đọc design tokens từ theme.
extension ThemeContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
  StatusColors get tones => Theme.of(this).extension<StatusColors>()!;
  AppTypography get text => Theme.of(this).extension<AppTypography>()!;

  bool get isWide => MediaQuery.sizeOf(this).width >= AppSizes.tabletBreakpoint;

  double get screenPadding => isWide ? AppSpacing.screenWide : AppSpacing.screen;

  bool get reduceMotion => MediaQuery.of(this).disableAnimations;
}
