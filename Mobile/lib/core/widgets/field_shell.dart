import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Vỏ chung cho ô chạm-để-chọn (SelectField, DateTimeField).
class FieldShell extends StatelessWidget {
  const FieldShell({
    super.key,
    required this.label,
    required this.hint,
    required this.trailing,
    this.value,
    this.onTap,
    this.errorText,
    this.requiredField = false,
    this.enabled = true,
  });

  final String label;
  final String hint;
  final IconData trailing;
  final String? value;
  final VoidCallback? onTap;
  final String? errorText;
  final bool requiredField;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger).foreground;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Text.rich(
            TextSpan(
              text: label,
              children: [
                if (requiredField)
                  TextSpan(
                    text: ' *',
                    style: TextStyle(color: danger),
                  ),
              ],
            ),
            style: context.text.label,
          ),
        ),
        Semantics(
          button: true,
          label: '$label: ${value ?? hint}',
          excludeSemantics: true,
          child: Material(
            color: enabled ? c.surface : c.surfaceMuted,
            shape: RoundedRectangleBorder(
              borderRadius: AppRadius.controlAll,
              side: BorderSide(color: errorText != null ? danger : c.borderStrong),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: AppSizes.inputHeight),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          value ?? hint,
                          style: context.text.body.copyWith(color: value == null ? c.textMuted : c.text),
                        ),
                      ),
                      Icon(trailing, size: AppSizes.icon, color: c.textMuted),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xxs, left: AppSpacing.sm),
            child: Text(errorText!, style: context.text.caption.copyWith(color: danger)),
          ),
      ],
    );
  }
}
