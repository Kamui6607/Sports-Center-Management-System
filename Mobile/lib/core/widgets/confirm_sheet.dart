import 'package:flutter/material.dart';

import '../theme/theme.dart';
import 'alert_banner.dart';
import 'app_bottom_sheet.dart';
import 'app_button.dart';

/// Xác nhận thao tác (đặc biệt thao tác không hoàn tác). Trả `true` khi đồng ý.
Future<bool> showConfirmSheet({
  required BuildContext context,
  required String title,
  required String message,
  String confirmLabel = 'Xác nhận',
  String cancelLabel = 'Quay lại',
  bool destructive = false,
  String? warning,
  Widget? extra,
}) async {
  final result = await showAppBottomSheet<bool>(
    context: context,
    title: title,
    builder: (ctx) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(message, style: ctx.text.body),
        if (extra != null) ...[const SizedBox(height: AppSpacing.md), extra],
        if (warning != null) ...[const SizedBox(height: AppSpacing.md), AlertBanner.warning(message: warning)],
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: confirmLabel,
          variant: destructive ? AppButtonVariant.danger : AppButtonVariant.primary,
          expand: true,
          onPressed: () => Navigator.of(ctx).pop(true),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppButton.ghost(label: cancelLabel, expand: true, onPressed: () => Navigator.of(ctx).pop(false)),
      ],
    ),
  );
  return result ?? false;
}
