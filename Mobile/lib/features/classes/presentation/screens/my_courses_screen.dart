import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../feedbacks/presentation/feedback_widgets.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';

/// Nhóm tab của lịch sử khóa học.
enum CourseHistoryTab { active, completed, cancelled }

/// M05 — Khóa học của tôi / Lịch sử khóa học đã mua (`GET /enrollments/my/courses`):
/// Đang hoạt động (chờ thanh toán · sắp khai giảng · đang diễn ra) · Đã hoàn thành · Đã hủy.
/// Giá & tên khóa hiển thị theo ảnh chụp lúc mua — không đổi khi khóa bị sửa sau đó.
class MyCoursesScreen extends ConsumerStatefulWidget {
  const MyCoursesScreen({super.key, this.initialTab = CourseHistoryTab.active});

  final CourseHistoryTab initialTab;

  @override
  ConsumerState<MyCoursesScreen> createState() => _MyCoursesScreenState();
}

class _MyCoursesScreenState extends ConsumerState<MyCoursesScreen> {
  late CourseHistoryTab _tab = widget.initialTab;

  static const _labels = {
    CourseHistoryTab.active: 'Đang hoạt động',
    CourseHistoryTab.completed: 'Đã hoàn thành',
    CourseHistoryTab.cancelled: 'Đã hủy',
  };

  static CourseHistoryTab _tabOf(MemberCourse c) => switch (c.status) {
    MemberCourseStatus.completed => CourseHistoryTab.completed,
    MemberCourseStatus.cancelled => CourseHistoryTab.cancelled,
    _ => CourseHistoryTab.active,
  };

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(courseHistoryProvider);
    final all = value.value ?? const <MemberCourse>[];
    return AppScaffold(
      title: 'Khóa học của tôi',
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<CourseHistoryTab>(
            selected: _tab,
            onChanged: (v) => setState(() => _tab = v),
            options: [
              for (final t in CourseHistoryTab.values)
                SegmentOption(t, _labels[t]!, count: all.where((c) => _tabOf(c) == t).length),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(courseHistoryProvider),
              data: (list) {
                final items = list.where((c) => _tabOf(c) == _tab).toList();
                if (items.isEmpty) {
                  return EmptyState(
                    icon: AppIcons.course,
                    title: 'Chưa có khóa học ${_labels[_tab]!.toLowerCase()}',
                    message: 'Khám phá các khóa học Gym do HLV mở và bắt đầu tập luyện.',
                    actionLabel: 'Khám phá khóa học',
                    onAction: () => context.go(AppRoutes.memberClasses),
                  );
                }
                return RefreshableList(
                  onRefresh: () => ref.refresh(courseHistoryProvider.future),
                  itemCount: items.length,
                  itemBuilder: (context, i) => MemberCourseCard(item: items[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ khóa đã mua: trạng thái, số tiền & ngày thanh toán, tiến độ, buổi tới, đánh giá.
class MemberCourseCard extends StatelessWidget {
  const MemberCourseCard({super.key, required this.item});

  final MemberCourse item;

  void _review(BuildContext context, {required bool edit}) {
    final coachId = item.coachProfileId;
    if (coachId == null) return;
    showFeedbackSheet(
      context,
      coachProfileId: coachId,
      coachName: item.coachName,
      classId: item.classId,
      className: item.className,
      isEdit: edit,
      initialRating: item.myRating,
      initialComment: item.myReviewComment,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pending = item.status == MemberCourseStatus.pendingPayment;
    return AppCard(
      onTap: () => pending && item.paymentId != null
          ? context.push(AppRoutes.payment(item.paymentId!))
          : context.push(AppRoutes.myCourse(item.classId)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppAvatar(name: item.coachName, imageUrl: item.coachAvatarUrl, size: AppSizes.avatar),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.className, style: context.text.bodyStrong),
                    Text('HLV ${item.coachName}', style: context.text.caption.copyWith(color: c.textMuted)),
                    const SizedBox(height: AppSpacing.xxs),
                    Wrap(
                      spacing: AppSpacing.xxs,
                      runSpacing: AppSpacing.xxs,
                      children: [
                        item.status.tag.tag(dense: true),
                        if (item.pendingRefundAmount != null)
                          const StatusLabel('Chờ duyệt hoàn tiền', StatusTone.warning).tag(dense: true),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(AppIcons.chevronRight, color: c.textMuted),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          InfoRow(
            icon: AppIcons.invoice,
            text: pending
                ? 'Cần thanh toán ${Money.format(item.amountPaid)}'
                : 'Đã thanh toán ${Money.format(item.amountPaid)}${item.paidAt == null ? '' : ' · ${VnTime.date(item.paidAt!)}'}',
          ),
          if (item.startDate != null && item.endDate != null)
            InfoRow(icon: AppIcons.calendar, text: '${VnTime.date(item.startDate!)} – ${VnTime.date(item.endDate!)}'),
          if (pending && item.pendingExpiresAt != null)
            InfoRow(
              icon: AppIcons.pending,
              text: 'Hết hạn chuyển khoản lúc ${VnTime.time(item.pendingExpiresAt!)} — chạm để tiếp tục thanh toán',
              color: context.tones.of(StatusTone.warning).foreground,
            ),
          if (!pending && item.totalSessions > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            LabeledProgress(value: item.completedSessions, total: item.totalSessions, label: 'Buổi đã diễn ra'),
          ],
          if (item.isActive && item.nextSessionStart != null)
            InfoRow(
              icon: AppIcons.time,
              text:
                  'Buổi tới: ${VnTime.friendlyDay(item.nextSessionStart!, DateTime.now())} · ${VnTime.time(item.nextSessionStart!)}',
            ),
          if (item.status == MemberCourseStatus.completed) ...[
            const SizedBox(height: AppSpacing.sm),
            if (item.myRating != null)
              Row(
                children: [
                  Text('Đánh giá của bạn: ', style: context.text.small),
                  RatingStars(rating: item.myRating!.toDouble()),
                  const Spacer(),
                  if (item.canEditReview)
                    TextButton(onPressed: () => _review(context, edit: true), child: const Text('Sửa (còn 1 lần)')),
                ],
              )
            else if (item.canReview)
              AppButton.outline(
                label: 'Đánh giá khóa học',
                icon: AppIcons.star,
                expand: true,
                onPressed: () => _review(context, edit: false),
              ),
          ],
        ],
      ),
    );
  }
}
