import 'package:flutter/material.dart';

import '../error/app_failure.dart';
import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Toast thống nhất (SnackBar nổi).
abstract final class AppSnackbar {
  static void success(BuildContext context, String message) =>
      _show(context, message, AppIcons.success, StatusTone.success);

  static void info(BuildContext context, String message) => _show(context, message, AppIcons.info, StatusTone.info);

  static void error(BuildContext context, Object error) =>
      _show(context, error is String ? error : AppFailure.from(error).message, AppIcons.alert, StatusTone.danger);

  static void _show(BuildContext context, String message, IconData icon, StatusTone tone) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    final c = context.colors;
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(
                icon,
                size: AppSizes.icon,
                color: tone == StatusTone.danger ? context.tones.of(StatusTone.danger).border : c.accent,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text(message)),
            ],
          ),
        ),
      );
  }
}
