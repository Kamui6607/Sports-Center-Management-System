import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../schedule/presentation/widgets/session_tile.dart';
import '../../domain/entities/coach_class.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';

/// H08 — Chi tiết khóa (HLV): tổng quan, buổi học, học viên, doanh thu.
/// Dùng lại cho Manager khi duyệt ([reviewMode]).
class CoachClassDetailScreen extends ConsumerStatefulWidget {
  const CoachClassDetailScreen({super.key, required this.classId});

  final String classId;

  @override
  ConsumerState<CoachClassDetailScreen> createState() => _CoachClassDetailScreenState();
}

class _CoachClassDetailScreenState extends ConsumerState<CoachClassDetailScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(coachClassDetailProvider(widget.classId));
    final d = value.value;
    final canEdit = d != null && (d.course.status == ClassStatus.rejected || d.course.status == ClassStatus.pending);
    return AppScaffold(
      title: 'Chi tiết khóa học',
      bottomBar: canEdit
          ? StickyBottomBar(
              child: AppButton(
                label: d.course.status == ClassStatus.rejected ? 'Sửa & gửi lại' : 'Sửa khóa học',
                icon: AppIcons.edit,
                expand: true,
                onPressed: () => context.push(AppRoutes.editClass(widget.classId)),
              ),
            )
          : null,
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(coachClassDetailProvider(widget.classId)),
        data: (d) => Column(
          children: [
            const SizedBox(height: AppSpacing.sm),
            SegmentedTabs<int>(
              selected: _tab,
              onChanged: (v) => setState(() => _tab = v),
              options: [
                const SegmentOption(0, 'Tổng quan'),
                SegmentOption(1, 'Buổi học', count: d.sessions.length),
                SegmentOption(2, 'Học viên', count: d.students.length),
              ],
            ),
            Expanded(
              child: RefreshableScroll(
                onRefresh: () => ref.refresh(coachClassDetailProvider(widget.classId).future),
                children: [
                  switch (_tab) {
                    0 => ClassOverview(detail: d),
                    1 => _Sessions(detail: d),
                    _ => StudentsList(detail: d),
                  },
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tab tổng quan (dùng chung Coach / Manager).
class ClassOverview extends StatelessWidget {
  const ClassOverview({super.key, required this.detail, this.showRevenue = true});

  final CoachClassDetail detail;
  final bool showRevenue;

  @override
  Widget build(BuildContext context) {
    final course = detail.course;
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(spacing: AppSpacing.xxs, children: [course.status.status.tag(), course.classType.tag.tag()]),
        const SizedBox(height: AppSpacing.xs),
        Text(course.name, style: context.text.headline),
        Text(
          '${course.sportNames} · ${course.areaType.label} · HLV ${course.coach.fullName}',
          style: context.text.small.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        if (course.status == ClassStatus.rejected) ...[
          AlertBanner.error(title: 'Lý do bị từ chối', message: course.rejectReason ?? 'Quản lý không ghi lý do.'),
          const SizedBox(height: AppSpacing.md),
        ],
        if (course.status == ClassStatus.pending) ...[
          const AlertBanner.info(
            message: 'Khóa học đang chờ Quản lý duyệt. Sau khi duyệt, học viên mới thấy và mua được.',
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        KpiGrid(
          children: [
            KpiTile(icon: AppIcons.money, label: 'Giá trọn khóa', value: Money.format(course.price)),
            KpiTile(icon: AppIcons.calendar, label: 'Buổi chính', value: '${course.mainSessionCount}'),
            KpiTile(
              icon: AppIcons.users,
              label: 'Học viên / sức chứa',
              value: '${course.studentCount}/${course.capacity}',
            ),
            KpiTile(
              icon: AppIcons.time,
              label: 'Khai giảng',
              value: course.firstSessionStart == null ? '—' : VnTime.dateShort(course.firstSessionStart!),
            ),
          ],
        ),
        if (showRevenue) ...[
          const SizedBox(height: AppSpacing.md),
          AppCard(
            child: Column(
              children: [
                KeyValueRow(label: 'Tổng học viên đã trả', value: Money.format(detail.grossRevenue)),
                KeyValueRow(
                  label: 'Phí nền tảng (15%)',
                  value: Money.format(detail.grossRevenue - course.coachRevenue),
                ),
                const Divider(),
                KeyValueRow(
                  label: 'Doanh thu của HLV (85%)',
                  value: Money.format(course.coachRevenue),
                  emphasize: true,
                  valueColor: c.successText,
                ),
              ],
            ),
          ),
        ],
        if (course.description != null) ...[
          const SizedBox(height: AppSpacing.md),
          const SectionHeader(title: 'Mô tả'),
          Text(course.description!, style: context.text.body),
        ],
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}

class _Sessions extends StatelessWidget {
  const _Sessions({required this.detail});

  final CoachClassDetail detail;

  @override
  Widget build(BuildContext context) {
    final editable = detail.course.status == ClassStatus.approved || detail.course.status == ClassStatus.completed;
    return Column(
      children: [
        for (final s in detail.sessions)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: SessionTile(
              session: s,
              showDate: true,
              showRoster: true,
              onTap: editable ? () => context.push(AppRoutes.teachingSession(s.id)) : () {},
            ),
          ),
      ],
    );
  }
}

/// Danh sách học viên của khóa (dùng chung Coach / Manager).
class StudentsList extends StatelessWidget {
  const StudentsList({super.key, required this.detail, this.tappable = true});

  final CoachClassDetail detail;
  final bool tappable;

  @override
  Widget build(BuildContext context) {
    if (detail.students.isEmpty) {
      return const EmptyState(compact: true, icon: AppIcons.users, title: 'Chưa có học viên mua khóa');
    }
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < detail.students.length; i++) ...[
            if (i > 0) const Divider(indent: AppSpacing.xxl + AppSpacing.lg),
            _StudentTile(student: detail.students[i], tappable: tappable),
          ],
        ],
      ),
    );
  }
}

class _StudentTile extends StatelessWidget {
  const _StudentTile({required this.student, required this.tappable});

  final StudentSummary student;
  final bool tappable;

  @override
  Widget build(BuildContext context) {
    final rate = student.attendanceRate;
    final warn = rate != null && rate < 0.8;
    return ListTile(
      onTap: tappable ? () => context.push(AppRoutes.student(student.memberProfileId)) : null,
      leading: AppAvatar(name: student.fullName, imageUrl: student.avatarUrl),
      title: Text(student.fullName),
      subtitle: Text(student.fitnessGoal ?? student.email ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: rate == null
          ? null
          : StatusLabel(
              '${(rate * 100).round()}% chuyên cần',
              warn ? StatusTone.danger : StatusTone.success,
            ).tag(dense: true),
    );
  }
}
