import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../feedbacks/presentation/feedback_widgets.dart';
import '../../../refunds/presentation/providers/refund_providers.dart';
import '../../../schedule/domain/entities/session.dart';
import '../../../schedule/presentation/providers/schedule_providers.dart';
import '../../../schedule/presentation/session_labels.dart';
import '../../../schedule/presentation/widgets/session_tile.dart';
import '../../domain/entities/course.dart';
import '../providers/course_providers.dart';
import '../widgets/class_card.dart';

/// M06 — Chi tiết khóa đã mua: buổi học, điểm danh, lộ trình, đánh giá, hủy khóa.
class MyCourseDetailScreen extends ConsumerWidget {
  const MyCourseDetailScreen({super.key, required this.classId});

  final String classId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courses = ref.watch(myCoursesProvider);
    return AppScaffold(
      title: 'Khóa học của tôi',
      body: AsyncValueView(
        value: courses,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(myCoursesProvider),
        data: (list) {
          final item = list.where((c) => c.course.id == classId).firstOrNull;
          if (item == null) {
            return EmptyState(
              icon: AppIcons.course,
              title: 'Bạn chưa sở hữu khóa học này',
              message: 'Khóa có thể đã được hoàn tiền.',
              actionLabel: 'Xem chi tiết khóa',
              onAction: () => context.pushReplacement(AppRoutes.classDetail(classId)),
            );
          }
          return RefreshableScroll(
            onRefresh: () async {
              ref.invalidate(myAllSessionsProvider);
              ref.invalidate(myCoursesProvider);
              await ref.read(myCoursesProvider.future);
            },
            children: [_Content(item: item)],
          );
        },
      ),
    );
  }
}

class _Content extends ConsumerWidget {
  const _Content({required this.item});

  final MyCourse item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final course = item.course;
    final c = context.colors;
    final sessions = (ref.watch(myAllSessionsProvider).value ?? const <MySession>[])
        .where((s) => s.session.classId == course.id)
        .toList();
    final now = DateTime.now();
    final upcoming = sessions
        .where((s) => !s.session.hasEnded(now) && s.session.status != ScheduleStatus.cancelled)
        .toList();
    final past = sessions
        .where((s) => s.session.hasEnded(now) || s.session.status == ScheduleStatus.cancelled)
        .toList()
        .reversed
        .toList();
    final eligibility = ref.watch(cancellationEligibilityProvider(course.id)).value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(course.name, style: context.text.headline),
        Text('Mua ngày ${VnTime.date(item.purchasedAt)}', style: context.text.caption.copyWith(color: c.textMuted)),
        const SizedBox(height: AppSpacing.md),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LabeledProgress(value: item.attendedCount, total: item.totalSessions, label: 'Buổi đã tham gia'),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: AppButton.outline(
                      label: 'Lộ trình tập',
                      icon: AppIcons.training,
                      size: AppButtonSize.small,
                      onPressed: () => context.push(AppRoutes.training),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: AppButton.outline(
                      label: 'Chuyên cần',
                      icon: AppIcons.attendance,
                      size: AppButtonSize.small,
                      onPressed: () => context.push(AppRoutes.attendance),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        CoachMiniCard(coach: course.coach, onChat: () => context.push(AppRoutes.chatRoom(course.coach.userId))),
        const SizedBox(height: AppSpacing.lg),
        SectionHeader(title: 'Buổi sắp tới (${upcoming.length})'),
        if (upcoming.isEmpty)
          Text('Không còn buổi nào đang giữ chỗ.', style: context.text.small.copyWith(color: c.textMuted))
        else
          for (final s in upcoming)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: SessionTile(
                session: s.session,
                showDate: true,
                onTap: () => context.push(AppRoutes.mySession(s.session.id)),
              ),
            ),
        if (past.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          SectionHeader(title: 'Đã qua (${past.length})'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
            child: Column(
              children: [
                for (var i = 0; i < past.length; i++) ...[
                  if (i > 0) const Divider(),
                  InkWell(
                    onTap: () => context.push(AppRoutes.mySession(past[i].session.id)),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              VnTime.sessionLabel(past[i].session.startTime, past[i].session.endTime),
                              style: context.text.small,
                            ),
                          ),
                          (past[i].session.status == ScheduleStatus.cancelled
                                  ? sessionStatus(past[i].session, now)
                                  : (past[i].attendance?.status ?? notCheckedIn))
                              .tag(dense: true),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        CoachFeedbackSection(
          coachProfileId: course.coach.coachProfileId,
          coachName: course.coach.fullName,
          classId: course.id,
        ),
        const SizedBox(height: AppSpacing.lg),
        const SectionHeader(title: 'Hủy khóa & hoàn tiền'),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (eligibility == null)
                const Shimmer(child: SkeletonBox(height: AppSpacing.xl))
              else if (eligibility.allowed) ...[
                Text(
                  'Bạn có thể hủy khóa đến ${VnTime.dateTime(eligibility.deadline!)} '
                  '(còn ${VnTime.durationLabel(eligibility.deadline!.difference(now))}).',
                  style: context.text.small,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton.outline(
                  label: 'Yêu cầu hủy khóa',
                  icon: AppIcons.ban,
                  expand: true,
                  onPressed: () => context.push(AppRoutes.cancelCourse(course.id)),
                ),
              ] else ...[
                Row(
                  children: [
                    Icon(AppIcons.lock, size: AppSizes.iconSm, color: c.textMuted),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        eligibility.blockReason ?? '',
                        style: context.text.small.copyWith(color: c.textMuted),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                TextButton(
                  onPressed: () => context.push(AppRoutes.refunds),
                  child: const Text('Xem yêu cầu hoàn tiền'),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton.ghost(
          label: 'Xem trang giới thiệu khóa',
          expand: true,
          onPressed: () => context.push(AppRoutes.classDetail(course.id)),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}
