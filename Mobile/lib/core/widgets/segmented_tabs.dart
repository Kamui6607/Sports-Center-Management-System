import 'package:flutter/material.dart';

import '../theme/theme.dart';
import 'count_badge.dart';

class SegmentOption<T> {
  const SegmentOption(this.value, this.label, {this.count = 0, this.icon});

  final T value;
  final String label;
  final int count;
  final IconData? icon;
}

/// Tab phân đoạn (thay tab/bộ lọc trạng thái của web). Cuộn ngang khi nhiều mục.
class SegmentedTabs<T> extends StatelessWidget {
  const SegmentedTabs({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
    this.padding,
  });

  final List<SegmentOption<T>> options;
  final T selected;
  final ValueChanged<T> onChanged;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding ?? EdgeInsets.symmetric(horizontal: context.screenPadding),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.xxs),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: AppRadius.controlAll,
          border: Border.all(color: c.border),
        ),
        child: Row(
          children: [
            for (final o in options)
              Semantics(
                button: true,
                selected: o.value == selected,
                label: o.count > 0 ? '${o.label}, ${o.count}' : o.label,
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: AppRadius.controlAll,
                  onTap: () => onChanged(o.value),
                  child: AnimatedContainer(
                    duration: AppDurations.fast,
                    constraints: const BoxConstraints(minHeight: AppSizes.buttonHeightSmall),
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: o.value == selected ? c.primary : Colors.transparent,
                      borderRadius: AppRadius.controlAll,
                    ),
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (o.icon != null) ...[
                          Icon(o.icon, size: AppSizes.iconSm, color: o.value == selected ? c.onPrimary : c.textMuted),
                          const SizedBox(width: AppSpacing.xxs),
                        ],
                        Text(
                          o.label,
                          style: context.text.label.copyWith(color: o.value == selected ? c.onPrimary : c.textMuted),
                        ),
                        if (o.count > 0) ...[
                          const SizedBox(width: AppSpacing.xxs + 2),
                          CountBadge(count: o.count, inverted: o.value == selected),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
