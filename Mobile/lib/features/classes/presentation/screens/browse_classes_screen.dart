import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../catalog/domain/entities/catalog.dart';
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
    return AppScaffold(
      title: 'Khám phá khóa học',
      actions: [if (asTab) const HeaderActions()],
      body: Column(
        children: [
          Container(
            color: context.colors.surface,
            padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.xs, context.screenPadding, AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: SearchField(
                    hint: 'Tên khóa, bộ môn, HLV…',
                    initial: query.search,
                    onChanged: ref.read(classQueryProvider.notifier).search,
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                FilterSummaryChip(count: query.activeFilterCount, onTap: () => _openFilters(context, ref, query)),
              ],
            ),
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
      builder: (_) => _FilterSheet(initial: query),
    );
    if (result != null) {
      ref
          .read(classQueryProvider.notifier)
          .filters(sportId: result.sportId, classType: result.classType, areaType: result.areaType);
    }
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.initial});

  final ClassQuery initial;

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late String? _sport = widget.initial.sportId;
  late ClassType? _type = widget.initial.classType;
  late AreaType? _area = widget.initial.areaType;

  @override
  Widget build(BuildContext context) {
    final sports = ref.watch(sportsProvider).value ?? const [];
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
        group<String>('Bộ môn', [(null, 'Tất cả'), for (final s in sports) (s.id, s.name)], _sport, (v) => _sport = v),
        group<ClassType>(
          'Hạng khóa',
          [(null, 'Tất cả'), for (final t in ClassType.values) (t, t.label)],
          _type,
          (v) => _type = v,
        ),
        group<AreaType>(
          'Khu vực tập',
          [(null, 'Tất cả'), for (final a in AreaType.values) (a, a.label)],
          _area,
          (v) => _area = v,
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
                    Navigator.of(context).pop(ClassQuery(sportId: _sport, classType: _type, areaType: _area)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
