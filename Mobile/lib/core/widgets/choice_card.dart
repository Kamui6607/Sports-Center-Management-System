import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';
import 'app_card.dart';
import 'icon_tile.dart';

/// Thẻ chọn một trong nhiều phương án (vai trò khi đăng ký, cách xử lý khi hủy buổi…).
/// Đặt các thẻ cùng nhóm cạnh nhau; chỉ một thẻ [selected].
class ChoiceCard extends StatelessWidget {
  const ChoiceCard({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  /// false ⇒ mờ đi, không bấm được (VD lựa chọn không khả dụng — [description] nêu lý do).
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final card = Semantics(
      selected: selected,
      enabled: enabled,
      inMutuallyExclusiveGroup: true,
      child: AppCard(
        onTap: enabled ? onTap : null,
        borderColor: selected ? c.primary : null,
        color: selected ? context.tones.of(StatusTone.brand).background : null,
        child: Row(
          children: [
            IconTile(
              icon,
              large: true,
              background: selected ? c.primary : null,
              foreground: selected ? c.accent : null,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(description, style: context.text.small.copyWith(color: c.textMuted)),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            Icon(selected ? AppIcons.success : AppIcons.chevronRight, color: selected ? c.primary : c.textMuted),
          ],
        ),
      ),
    );
    return enabled ? card : Opacity(opacity: 0.55, child: card);
  }
}
