import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Hộp thông báo trong trang: info / success / warning / error.
class AlertBanner extends StatelessWidget {
  const AlertBanner({super.key, required this.tone, required this.message, this.title, this.action, this.icon});

  const AlertBanner.info({super.key, required this.message, this.title, this.action})
    : tone = StatusTone.info,
      icon = null;
  const AlertBanner.success({super.key, required this.message, this.title, this.action})
    : tone = StatusTone.success,
      icon = null;
  const AlertBanner.warning({super.key, required this.message, this.title, this.action})
    : tone = StatusTone.warning,
      icon = null;
  const AlertBanner.error({super.key, required this.message, this.title, this.action})
    : tone = StatusTone.danger,
      icon = null;

  final StatusTone tone;
  final String message;
  final String? title;
  final Widget? action;
  final IconData? icon;

  IconData get _icon =>
      icon ??
      switch (tone) {
        StatusTone.success => AppIcons.success,
        StatusTone.warning => AppIcons.warning,
        StatusTone.danger => AppIcons.alert,
        _ => AppIcons.info,
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.tones.of(tone);
    final t = context.text;
    return Semantics(
      container: true,
      liveRegion: tone == StatusTone.danger,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.sm),
        decoration: BoxDecoration(
          color: colors.background,
          borderRadius: AppRadius.cardAll,
          border: Border.all(color: colors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_icon, size: AppSizes.icon, color: colors.foreground),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.xxs),
                      child: Text(title!, style: t.label.copyWith(color: colors.foreground)),
                    ),
                  Text(message, style: t.small.copyWith(color: context.colors.text)),
                  if (action != null) ...[const SizedBox(height: AppSpacing.xs), action!],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
