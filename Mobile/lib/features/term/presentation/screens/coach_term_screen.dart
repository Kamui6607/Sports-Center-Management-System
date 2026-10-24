import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/coach_term_repository_provider.dart';
import '../../domain/entities/coach_term.dart';
import '../providers/term_providers.dart';
import '../term_labels.dart';

/// Kỳ học & quyền lợi của HLV: đã đạt yêu cầu kỳ này chưa, còn thiếu gì, thẻ ra vào, nghỉ phép.
class CoachTermScreen extends ConsumerWidget {
  const CoachTermScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(coachTermStatusProvider);
    return AppScaffold(
      title: 'Kỳ học & quyền lợi',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(coachTermStatusProvider),
        data: (status) => RefreshableScroll(
          onRefresh: () {
            ref.invalidate(myLeavesProvider);
            return ref.refresh(coachTermStatusProvider.future);
          },
          children: [
            _StatusCard(status: status),
            if (status.evaluation != null) ...[
              const SizedBox(height: AppSpacing.md),
              _ProgressCard(evaluation: status.evaluation!),
            ],
            const SizedBox(height: AppSpacing.md),
            _PassBanner(status: status),
            const SizedBox(height: AppSpacing.sm),
            AppButton.outline(
              label: 'Check-in phòng gym',
              icon: AppIcons.building,
              expand: true,
              onPressed: () => context.push(AppRoutes.coachCheckin),
            ),
            const SizedBox(height: AppSpacing.lg),
            const _LeaveSection(),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.status});

  final CoachTermStatus status;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final term = status.term;
    final ev = status.evaluation;
    if (!status.eligible || ev == null) {
      return const AlertBanner.info(
        title: 'Hồ sơ chưa được duyệt',
        message: 'Bạn sẽ được đánh giá theo kỳ sau khi Quản lý duyệt hồ sơ HLV.',
      );
    }
    final label = termStateLabel(ev.state);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(term.name, style: context.text.title)),
              label.tag(),
            ],
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            '${VnTime.date(term.startDate)} – ${VnTime.date(term.endDate)} · ${termPhaseLabel(term.phase)}',
            style: context.text.small.copyWith(color: c.textMuted),
          ),
          if (!ev.isFinal && ev.state != CoachTermState.exempt)
            Text('Kết quả tạm thời — chốt khi kỳ kết thúc.', style: context.text.caption.copyWith(color: c.textMuted)),
          const SizedBox(height: AppSpacing.sm),
          for (final r in ev.reasons)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xxs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Icon(AppIcons.chevronRight, size: AppSizes.iconSm, color: c.textMuted),
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Expanded(child: Text(r, style: context.text.body)),
                ],
              ),
            ),
          for (final w in ev.warnings)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: AlertBanner.warning(message: w),
            ),
          if (status.previousState == CoachTermState.nonCompliant)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: AlertBanner.error(
                title: '${status.previousTermName ?? 'Kỳ trước'} chưa đạt',
                message: 'Cần có khóa học hợp lệ của kỳ này để thẻ ra vào được chấp nhận.',
              ),
            ),
        ],
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.evaluation});

  final CoachTermEvaluation evaluation;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final reg = evaluation.registration;
    final del = evaluation.delivery;
    final pct = (reg.mainSessions / reg.requiredSessions).clamp(0.0, 1.0);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Đăng ký kỳ', style: context.text.bodyStrong),
          const SizedBox(height: AppSpacing.xs),
          ClipRRect(
            borderRadius: AppRadius.pillAll,
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: c.border,
              color: reg.ok ? c.successText : c.primary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            reg.ok
                ? '${reg.qualifyingClassName ?? 'Khóa học'} · ${reg.mainSessions} buổi, trải ${reg.spanDays} ngày'
                      '${reg.pendingApproval ? ' (chờ Quản lý duyệt)' : ''}'
                : 'Khóa tốt nhất hiện có ${reg.mainSessions}/${reg.requiredSessions} buổi, trải ${reg.spanDays}/${reg.requiredSpanDays} ngày',
            style: context.text.small,
          ),
          if (!reg.ok) ...[
            const SizedBox(height: AppSpacing.xxs),
            Text(
              'Hạn tạo khóa: ${VnTime.date(evaluation.lastDay)}'
              '${evaluation.daysToDeadline == null ? '' : ' (còn ${evaluation.daysToDeadline! < 1 ? 1 : evaluation.daysToDeadline} ngày)'}'
              '${evaluation.graceExtensionDays > 0 ? ' · đã cộng ${evaluation.graceExtensionDays} ngày nghỉ phép' : ''}',
              style: context.text.small.copyWith(color: c.errorText),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton.secondary(
              label: 'Tạo khóa học',
              icon: AppIcons.add,
              expand: true,
              onPressed: () => context.push(AppRoutes.createClass),
            ),
          ],
          const Divider(height: AppSpacing.lg),
          Text('Việc dạy trong kỳ', style: context.text.bodyStrong),
          const SizedBox(height: AppSpacing.xs),
          KeyValueRow(label: 'Đã dạy', value: '${del.completed} buổi'),
          KeyValueRow(label: 'Chưa bấm "Hoàn tất"', value: '${del.awaitingComplete} buổi'),
          KeyValueRow(label: 'Sắp tới', value: '${del.scheduledFuture} buổi'),
          KeyValueRow(label: 'Đã hủy', value: '${del.cancelled} buổi'),
          KeyValueRow(label: 'Tỷ lệ đã dạy', value: percentLabel(del.completionRate)),
          KeyValueRow(label: 'Tỷ lệ hủy', value: percentLabel(del.cancelRate)),
          if (evaluation.leaveApprovedDays > 0)
            KeyValueRow(label: 'Nghỉ phép được duyệt', value: '${evaluation.leaveApprovedDays} ngày'),
        ],
      ),
    );
  }
}

class _PassBanner extends StatelessWidget {
  const _PassBanner({required this.status});

  final CoachTermStatus status;

  @override
  Widget build(BuildContext context) {
    final v = status.pass;
    final action = TextButton(onPressed: () => context.push(AppRoutes.coachPass), child: const Text('Mở thẻ'));
    return switch (v.level) {
      PassLevel.ok => AlertBanner.success(title: 'Thẻ ra vào hợp lệ', message: v.reason, action: action),
      PassLevel.warn => AlertBanner.warning(title: 'Thẻ ra vào — cần lưu ý', message: v.reason, action: action),
      PassLevel.deny => AlertBanner.error(title: 'Thẻ ra vào không hợp lệ', message: v.reason, action: action),
    };
  }
}

class _LeaveSection extends ConsumerWidget {
  const _LeaveSection();

  Future<void> _cancel(BuildContext context, WidgetRef ref, CoachLeave leave) async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Hủy đơn nghỉ?',
      message: 'Đơn nghỉ ${VnTime.date(leave.startDate)} – ${VnTime.date(leave.endDate)} sẽ bị hủy.',
      confirmLabel: 'Hủy đơn',
      cancelLabel: 'Giữ lại',
    );
    if (!ok || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref.read(coachTermRepositoryProvider).cancelLeave(leave.id),
      success: 'Đã hủy đơn nghỉ.',
    );
    if (done != null) ref.read(dataRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leaves = ref.watch(myLeavesProvider);
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Nghỉ phép / ốm',
          actionLabel: 'Xin nghỉ',
          onAction: () => context.push(AppRoutes.coachLeaveForm),
        ),
        Text(
          'Nghỉ được duyệt sẽ gia hạn hạn tạo khóa và không tính các buổi hủy trong thời gian nghỉ.',
          style: context.text.caption.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: AppSpacing.sm),
        // Nằm trong màn đã cuộn ⇒ KHÔNG dùng skeleton dạng ListView (unbounded height); tự xử lý 3 trạng thái.
        leaves.when(
          loading: () => const Center(
            child: Padding(padding: EdgeInsets.all(AppSpacing.md), child: CircularProgressIndicator.adaptive()),
          ),
          error: (e, _) => Row(
            children: [
              Expanded(
                child: Text(AppFailure.from(e).message, style: context.text.small.copyWith(color: c.errorText)),
              ),
              TextButton(onPressed: () => ref.invalidate(myLeavesProvider), child: const Text('Thử lại')),
            ],
          ),
          data: (list) => list.isEmpty
              ? Text('Bạn chưa có đơn nghỉ nào.', style: context.text.small.copyWith(color: c.textMuted))
              : Column(
                  children: [
                    for (final l in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${VnTime.date(l.startDate)} – ${VnTime.date(l.endDate)}',
                                      style: context.text.bodyStrong,
                                    ),
                                  ),
                                  leaveStatusLabel(l.status).tag(),
                                ],
                              ),
                              Text(
                                '${leaveKindLabel(l.kind)} · ${l.reason}',
                                style: context.text.small.copyWith(color: c.textMuted),
                              ),
                              if (l.reviewNote != null && l.reviewNote!.isNotEmpty)
                                Text(
                                  'Ghi chú: ${l.reviewNote}',
                                  style: context.text.caption.copyWith(color: c.textMuted),
                                ),
                              if (l.canCancel(DateTime.now()))
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton(
                                    onPressed: () => _cancel(context, ref, l),
                                    child: const Text('Hủy đơn'),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
