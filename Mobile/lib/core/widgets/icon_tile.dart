import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Ô nền màu chứa icon, đặt đầu dòng của card / tile (việc cần làm, thông báo,
/// hóa đơn, thẻ lựa chọn…).
///
/// - Có [tone] ⇒ nền / viền / icon lấy theo màu trạng thái.
/// - Không có ⇒ dùng [background] / [foreground] (mặc định `surfaceMuted` / `primary`).
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, this.tone, this.background, this.foreground, this.large = false});

  final IconData icon;
  final StatusTone? tone;
  final Color? background;
  final Color? foreground;

  /// `true` ⇒ ô lớn (icon 24, bo góc card) cho thẻ chính; mặc định ô nhỏ (icon 20).
  final bool large;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final toneColors = tone == null ? null : context.tones.of(tone!);
    return Container(
      padding: EdgeInsets.all(large ? AppSpacing.sm : AppSpacing.xs),
      decoration: BoxDecoration(
        color: toneColors?.background ?? background ?? c.surfaceMuted,
        borderRadius: large ? AppRadius.cardAll : AppRadius.controlAll,
        border: toneColors == null ? null : Border.all(color: toneColors.border),
      ),
      child: Icon(
        icon,
        size: large ? AppSizes.iconLg : AppSizes.icon,
        color: toneColors?.foreground ?? foreground ?? c.primary,
      ),
    );
  }
}
