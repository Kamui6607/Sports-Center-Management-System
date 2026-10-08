import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';
import '../utils/money.dart';

/// Ô nhập chuẩn: nhãn phía trên, helper, lỗi (kể cả lỗi field từ BE),
/// ẩn/hiện mật khẩu, nhiều dòng, đếm ký tự.
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.helper,
    this.errorText,
    this.validator,
    this.keyboardType,
    this.textInputAction,
    this.obscure = false,
    this.enabled = true,
    this.readOnly = false,
    this.maxLines = 1,
    this.minLines,
    this.maxLength,
    this.prefixIcon,
    this.suffix,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.inputFormatters,
    this.autofillHints,
    this.textCapitalization = TextCapitalization.none,
    this.requiredField = false,
    this.autofocus = false,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helper;
  final String? errorText;
  final FormFieldValidator<String>? validator;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscure;
  final bool enabled;
  final bool readOnly;
  final int maxLines;
  final int? minLines;
  final int? maxLength;
  final IconData? prefixIcon;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final List<TextInputFormatter>? inputFormatters;
  final Iterable<String>? autofillHints;
  final TextCapitalization textCapitalization;
  final bool requiredField;
  final bool autofocus;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late bool _hidden = widget.obscure;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = context.text;
    Widget? suffix = widget.suffix;
    if (widget.obscure) {
      suffix = IconButton(
        tooltip: _hidden ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
        icon: Icon(_hidden ? AppIcons.eye : AppIcons.eyeOff, size: AppSizes.icon),
        onPressed: () => setState(() => _hidden = !_hidden),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Text.rich(
            TextSpan(
              text: widget.label,
              children: [
                if (widget.requiredField)
                  TextSpan(
                    text: ' *',
                    style: TextStyle(color: context.tones.of(StatusTone.danger).foreground),
                  ),
              ],
            ),
            style: t.label.copyWith(color: c.text),
          ),
        ),
        TextFormField(
          controller: widget.controller,
          validator: widget.validator,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          obscureText: _hidden,
          enabled: widget.enabled,
          readOnly: widget.readOnly,
          maxLines: widget.obscure ? 1 : widget.maxLines,
          minLines: widget.minLines,
          maxLength: widget.maxLength,
          onChanged: widget.onChanged,
          onFieldSubmitted: widget.onSubmitted,
          onTap: widget.onTap,
          inputFormatters: widget.inputFormatters,
          autofillHints: widget.autofillHints,
          textCapitalization: widget.textCapitalization,
          autofocus: widget.autofocus,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          style: t.body,
          decoration: InputDecoration(
            hintText: widget.hint,
            helperText: widget.helper,
            helperMaxLines: 3,
            errorText: widget.errorText,
            errorMaxLines: 3,
            fillColor: widget.enabled ? c.surface : c.surfaceMuted,
            prefixIcon: widget.prefixIcon == null
                ? null
                : Icon(widget.prefixIcon, size: AppSizes.icon, color: c.textMuted),
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }
}

/// Định dạng số tiền khi gõ: 1200000 ⇒ 1.200.000.
class MoneyInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final value = Money.parseInput(newValue.text);
    if (value == null) return const TextEditingValue();
    final text = Money.plain(value);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Ô nhập tiền VND.
class MoneyInput extends StatelessWidget {
  const MoneyInput({
    super.key,
    required this.label,
    required this.controller,
    this.helper,
    this.validator,
    this.errorText,
    this.onChanged,
    this.requiredField = false,
  });

  final String label;
  final TextEditingController controller;
  final String? helper;
  final FormFieldValidator<String>? validator;
  final String? errorText;
  final ValueChanged<String>? onChanged;
  final bool requiredField;

  @override
  Widget build(BuildContext context) => AppTextField(
    label: label,
    controller: controller,
    helper: helper,
    validator: validator,
    errorText: errorText,
    onChanged: onChanged,
    requiredField: requiredField,
    keyboardType: TextInputType.number,
    inputFormatters: [MoneyInputFormatter()],
    suffix: Padding(
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: Text('đ', style: context.text.bodyStrong.copyWith(color: context.colors.textMuted)),
    ),
  );
}
