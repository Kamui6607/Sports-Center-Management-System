import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Chip chọn lọc (filter) có trạng thái được chọn.
class AppChip extends StatelessWidget {
  const AppChip({super.key, required this.label, this.selected = false, this.onTap, this.icon, this.trailingIcon});

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? icon;
  final IconData? trailingIcon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = selected ? c.onPrimary : c.text;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: selected ? c.primary : c.surface,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.pillAll,
          side: BorderSide(color: selected ? c.primary : c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.buttonHeightSmall),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: AppSizes.iconSm, color: fg),
                    const SizedBox(width: AppSpacing.xxs + 2),
                  ],
                  Text(label, style: context.text.label.copyWith(color: fg)),
                  if (trailingIcon != null) ...[
                    const SizedBox(width: AppSpacing.xxs),
                    Icon(trailingIcon, size: AppSizes.iconSm, color: fg),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hàng chip cuộn ngang.
class ChipBar extends StatelessWidget {
  const ChipBar({super.key, required this.children, this.padding});

  final List<Widget> children;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    padding: padding ?? EdgeInsets.symmetric(horizontal: context.screenPadding),
    child: Row(
      children: [
        for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(width: AppSpacing.xs), children[i]],
      ],
    ),
  );
}

/// Chip hiển thị bộ lọc đang áp dụng, có nút xóa.
class FilterSummaryChip extends StatelessWidget {
  const FilterSummaryChip({super.key, required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppChip(
    label: count > 0 ? 'Bộ lọc ($count)' : 'Bộ lọc',
    icon: AppIcons.filter,
    selected: count > 0,
    onTap: onTap,
  );
}
