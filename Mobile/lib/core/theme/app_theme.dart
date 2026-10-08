import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_tokens.dart';
import 'app_typography.dart';
import 'status_colors.dart';

/// Dựng [ThemeData] từ design tokens. Hiện chỉ có Light (Q9).
abstract final class AppTheme {
  static ThemeData light() => _build(colors: AppColors.light, tones: StatusColors.light, brightness: Brightness.light);

  static ThemeData _build({required AppColors colors, required StatusColors tones, required Brightness brightness}) {
    final text = AppTypography.fromColor(colors.text);
    final danger = tones.of(StatusTone.danger);
    final scheme = ColorScheme(
      brightness: brightness,
      primary: colors.primary,
      onPrimary: colors.onPrimary,
      secondary: colors.accent,
      onSecondary: colors.onAccent,
      error: danger.foreground,
      onError: colors.onPrimary,
      surface: colors.surface,
      onSurface: colors.text,
      onSurfaceVariant: colors.textMuted,
      outline: colors.borderStrong,
      outlineVariant: colors.border,
      surfaceContainerHighest: colors.surfaceMuted,
      scrim: colors.scrim,
    );

    OutlineInputBorder inputBorder(Color color, [double width = 1]) => OutlineInputBorder(
      borderRadius: AppRadius.controlAll,
      borderSide: BorderSide(color: color, width: width),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: kFontFamily,
      scaffoldBackgroundColor: colors.background,
      extensions: [colors, tones, text],
      textTheme: TextTheme(
        displaySmall: text.display,
        headlineSmall: text.headline,
        titleLarge: text.title,
        titleMedium: text.titleSmall,
        bodyLarge: text.body,
        bodyMedium: text.small,
        bodySmall: text.caption,
        labelLarge: text.label,
        labelMedium: text.caption,
        labelSmall: text.caption,
      ),
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: text.titleSmall,
        toolbarHeight: AppSizes.appBarHeight,
      ),
      dividerTheme: DividerThemeData(color: colors.border, thickness: AppSizes.divider, space: AppSizes.divider),
      cardTheme: CardThemeData(
        color: colors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.cardAll,
          side: BorderSide(color: colors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surface,
        isDense: false,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
        hintStyle: text.body.copyWith(color: colors.textMuted),
        labelStyle: text.small.copyWith(color: colors.textMuted),
        floatingLabelStyle: text.small.copyWith(color: colors.primary),
        helperStyle: text.caption.copyWith(color: colors.textMuted),
        errorStyle: text.caption.copyWith(color: danger.foreground),
        border: inputBorder(colors.borderStrong),
        enabledBorder: inputBorder(colors.borderStrong),
        focusedBorder: inputBorder(colors.primary, AppSizes.focusWidth),
        errorBorder: inputBorder(danger.foreground),
        focusedErrorBorder: inputBorder(danger.foreground, AppSizes.focusWidth),
        disabledBorder: inputBorder(colors.border),
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: colors.primary,
        selectionColor: colors.accent,
        selectionHandleColor: colors.primary,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: colors.surface,
        showDragHandle: false,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetTop),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetAll),
        titleTextStyle: text.titleSmall,
        contentTextStyle: text.small,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: colors.text,
        contentTextStyle: text.small.copyWith(color: colors.onPrimary),
        actionTextColor: colors.accent,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.controlAll),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: colors.accent,
        elevation: 0,
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => text.caption.copyWith(
            color: states.contains(WidgetState.selected) ? colors.primary : colors.textMuted,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: AppSizes.iconLg,
            color: states.contains(WidgetState.selected) ? colors.primary : colors.textMuted,
          ),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colors.primary,
        linearTrackColor: colors.border,
        circularTrackColor: colors.border,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? colors.onPrimary : null),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? colors.primary : null),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? colors.primary : null),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? colors.primary : colors.borderStrong,
        ),
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        headerBackgroundColor: colors.primary,
        headerForegroundColor: colors.onPrimary,
      ),
      timePickerTheme: TimePickerThemeData(backgroundColor: colors.surface),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.primary,
        unselectedLabelColor: colors.textMuted,
        labelStyle: text.label,
        unselectedLabelStyle: text.label,
        indicatorColor: colors.primary,
        dividerColor: colors.border,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: colors.textMuted,
        textColor: colors.text,
        titleTextStyle: text.bodyStrong,
        subtitleTextStyle: text.small.copyWith(color: colors.textMuted),
        minVerticalPadding: AppSpacing.sm,
      ),
      iconTheme: IconThemeData(color: colors.text, size: AppSizes.iconLg),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
