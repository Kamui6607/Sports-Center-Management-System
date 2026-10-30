import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';
import '../widgets/session_tile.dart';

/// H02 — Lịch dạy theo tuần, lọc theo khóa.
class CoachScheduleScreen extends ConsumerStatefulWidget {
  const CoachScheduleScreen({super.key});

  @override
  ConsumerState<CoachScheduleScreen> createState() => _CoachScheduleScreenState();
}

class _CoachScheduleScreenState extends ConsumerState<CoachScheduleScreen> {
  late DateTime _day = VnTime.startOfDay(DateTime.now());
  String? _classId;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final value = ref.watch(allTeachingSessionsProvider);
    final all = value.value ?? const <ClassSession>[];
    final classes = {for (final s in all) s.classId: s.className};
    final filtered = all.where((s) => _classId == null || s.classId == _classId).toList();
    final marked = {for (final s in filtered) VnTime.date(s.startTime)};
    return AppScaffold(
      title: 'Lịch dạy',
      actions: const [HeaderActions()],
      body: Column(
        children: [
          WeekStrip(
            selectedDay: _day,
            now: now,
            markedDays: marked,
            onSelect: (d) => setState(() => _day = VnTime.startOfDay(d)),
          ),
          if (classes.length > 1)
            Container(
              color: context.colors.surface,
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: ChipBar(
                children: [
                  AppChip(
                    label: 'Tất cả khóa',
                    selected: _classId == null,
                    onTap: () => setState(() => _classId = null),
                  ),
                  for (final e in classes.entries)
                    AppChip(label: e.value, selected: _classId == e.key, onTap: () => setState(() => _classId = e.key)),
                ],
              ),
            ),
          const Divider(),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(allTeachingSessionsProvider),
              data: (_) {
                final day = filtered.where((s) => VnTime.sameDay(s.startTime, _day)).toList();
                if (day.isEmpty) {
                  return RefreshableScroll(
                    onRefresh: () => ref.refresh(allTeachingSessionsProvider.future),
                    children: [
                      EmptyState(
                        icon: AppIcons.calendar,
                        title: 'Không có buổi dạy ${VnTime.friendlyDay(_day, now).toLowerCase()}',
                      ),
                    ],
                  );
                }
                return RefreshableList(
                  onRefresh: () => ref.refresh(allTeachingSessionsProvider.future),
                  itemCount: day.length,
                  itemBuilder: (context, i) => SessionTile(
                    session: day[i],
                    showRoster: true,
                    onTap: () => context.push(AppRoutes.teachingSession(day[i].id)),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
