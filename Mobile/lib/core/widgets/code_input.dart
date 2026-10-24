import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/theme.dart';

/// Ô nhập mã 6 ký tự (OTP số hoặc mã điểm danh chữ-số).
class CodeInput extends StatefulWidget {
  const CodeInput({
    super.key,
    required this.onCompleted,
    this.length = 6,
    this.numeric = true,
    this.onChanged,
    this.errorText,
  });

  final int length;
  final bool numeric;
  final ValueChanged<String> onCompleted;
  final ValueChanged<String>? onChanged;
  final String? errorText;

  @override
  State<CodeInput> createState() => _CodeInputState();
}

class _CodeInputState extends State<CodeInput> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed(String v) {
    setState(() {});
    widget.onChanged?.call(v);
    if (v.length == widget.length) widget.onCompleted(v);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger).foreground;
    final text = _controller.text;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Stack(
          children: [
            Row(
              children: [
                for (var i = 0; i < widget.length; i++) ...[
                  if (i > 0) const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: AspectRatio(
                      aspectRatio: 0.85,
                      child: Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: c.surface,
                          borderRadius: AppRadius.controlAll,
                          border: Border.all(
                            color: widget.errorText != null
                                ? danger
                                : (i == text.length && _focus.hasFocus ? c.primary : c.borderStrong),
                            width: i == text.length && _focus.hasFocus ? 2 : 1,
                          ),
                        ),
                        child: Text(i < text.length ? text[i] : '', style: context.text.headline),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            Positioned.fill(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: _controller,
                  focusNode: _focus,
                  autofocus: true,
                  maxLength: widget.length,
                  keyboardType: widget.numeric ? TextInputType.number : TextInputType.visiblePassword,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [
                    if (widget.numeric) FilteringTextInputFormatter.digitsOnly else _UpperCodeFormatter(),
                  ],
                  onChanged: _changed,
                  showCursor: false,
                  enableInteractiveSelection: false,
                  decoration: const InputDecoration(counterText: '', border: InputBorder.none),
                ),
              ),
            ),
          ],
        ),
        if (widget.errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(widget.errorText!, style: context.text.caption.copyWith(color: danger)),
          ),
      ],
    );
  }
}

/// Viết hoa, chỉ giữ ký tự hợp lệ của mã điểm danh (bỏ 0, O, 1, I).
class _UpperCodeFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final cleaned = newValue.text.toUpperCase().replaceAll(RegExp(r'[^A-HJ-NP-Z2-9]'), '');
    return TextEditingValue(
      text: cleaned,
      selection: TextSelection.collapsed(offset: cleaned.length),
    );
  }
}
