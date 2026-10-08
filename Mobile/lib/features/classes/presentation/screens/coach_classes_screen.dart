import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';

/// H07 — Khóa học của HLV theo trạng thái duyệt.
class CoachClassesScreen extends ConsumerStatefulWidget {
  const CoachClassesScreen({super.key});

  @override
  ConsumerState<CoachClassesScreen> createState() => _CoachClassesScreenState();
}

class _CoachClassesScreenState extends ConsumerState<CoachClassesScreen> {
  ClassStatus _status = ClassStatus.approved;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(coachClassesProvider);
    final all = value.value ?? const <CourseClass>[];
    return AppScaffold(
      title: 'Khóa học của tôi',
      actions: const [HeaderActions()],
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(AppRoutes.createClass),
        backgroundColor: context.colors.primary,
        foregroundColor: context.colors.accent,
        icon: const Icon(AppIcons.add),
        label: const Text('Tạo khóa học'),
      ),
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<ClassStatus>(
            selected: _status,
            onChanged: (v) => setState(() => _status = v),
            options: [
              for (final s in const [
                ClassStatus.approved,
                ClassStatus.pending,
                ClassStatus.completed,
                ClassStatus.rejected,
              ])
                SegmentOption(s, s.status.label, count: all.where((c) => c.status == s).length),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(coachClassesProvider),
              data: (list) {
                final items = list.where((c) => c.status == _status).toList();
                if (items.isEmpty) {
                  return EmptyState(
                    icon: AppIcons.course,
                    title: 'Không có khóa "${_status.status.label.toLowerCase()}"',
                    message: 'Tạo khóa học mới, đặt giá và lịch — Quản lý sẽ duyệt trước khi mở bán.',
                    actionLabel: 'Tạo khóa học',
                    onAction: () => context.push(AppRoutes.createClass),
                  );
                }
                return RefreshableList(
                  onRefresh: () => ref.refresh(coachClassesProvider.future),
                  padding: EdgeInsets.fromLTRB(
                    context.screenPadding,
                    AppSpacing.md,
                    context.screenPadding,
                    AppSpacing.xxl * 2,
                  ),
                  itemCount: items.length,
                  itemBuilder: (context, i) => CoachClassCard(course: items[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ khóa ở góc nhìn HLV.
class CoachClassCard extends StatelessWidget {
  const CoachClassCard({super.key, required this.course, this.onTap});

  final CourseClass course;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      onTap: onTap ?? () => context.push(AppRoutes.coachClass(course.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(course.name, style: context.text.bodyStrong)),
              course.status.status.tag(dense: true),
            ],
          ),
          Text(
            '${course.sportNames} · ${course.classType.label}',
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (course.status == ClassStatus.rejected && course.rejectReason != null) ...[
            AlertBanner.error(message: course.rejectReason!),
            const SizedBox(height: AppSpacing.sm),
          ],
          LabeledProgress(value: course.completedSessionCount, total: course.mainSessionCount, label: 'Buổi đã dạy'),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: InfoRow(icon: AppIcons.users, text: '${course.studentCount}/${course.capacity} học viên'),
              ),
              MoneyText(course.price, style: context.text.label.copyWith(color: c.primary)),
            ],
          ),
          if (course.coachRevenue > 0)
            InfoRow(
              icon: AppIcons.wallet,
              text: 'Doanh thu của bạn (85%): ',
              trailing: MoneyText(course.coachRevenue, style: context.text.label),
            ),
        ],
      ),
    );
  }
}
