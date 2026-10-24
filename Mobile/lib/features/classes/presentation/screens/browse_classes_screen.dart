import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../catalog/presentation/location_card.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';
import '../widgets/class_card.dart';

/// M02 — Khám phá khóa học (tab Member) / danh sách cho Guest ([asTab] = false).
class BrowseClassesScreen extends ConsumerWidget {
  const BrowseClassesScreen({super.key, this.asTab = true});

  final bool asTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(classQueryProvider);
    final value = ref.watch(browseClassesProvider);
    final isMember = ref.watch(currentUserProvider)?.role == UserRole.member;
    return AppScaffold(
      title: 'Khám phá khóa học',
      actions: [if (isMember) const _MyCoursesAction(), if (asTab) const HeaderActions()],
      body: Column(
        children: [
          Container(
            color: context.colors.surface,
            padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.xs, context.screenPadding, AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: SearchField(
                    hint: 'Tên khóa (gõ có dấu hoặc không dấu)…',
                    initial: query.search,
                    onChanged: ref.read(classQueryProvider.notifier).search,
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                FilterSummaryChip(count: query.activeFilterCount, onTap: () => _openFilters(context, ref, query)),
              ],
            ),
          ),
          if (isMember)
            ChipBar(
              children: [
                AppChip(
                  label: 'Phù hợp với tôi',
                  icon: AppIcons.target,
                  selected: query.matchMyGoals,
                  onTap: () => ref
                      .read(classQueryProvider.notifier)
                      .filters(classType: query.classType, goal: query.goal, matchMyGoals: !query.matchMyGoals),
                ),
              ],
            ),
          const Divider(),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(browseClassesProvider),
              isEmpty: (s) => s.items.isEmpty,
              empty: EmptyState(
                icon: AppIcons.search,
                title: 'Không tìm thấy khóa học phù hợp',
                message: 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.',
                actionLabel: query.activeFilterCount > 0 ? 'Xóa bộ lọc' : null,
                onAction: () => ref.read(classQueryProvider.notifier).filters(),
              ),
              data: (state) => NotificationListener<ScrollNotification>(
                onNotification: (n) {
                  if (n.metrics.extentAfter < 400) ref.read(browseClassesProvider.notifier).loadMore();
                  return false;
                },
                child: RefreshableList(
                  onRefresh: () => ref.refresh(browseClassesProvider.future),
                  itemCount: state.items.length,
                  itemBuilder: (context, i) => ClassCard(
                    course: state.items[i],
                    onTap: () => context.push(AppRoutes.classDetail(state.items[i].id)),
                  ),
                  footer: state.hasMore
                      ? const Padding(
                          padding: EdgeInsets.all(AppSpacing.lg),
                          child: Center(child: CircularProgressIndicator.adaptive()),
                        )
                      : Padding(
                          padding: const EdgeInsets.all(AppSpacing.lg),
                          child: Center(
                            child: Text(
                              'Đã hiển thị tất cả ${state.items.length} khóa học',
                              style: context.text.caption.copyWith(color: context.colors.textMuted),
                            ),
                          ),
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openFilters(BuildContext context, WidgetRef ref, ClassQuery query) async {
    final result = await showAppBottomSheet<ClassQuery>(
      context: context,
      title: 'Bộ lọc',
      builder: (_) => _FilterSheet(initial: query, isMember: ref.read(currentUserProvider)?.role == UserRole.member),
    );
    if (result != null) {
      ref
          .read(classQueryProvider.notifier)
          .filters(classType: result.classType, goal: result.goal, matchMyGoals: result.matchMyGoals);
    }
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.initial, required this.isMember});

  final ClassQuery initial;
  final bool isMember;

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late String? _goal = widget.initial.goal;
  late ClassType? _type = widget.initial.classType;
  late bool _mine = widget.initial.matchMyGoals;

  @override
  Widget build(BuildContext context) {
    final goals = ref.watch(goalOptionsProvider).value ?? kFitnessGoals;
    Widget group<T>(String title, List<(T?, String)> options, T? selected, ValueChanged<T?> onSelect) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            for (final (v, label) in options)
              AppChip(label: label, selected: v == selected, onTap: () => setState(() => onSelect(v))),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.isMember) ...[
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _mine,
            onChanged: (v) => setState(() => _mine = v),
            title: Text('Phù hợp với mục tiêu của tôi', style: context.text.body),
            subtitle: Text(
              'Theo mục tiêu tập luyện trong hồ sơ, sắp xếp khóa phù hợp nhất lên đầu.',
              style: context.text.caption,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        group<String>(
          'Mục tiêu',
          [(null, 'Tất cả'), for (final g in goals) (g.code, g.label)],
          _goal,
          (v) => _goal = v,
        ),
        group<ClassType>(
          'Hạng khóa',
          [(null, 'Tất cả'), for (final t in ClassType.values) (t, t.label)],
          _type,
          (v) => _type = v,
        ),
        Row(
          children: [
            Expanded(
              child: AppButton.outline(
                label: 'Xóa lọc',
                onPressed: () => Navigator.of(context).pop(const ClassQuery()),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: AppButton(
                label: 'Áp dụng',
                onPressed: () =>
                    Navigator.of(context).pop(ClassQuery(goal: _goal, classType: _type, matchMyGoals: _mine)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Nút góc trên màn Khóa học: số khóa đang hoạt động (chờ thanh toán / sắp khai giảng / đang diễn ra).
class _MyCoursesAction extends ConsumerWidget {
  const _MyCoursesAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = (ref.watch(courseHistoryProvider).value ?? const <MemberCourse>[]).where((c) => c.isActive).toList();
    final pending = active.where((c) => c.status == MemberCourseStatus.pendingPayment).length;
    return IconButton(
      tooltip: 'Khóa học của tôi',
      onPressed: () => showAppBottomSheet<void>(
        context: context,
        title: 'Khóa học của tôi',
        subtitle: 'Đang chờ thanh toán, sắp khai giảng và đang diễn ra',
        builder: (_) => const _ActiveCoursesSheet(),
      ),
      icon: Badge(
        isLabelVisible: active.isNotEmpty,
        backgroundColor: pending > 0
            ? context.tones.of(StatusTone.warning).foreground
            : context.tones.of(StatusTone.success).foreground,
        label: Text('${active.length}'),
        child: const Icon(AppIcons.course),
      ),
    );
  }
}

class _ActiveCoursesSheet extends ConsumerWidget {
  const _ActiveCoursesSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(courseHistoryProvider);
    final c = context.colors;
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator.adaptive()),
      ),
      error: (e, _) => ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(courseHistoryProvider)),
      data: (all) {
        final active = all.where((x) => x.isActive).toList()..sort((a, b) => a.status.index.compareTo(b.status.index));
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (active.isEmpty)
              const EmptyState(
                compact: true,
                icon: AppIcons.course,
                title: 'Chưa có khóa nào đang hoạt động',
                message: 'Khóa đang chờ thanh toán hoặc đang học sẽ hiện ở đây.',
              ),
            for (final m in active)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: AppCard(
                  onTap: () {
                    Navigator.of(context).pop();
                    if (m.status == MemberCourseStatus.pendingPayment && m.paymentId != null) {
                      context.push(AppRoutes.payment(m.paymentId!));
                    } else {
                      context.push(AppRoutes.myCourse(m.classId));
                    }
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(m.className, style: context.text.bodyStrong)),
                          m.status.tag.tag(dense: true),
                        ],
                      ),
                      Text('HLV ${m.coachName}', style: context.text.caption.copyWith(color: c.textMuted)),
                      const SizedBox(height: AppSpacing.xxs),
                      if (m.status == MemberCourseStatus.pendingPayment && m.pendingExpiresAt != null)
                        InfoRow(
                          icon: AppIcons.pending,
                          text:
                              'Hết hạn chuyển khoản lúc ${VnTime.time(m.pendingExpiresAt!)} · chạm để tiếp tục thanh toán',
                        )
                      else if (m.nextSessionStart != null)
                        InfoRow(
                          icon: AppIcons.calendar,
                          text:
                              'Buổi tới: ${VnTime.friendlyDay(m.nextSessionStart!, DateTime.now())} · ${VnTime.time(m.nextSessionStart!)}',
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
            AppButton.outline(
              label: 'Xem lịch sử khóa học',
              icon: AppIcons.history,
              expand: true,
              onPressed: () {
                Navigator.of(context).pop();
                context.push(AppRoutes.courseHistory);
              },
            ),
          ],
        );
      },
    );
  }
}
