import 'package:flutter/material.dart';

import '../theme/theme.dart';
import 'count_badge.dart';

/// Nút icon có vùng chạm ≥ 44 và badge số (chuông, tin nhắn).
class AppIconButton extends StatelessWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.badgeCount = 0,
    this.color,
    this.filled = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final int badgeCount;
  final Color? color;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final label = badgeCount > 0 ? '$tooltip, $badgeCount chưa đọc' : tooltip;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: tooltip,
        child: Material(
          color: filled ? c.surfaceMuted : Colors.transparent,
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: SizedBox.square(
              dimension: AppSizes.touch,
              child: Stack(
                alignment: Alignment.center,
                clipBehavior: Clip.none,
                children: [
                  Icon(icon, size: AppSizes.iconLg, color: color ?? c.text),
                  if (badgeCount > 0)
                    Positioned(
                      top: AppSpacing.xs,
                      right: AppSpacing.xxs,
                      child: CountBadge(count: badgeCount),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
