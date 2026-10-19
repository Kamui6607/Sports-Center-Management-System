import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../data/feedback_repository_provider.dart';
import '../domain/entities/feedback.dart';

typedef CoachFeedbackArgs = ({String coachProfileId, String? classId});

final coachFeedbackProvider = FutureProvider.autoDispose.family<FeedbackPage, CoachFeedbackArgs>((ref, args) {
  ref.watch(dataRevisionProvider);
  return ref.watch(feedbackRepositoryProvider).forCoach(args.coachProfileId, classId: args.classId);
});

/// Một đánh giá.
class FeedbackTile extends StatelessWidget {
  const FeedbackTile({super.key, required this.item});

  final CoachFeedback item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          item.isAnonymous
              ? CircleAvatar(
                  radius: AppSizes.avatarSm / 2,
                  backgroundColor: c.surfaceMuted,
                  child: Icon(AppIcons.user, size: AppSizes.iconSm, color: c.textMuted),
                )
              : AppAvatar(name: item.authorName, size: AppSizes.avatarSm),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.isMine ? '${item.authorName} (bạn)' : item.authorName,
                        style: context.text.label,
                      ),
                    ),
                    Text(VnTime.date(item.createdAt), style: context.text.caption.copyWith(color: c.textMuted)),
                  ],
                ),
                RatingStars(rating: item.rating.toDouble()),
                if (item.className != null)
                  Text(item.className!, style: context.text.caption.copyWith(color: c.textMuted)),
                if (item.comment != null) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(item.comment!, style: context.text.small),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Khối "Đánh giá HLV" ở chi tiết khóa học / khóa của tôi (chỉ xem). Học viên đánh giá khóa đã HỌC XONG
/// ở màn Lịch sử khóa học (1 lần + sửa lại 1 lần — Doc/GYM_SCOPE_CHANGES.md §7).
class CoachFeedbackSection extends ConsumerWidget {
  const CoachFeedbackSection({
    super.key,
    required this.coachProfileId,
    required this.coachName,
    this.classId,
    this.limit = 3,
  });

  final String coachProfileId;
  final String coachName;
  final String? classId;
  final int limit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page = ref.watch(coachFeedbackProvider((coachProfileId: coachProfileId, classId: null)));
    return page.when(
      skipLoadingOnReload: true,
      loading: () => const Shimmer(child: SkeletonBox(height: AppSpacing.xxl * 2)),
      error: (e, _) => ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(coachFeedbackProvider)),
      data: (p) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeader(
              title: 'Đánh giá HLV',
              actionLabel: p.items.length > limit ? 'Xem tất cả (${p.items.length})' : null,
              onAction: () => showAppBottomSheet<void>(
                context: context,
                title: 'Đánh giá $coachName',
                expand: true,
                builder: (_) => Column(children: [for (final f in p.items) FeedbackTile(item: f)]),
              ),
            ),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (p.summary.count == 0)
                    Text(
                      'Chưa có đánh giá nào cho HLV này.',
                      style: context.text.small.copyWith(color: context.colors.textMuted),
                    )
                  else
                    RatingSummary(
                      average: p.summary.average,
                      count: p.summary.count,
                      distribution: p.summary.distribution,
                    ),
                  for (final f in p.items.take(limit)) ...[const Divider(height: AppSpacing.lg), FeedbackTile(item: f)],
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Bạn có thể đánh giá sau khi hoàn thành khóa học (mục Lịch sử khóa học).',
                    style: context.text.caption.copyWith(color: context.colors.textMuted),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// M14 — Đánh giá khóa học đã học xong (1 lần) / sửa lại (đúng 1 lần). Học viên không tự xóa được đánh giá.
Future<void> showFeedbackSheet(
  BuildContext context, {
  required String coachProfileId,
  required String coachName,
  required String classId,
  required String className,
  bool isEdit = false,
  int? initialRating,
  String? initialComment,
}) => showAppBottomSheet<void>(
  context: context,
  title: isEdit ? 'Sửa đánh giá' : 'Đánh giá khóa học',
  subtitle: '$className · HLV $coachName',
  builder: (_) => _FeedbackForm(
    coachProfileId: coachProfileId,
    classId: classId,
    isEdit: isEdit,
    initialRating: initialRating,
    initialComment: initialComment,
  ),
);

class _FeedbackForm extends ConsumerStatefulWidget {
  const _FeedbackForm({
    required this.coachProfileId,
    required this.classId,
    required this.isEdit,
    this.initialRating,
    this.initialComment,
  });

  final String coachProfileId;
  final String classId;
  final bool isEdit;
  final int? initialRating;
  final String? initialComment;

  @override
  ConsumerState<_FeedbackForm> createState() => _FeedbackFormState();
}

class _FeedbackFormState extends ConsumerState<_FeedbackForm> with SubmittingState {
  late int _rating = widget.initialRating ?? 0;
  bool _anonymous = false;
  late final _comment = TextEditingController(text: widget.initialComment);

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    var ok = false;
    await submit(() async {
      await ref
          .read(feedbackRepositoryProvider)
          .submit(
            FeedbackDraft(
              coachProfileId: widget.coachProfileId,
              classId: widget.classId,
              rating: _rating,
              comment: _comment.text,
              isAnonymous: _anonymous,
            ),
          );
      ok = true;
    });
    if (!ok || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    Navigator.of(context).pop();
    AppSnackbar.success(context, widget.isEdit ? 'Đã cập nhật đánh giá.' : 'Cảm ơn bạn đã đánh giá!');
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AlertBanner.info(
        message: widget.isEdit
            ? 'Đây là lần sửa DUY NHẤT — sau khi lưu bạn không thể sửa đánh giá này nữa.'
            : 'Mỗi khóa học được đánh giá 1 lần và sửa lại tối đa 1 lần.',
      ),
      const SizedBox(height: AppSpacing.md),
      RatingInput(value: _rating, onChanged: (v) => setState(() => _rating = v)),
      const SizedBox(height: AppSpacing.md),
      AppTextField(
        label: 'Nhận xét',
        controller: _comment,
        hint: 'Chia sẻ trải nghiệm học với HLV…',
        maxLines: 4,
        maxLength: 1000,
      ),
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        value: _anonymous,
        onChanged: (v) => setState(() => _anonymous = v),
        title: Text('Đánh giá ẩn danh', style: context.text.bodyStrong),
        subtitle: const Text('Tên của bạn sẽ không hiển thị với HLV và học viên khác.'),
      ),
      if (formError != null) ...[const SizedBox(height: AppSpacing.xs), AlertBanner.error(message: formError!)],
      const SizedBox(height: AppSpacing.md),
      AppButton(
        label: widget.isEdit ? 'Lưu đánh giá' : 'Gửi đánh giá',
        expand: true,
        loading: submitting,
        onPressed: _rating == 0 ? null : _save,
      ),
    ],
  );
}
