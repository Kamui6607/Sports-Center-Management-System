import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Bộ tăng giảm số lượng.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({super.key, required this.value, required this.onChanged, this.min = 1, required this.max});

  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget btn(IconData icon, String tip, VoidCallback? onTap) => IconButton(
      tooltip: tip,
      onPressed: onTap,
      icon: Icon(icon, size: AppSizes.icon),
      style: IconButton.styleFrom(
        minimumSize: const Size.square(AppSizes.touchMin),
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.controlAll),
        side: BorderSide(color: c.border),
      ),
    );
    return Semantics(
      label: 'Số lượng $value',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          btn(AppIcons.remove, 'Giảm', value > min ? () => onChanged(value - 1) : null),
          SizedBox(
            width: AppSpacing.xxl,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: context.text.titleSmall.copyWith(fontFeatures: kTabularFigures),
            ),
          ),
          btn(AppIcons.add, 'Tăng', value < max ? () => onChanged(value + 1) : null),
        ],
      ),
    );
  }
}
