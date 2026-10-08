import 'package:flutter/material.dart';

import '../error/app_failure.dart';
import '../icons/app_icons.dart';
import '../theme/theme.dart';
import 'app_button.dart';

/// Trạng thái rỗng: icon minh họa + tiêu đề + mô tả + CTA.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.message,
    this.icon = AppIcons.empty,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  final String title;
  final String? message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final brand = context.tones.of(StatusTone.brand);
    return Center(
      child: Padding(
        padding: EdgeInsets.all(compact ? AppSpacing.md : AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(color: brand.background, shape: BoxShape.circle),
              child: Icon(icon, size: AppSizes.iconXl, color: c.primary),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(title, textAlign: TextAlign.center, style: context.text.titleSmall),
            if (message != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: context.text.small.copyWith(color: c.textMuted),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: actionLabel!, onPressed: onAction),
            ],
          ],
        ),
      ),
    );
  }
}

/// Trạng thái lỗi có nút "Thử lại".
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry, this.compact = false});

  final Object error;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final failure = AppFailure.from(error);
    final (icon, title) = switch (failure.type) {
      FailureType.network => (AppIcons.offline, 'Mất kết nối'),
      FailureType.server => (AppIcons.serverError, 'Máy chủ gặp sự cố'),
      FailureType.notFound => (AppIcons.empty, 'Không tìm thấy'),
      FailureType.forbidden => (AppIcons.lock, 'Không có quyền truy cập'),
      _ => (AppIcons.alert, 'Không tải được dữ liệu'),
    };
    return EmptyState(
      icon: icon,
      title: title,
      message: failure.message,
      actionLabel: onRetry == null ? null : 'Thử lại',
      onAction: onRetry,
      compact: compact,
    );
  }
}
