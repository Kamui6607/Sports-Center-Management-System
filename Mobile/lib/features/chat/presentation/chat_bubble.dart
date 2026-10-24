import 'package:flutter/material.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/entities/chat.dart';

/// Bong bóng tin nhắn.
class ChatBubble extends StatelessWidget {
  const ChatBubble({super.key, required this.message, required this.mine, this.onRetry});

  final ChatMessage message;
  final bool mine;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = mine ? c.onPrimary : c.text;
    final failed = message.delivery == MessageDelivery.failed;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
          child: Column(
            crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
                decoration: BoxDecoration(
                  color: mine ? c.primary : c.surface,
                  border: mine ? null : Border.all(color: c.border),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(AppRadius.sheet),
                    topRight: const Radius.circular(AppRadius.sheet),
                    bottomLeft: Radius.circular(mine ? AppRadius.sheet : AppRadius.control / 2),
                    bottomRight: Radius.circular(mine ? AppRadius.control / 2 : AppRadius.sheet),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (message.attachment != null) _Attachment(attachment: message.attachment!, color: fg),
                    if (message.attachment != null && message.content != null) const SizedBox(height: AppSpacing.xs),
                    if (message.content != null)
                      SelectableText(message.content!, style: context.text.body.copyWith(color: fg)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: failed
                    ? TextButton.icon(
                        onPressed: onRetry,
                        icon: Icon(
                          AppIcons.refresh,
                          size: AppSizes.iconSm,
                          color: context.tones.of(StatusTone.danger).foreground,
                        ),
                        label: Text(
                          'Gửi lỗi · Gửi lại',
                          style: context.text.caption.copyWith(color: context.tones.of(StatusTone.danger).foreground),
                        ),
                      )
                    : Text(
                        [
                          VnTime.time(message.createdAt),
                          if (mine && message.delivery == MessageDelivery.sending) 'Đang gửi…',
                          if (mine && message.delivery == MessageDelivery.sent) (message.isRead ? 'Đã xem' : 'Đã gửi'),
                        ].join(' · '),
                        style: context.text.caption.copyWith(color: c.textMuted),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Attachment extends StatelessWidget {
  const _Attachment({required this.attachment, required this.color});

  final ChatAttachment attachment;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Tệp đính kèm ${attachment.name}',
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(attachment.isImage ? AppIcons.image : AppIcons.file, color: color),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                attachment.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: context.text.label.copyWith(color: color),
              ),
              Text(
                PickedFile.formatBytes(attachment.sizeBytes),
                style: context.text.caption.copyWith(color: color.withValues(alpha: 0.8)),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
