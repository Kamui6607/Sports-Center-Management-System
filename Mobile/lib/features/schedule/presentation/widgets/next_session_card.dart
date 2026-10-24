import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/session.dart';

/// Thẻ nổi bật "buổi tiếp theo" ở Trang chủ Member và Tổng quan Coach.
/// [action] = nút điểm danh (hoặc ghi chú trạng thái); `null` ⇒ hiển thị đếm ngược tới giờ bắt đầu.
class NextSessionCard extends StatelessWidget {
  const NextSessionCard({
    super.key,
    required this.session,
    required this.details,
    required this.subtitle,
    required this.onTap,
    this.action,
  });

  final ClassSession session;

  /// Dòng chính dưới tên khóa (thời gian, phòng…).
  final String details;

  /// Dòng phụ (phòng · HLV, số học viên…).
  final String subtitle;
  final VoidCallback onTap;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final now = DateTime.now();
    final s = session;
    final ongoing = s.isOngoing(now);
    return Material(
      color: c.primary,
      shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetAll),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.className, style: context.text.title.copyWith(color: c.onPrimary)),
              if (ongoing || s.isMakeup) ...[
                const SizedBox(height: AppSpacing.xs),
                Wrap(
                  spacing: AppSpacing.xxs,
                  runSpacing: AppSpacing.xxs,
                  children: [
                    if (ongoing) const StatusLabel('Đang diễn ra', StatusTone.success).tag(dense: true),
                    if (s.isMakeup) const StatusLabel('Buổi dạy bù', StatusTone.brand).tag(dense: true),
                  ],
                ),
                const SizedBox(height: AppSpacing.xxs),
              ],
              const SizedBox(height: AppSpacing.xxs),
              Text(details, style: context.text.body.copyWith(color: c.onPrimary)),
              Text(subtitle, style: context.text.small.copyWith(color: c.onPrimary.withValues(alpha: 0.8))),
              const SizedBox(height: AppSpacing.md),
              action ??
                  NextSessionNote(
                    icon: AppIcons.time,
                    child: CountdownText(
                      deadline: s.startTime,
                      prefix: 'Bắt đầu sau ',
                      style: context.text.label.copyWith(color: c.accent),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Dòng ghi chú màu nhấn trong [NextSessionCard] (đếm ngược, "đã điểm danh"…).
class NextSessionNote extends StatelessWidget {
  const NextSessionNote({super.key, required this.icon, required this.child});

  /// Ghi chú dạng chữ.
  NextSessionNote.text({super.key, required this.icon, required String text}) : child = _AccentText(text);

  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, color: context.colors.accent, size: AppSizes.icon),
      const SizedBox(width: AppSpacing.xs),
      Flexible(child: child),
    ],
  );
}

class _AccentText extends StatelessWidget {
  const _AccentText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(text, style: context.text.label.copyWith(color: context.colors.accent));
}

/// Thẻ thay thế khi chưa có buổi sắp tới (kèm lối tắt).
class NoUpcomingSessionCard extends StatelessWidget {
  const NoUpcomingSessionCard({super.key, required this.message, required this.actionLabel, required this.onAction});

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Row(
      children: [
        Icon(AppIcons.calendar, color: context.colors.primary),
        const SizedBox(width: AppSpacing.sm),
        Expanded(child: Text(message, style: context.text.body)),
        TextButton(onPressed: onAction, child: Text(actionLabel)),
      ],
    ),
  );
}
