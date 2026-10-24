import 'package:flutter/material.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';

/// Ô soạn tin: văn bản + đính kèm tệp (≤ 10MB), nút gửi.
class MessageComposer extends StatelessWidget {
  const MessageComposer({
    super.key,
    required this.controller,
    required this.file,
    required this.onPickFile,
    required this.onClearFile,
    required this.onSend,
    required this.onChanged,
  });

  final TextEditingController controller;
  final PickedFile? file;
  final VoidCallback onPickFile;
  final VoidCallback onClearFile;
  final VoidCallback onSend;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xs),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (file != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: FilePickerTile(file: file, onPick: onPickFile, onClear: onClearFile, hint: 'Tối đa 10 MB'),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: 'Đính kèm tệp (≤ 10 MB)',
                    icon: const Icon(AppIcons.attach),
                    onPressed: onPickFile,
                  ),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      minLines: 1,
                      maxLines: 5,
                      onChanged: onChanged,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        hintText: 'Nhập tin nhắn…',
                        border: const OutlineInputBorder(borderRadius: AppRadius.pillAll),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: AppRadius.pillAll,
                          borderSide: BorderSide(color: c.border),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  IconButton.filled(
                    tooltip: 'Gửi',
                    onPressed: onSend,
                    style: IconButton.styleFrom(
                      backgroundColor: c.primary,
                      foregroundColor: c.accent,
                      minimumSize: const Size.square(AppSizes.touch),
                    ),
                    icon: const Icon(AppIcons.send),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
