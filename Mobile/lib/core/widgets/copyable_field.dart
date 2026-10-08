import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';
import 'app_snackbar.dart';

/// Dòng thông tin có nút sao chép (số tài khoản, số tiền, nội dung CK).
class CopyableField extends StatelessWidget {
  const CopyableField({
    super.key,
    required this.label,
    required this.value,
    this.copyValue,
    this.emphasize = false,
    this.copyable = true,
    this.note,
  });

  final String label;
  final String value;

  /// Giá trị thực sẽ được chép (VD số tiền không định dạng). Mặc định [value].
  final String? copyValue;
  final bool emphasize;

  /// `false` ⇒ chỉ hiển thị (cùng kiểu trình bày), không có nút "Chép".
  final bool copyable;

  /// Ghi chú nhỏ dưới giá trị (VD "Ghi đúng nội dung này").
  final String? note;

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: copyValue ?? value));
    if (context.mounted) AppSnackbar.success(context, 'Đã sao chép ${label.toLowerCase()}');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSizes.touchMin),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.caption.copyWith(color: c.textMuted)),
                  SelectableText(
                    value,
                    style: (emphasize ? context.text.titleSmall : context.text.bodyStrong).copyWith(
                      fontFeatures: kTabularFigures,
                    ),
                  ),
                  if (note != null)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xxs),
                      child: Text(note!, style: context.text.caption.copyWith(color: c.warningText)),
                    ),
                ],
              ),
            ),
            if (copyable)
              Semantics(
                button: true,
                label: 'Sao chép $label',
                excludeSemantics: true,
                child: TextButton.icon(
                  style: TextButton.styleFrom(minimumSize: const Size(AppSizes.touch, AppSizes.touchMin)),
                  onPressed: () => _copy(context),
                  icon: Icon(AppIcons.copy, size: AppSizes.iconSm, color: c.primary),
                  label: Text('Chép', style: context.text.label.copyWith(color: c.primary)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
