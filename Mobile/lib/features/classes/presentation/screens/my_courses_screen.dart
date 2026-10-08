import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';

/// M05 — Khóa học của tôi: Đang học · Sắp khai giảng · Đã kết thúc.
class MyCoursesScreen extends ConsumerStatefulWidget {
  const MyCoursesScreen({super.key});

  @override
  ConsumerState<MyCoursesScreen> createState() => _MyCoursesScreenState();
}

class _MyCoursesScreenState extends ConsumerState<MyCoursesScreen> {
  MyCoursePhase _phase = MyCoursePhase.ongoing;

  static const _labels = {
    MyCoursePhase.ongoing: 'Đang học',
    MyCoursePhase.upcoming: 'Sắp khai giảng',
    MyCoursePhase.ended: 'Đã kết thúc',
  };

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(myCoursesProvider);
    final all = value.value ?? const <MyCourse>[];
    return AppScaffold(
      title: 'Khóa học của tôi',
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<MyCoursePhase>(
            selected: _phase,
            onChanged: (v) => setState(() => _phase = v),
            options: [
              for (final p in MyCoursePhase.values)
                SegmentOption(p, _labels[p]!, count: all.where((c) => c.phase == p).length),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(myCoursesProvider),
              data: (list) {
                final items = list.where((c) => c.phase == _phase).toList();
                if (items.isEmpty) {
                  return EmptyState(
                    icon: AppIcons.course,
                    title: 'Chưa có khóa học ${_labels[_phase]!.toLowerCase()}',
                    message: 'Khám phá các khóa học do HLV mở và bắt đầu tập luyện.',
                    actionLabel: 'Khám phá khóa học',
                    onAction: () => context.go(AppRoutes.memberClasses),
                  );
                }
                return RefreshableList(
                  onRefresh: () => ref.refresh(myCoursesProvider.future),
                  itemCount: items.length,
                  itemBuilder: (context, i) => MyCourseCard(item: items[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ khóa đã mua: tiến độ, buổi tiếp theo, trạng thái hoàn tiền.
class MyCourseCard extends StatelessWidget {
  const MyCourseCard({super.key, required this.item});

  final MyCourse item;

  @override
  Widget build(BuildContext context) {
    final course = item.course;
    final c = context.colors;
    return AppCard(
      onTap: () => context.push(AppRoutes.myCourse(course.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox.square(
                dimension: AppSpacing.xxl + AppSpacing.xs,
                child: AppNetworkImage(
                  url: null,
                  seed: course.id,
                  placeholderIcon: sportIcon(course.sports),
                  iconSize: AppSizes.iconLg,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(course.name, style: context.text.bodyStrong),
                    Text('HLV ${course.coach.fullName}', style: context.text.caption.copyWith(color: c.textMuted)),
                    if (item.refundStatusLabel != null) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      StatusLabel(item.refundStatusLabel!, StatusTone.warning).tag(dense: true),
                    ],
                  ],
                ),
              ),
              Icon(AppIcons.chevronRight, color: c.textMuted),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          LabeledProgress(value: item.attendedCount, total: item.totalSessions, label: 'Buổi đã tham gia'),
          const SizedBox(height: AppSpacing.xs),
          InfoRow(
            icon: AppIcons.calendar,
            text: item.nextSessionStart == null
                ? (item.phase == MyCoursePhase.ended ? 'Khóa học đã kết thúc' : 'Không còn buổi đang giữ chỗ')
                : 'Buổi tới: ${VnTime.friendlyDay(item.nextSessionStart!, DateTime.now())} · ${VnTime.time(item.nextSessionStart!)}',
          ),
        ],
      ),
    );
  }
}
