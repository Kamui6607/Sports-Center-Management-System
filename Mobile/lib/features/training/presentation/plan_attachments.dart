import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/platform/file_service.dart';
import '../../../core/platform/media_service.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../data/training_repository_provider.dart';
import '../domain/entities/training.dart';

/// Tài liệu (PDF/Excel) của lộ trình: HLV [coachMode] tải lên / xóa; học viên mở xem.
/// Giới hạn theo BE `planAttachmentUploadSingle`: ≤ 10 MB/tệp, tối đa 20 tệp/lộ trình.
class PlanAttachmentsSection extends ConsumerStatefulWidget {
  const PlanAttachmentsSection({super.key, required this.plan, this.coachMode = false});

  final TrainingPlan plan;
  final bool coachMode;

  static const maxBytes = 10 * 1024 * 1024;
  static const maxFiles = 20;

  @override
  ConsumerState<PlanAttachmentsSection> createState() => _PlanAttachmentsSectionState();
}

class _PlanAttachmentsSectionState extends ConsumerState<PlanAttachmentsSection> {
  bool _uploading = false;

  /// Tệp đang tải về để mở (hiện vòng xoay trên dòng đó).
  String? _openingId;

  Future<void> _upload() async {
    if (widget.plan.attachments.length >= PlanAttachmentsSection.maxFiles) {
      AppSnackbar.info(context, 'Mỗi lộ trình tối đa ${PlanAttachmentsSection.maxFiles} tệp.');
      return;
    }
    final file = await ref.read(fileServiceProvider).pickPlanDocument();
    if (file == null || !mounted) return;
    if (file.sizeBytes > PlanAttachmentsSection.maxBytes) {
      AppSnackbar.info(context, 'Tệp "${file.name}" vượt quá 10 MB.');
      return;
    }
    setState(() => _uploading = true);
    final saved = await runAction(
      context,
      () => ref.read(trainingRepositoryProvider).addAttachment(widget.plan.id, file),
      success: 'Đã đính kèm "${file.name}"',
    );
    if (!mounted) return;
    setState(() => _uploading = false);
    if (saved != null) ref.read(dataRevisionProvider.notifier).bump();
  }

  Future<void> _open(PlanAttachment a) async {
    setState(() => _openingId = a.id);
    // Tải tệp có xác thực rồi mở bằng ứng dụng xem PDF/Excel của máy (bảng chia sẻ).
    await runAction(context, () async {
      final bytes = await ref.read(trainingRepositoryProvider).attachmentFile(widget.plan.id, a.id);
      await ref.read(mediaServiceProvider).shareFile(bytes, fileName: a.name, mimeType: a.mimeType);
    });
    if (mounted) setState(() => _openingId = null);
  }

  Future<void> _delete(PlanAttachment a) async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Xóa tệp đính kèm?',
      message: 'Học viên sẽ không xem được "${a.name}" nữa.',
      confirmLabel: 'Xóa tệp',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final done = await runAction(context, () async {
      await ref.read(trainingRepositoryProvider).deleteAttachment(widget.plan.id, a.id);
      return true;
    }, success: 'Đã xóa tệp');
    if (done == true && mounted) ref.read(dataRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context) {
    final files = widget.plan.attachments;
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: 'Tài liệu đính kèm (${files.length})'),
        if (files.isEmpty)
          EmptyState(
            compact: true,
            icon: AppIcons.file,
            title: widget.coachMode ? 'Chưa có tài liệu' : 'HLV chưa đính kèm tài liệu',
            message: widget.coachMode ? 'Đính kèm giáo án, bảng bài tập (PDF/Excel) cho học viên.' : null,
          )
        else
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final (i, a) in files.indexed) ...[
                  if (i > 0) Divider(height: AppSizes.divider, color: c.border),
                  ListTile(
                    onTap: _openingId == null ? () => _open(a) : null,
                    leading: Icon(a.isPdf ? AppIcons.file : AppIcons.spreadsheet, color: c.primary),
                    title: Text(a.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyStrong),
                    subtitle: Text(
                      '${PickedFile.formatBytes(a.sizeBytes)} · ${VnTime.date(a.createdAt)}',
                      style: context.text.caption.copyWith(color: c.textMuted),
                    ),
                    trailing: _openingId == a.id
                        ? const SizedBox.square(
                            dimension: AppSizes.icon,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : (widget.coachMode
                              ? IconButton(
                                  tooltip: 'Xóa tệp',
                                  icon: const Icon(AppIcons.delete),
                                  onPressed: () => _delete(a),
                                )
                              : Icon(AppIcons.download, color: c.textMuted)),
                  ),
                ],
              ],
            ),
          ),
        if (!widget.coachMode && files.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xxs),
            child: Text(
              'Chạm vào tệp để mở xem hoặc lưu về máy',
              style: context.text.caption.copyWith(color: c.textMuted),
            ),
          ),
        if (widget.coachMode) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton.outline(
            label: 'Đính kèm PDF / Excel',
            icon: AppIcons.attach,
            loading: _uploading,
            expand: true,
            onPressed: _uploading ? null : _upload,
          ),
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xxs),
            child: Text(
              'Tối đa 10 MB/tệp · ${PlanAttachmentsSection.maxFiles} tệp/lộ trình',
              textAlign: TextAlign.center,
              style: context.text.caption.copyWith(color: c.textMuted),
            ),
          ),
        ],
      ],
    );
  }
}
