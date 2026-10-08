import 'package:flutter/material.dart';

import '../theme/theme.dart';
import 'app_button.dart';
import 'app_scaffold.dart';

/// Thanh dính đáy của wizard nhiều bước: "Quay lại" (từ bước thứ 2) + nút chính
/// ("Tiếp tục" / nút gửi ở bước cuối) chia đôi bề ngang.
class WizardNavBar extends StatelessWidget {
  const WizardNavBar({super.key, required this.showBack, required this.onBack, required this.primary});

  final bool showBack;

  /// `null` ⇒ nút "Quay lại" bị khóa (vd đang gửi).
  final VoidCallback? onBack;
  final Widget primary;

  @override
  Widget build(BuildContext context) => StickyBottomBar(
    child: Row(
      children: [
        if (showBack) ...[
          Expanded(
            child: AppButton.outline(label: 'Quay lại', onPressed: onBack),
          ),
          const SizedBox(width: AppSpacing.sm),
        ],
        Expanded(child: primary),
      ],
    ),
  );
}
