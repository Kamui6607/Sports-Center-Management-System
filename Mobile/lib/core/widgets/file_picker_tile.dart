import 'package:flutter/material.dart';

import '../data/picked_file.dart';
import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Ô chọn tệp: trống ⇒ vùng chạm "Chọn tệp"; đã chọn ⇒ tên, dung lượng, đổi/xóa.
class FilePickerTile extends StatelessWidget {
  const FilePickerTile({
    super.key,
    required this.file,
    required this.onPick,
    required this.onClear,
    required this.hint,
    this.errorText,
    this.enabled = true,
  });

  final PickedFile? file;
  final VoidCallback onPick;
  final VoidCallback onClear;
  final String hint;
  final String? errorText;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger);
    final f = file;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: f == null ? c.surfaceMuted : c.surface,
          shape: RoundedRectangleBorder(
            borderRadius: AppRadius.cardAll,
            side: BorderSide(color: errorText != null ? danger.foreground : c.borderStrong),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onPick : null,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: f == null
                  ? Column(
                      children: [
                        Icon(AppIcons.upload, size: AppSizes.iconXl, color: c.primary),
                        const SizedBox(height: AppSpacing.xs),
                        Text('Chạm để chọn tệp', style: context.text.bodyStrong),
                        Text(
                          hint,
                          textAlign: TextAlign.center,
                          style: context.text.caption.copyWith(color: c.textMuted),
                        ),
                      ],
                    )
                  : Row(
                      children: [
                        Icon(f.isImage ? AppIcons.image : AppIcons.file, size: AppSizes.iconXl, color: c.primary),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                f.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.bodyStrong,
                              ),
                              Text(
                                '${f.extension.toUpperCase()} · ${f.sizeLabel}',
                                style: context.text.caption.copyWith(color: c.textMuted),
                              ),
                            ],
                          ),
                        ),
                        if (enabled)
                          IconButton(tooltip: 'Bỏ tệp', icon: const Icon(AppIcons.close), onPressed: onClear),
                      ],
                    ),
            ),
          ),
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(errorText!, style: context.text.caption.copyWith(color: danger.foreground)),
          ),
      ],
    );
  }
}
