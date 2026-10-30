import 'package:flutter/material.dart';

import '../theme/theme.dart';

enum AppButtonVariant { primary, secondary, outline, ghost, danger }

enum AppButtonSize { normal, small }

/// Nút chuẩn của app: đủ trạng thái pressed / disabled / loading.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.normal,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.semanticLabel,
  });

  const AppButton.secondary({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = AppButtonSize.normal,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.semanticLabel,
  }) : variant = AppButtonVariant.secondary;

  const AppButton.outline({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = AppButtonSize.normal,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.semanticLabel,
  }) : variant = AppButtonVariant.outline;

  const AppButton.ghost({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = AppButtonSize.normal,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.semanticLabel,
  }) : variant = AppButtonVariant.ghost;

  const AppButton.danger({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = AppButtonSize.normal,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.semanticLabel,
  }) : variant = AppButtonVariant.danger;

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final IconData? icon;
  final bool loading;
  final bool expand;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger);
    final (Color bg, Color fg, Color? border) = switch (variant) {
      AppButtonVariant.primary => (c.primary, c.onPrimary, null),
      AppButtonVariant.secondary => (c.accent, c.onAccent, null),
      AppButtonVariant.outline => (c.surface, c.primary, c.borderStrong),
      AppButtonVariant.ghost => (Colors.transparent, c.primary, null),
      AppButtonVariant.danger => (danger.foreground, c.onPrimary, null),
    };
    final height = size == AppButtonSize.small ? AppSizes.buttonHeightSmall : AppSizes.buttonHeight;
    final enabled = onPressed != null && !loading;

    final content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (loading)
          SizedBox.square(
            dimension: AppSizes.iconSm,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        else if (icon != null)
          Icon(icon, size: AppSizes.icon, color: fg),
        if (loading || icon != null) const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: context.text.label.copyWith(color: fg),
          ),
        ),
      ],
    );

    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticLabel ?? label,
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled || loading ? 1 : 0.5,
        child: Material(
          color: bg,
          shape: RoundedRectangleBorder(
            borderRadius: AppRadius.controlAll,
            side: border == null ? BorderSide.none : BorderSide(color: border),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onPressed : null,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: height, minWidth: expand ? double.infinity : AppSizes.touch),
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: size == AppButtonSize.small ? AppSpacing.sm : AppSpacing.md),
                child: Center(widthFactor: 1, heightFactor: 1, child: content),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
