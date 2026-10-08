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
import '../session_labels.dart';
import '../widgets/session_tile.dart';

/// M09 — Lịch tập theo tuần (thanh ngày + danh sách buổi).
class MemberScheduleScreen extends ConsumerStatefulWidget {
  const MemberScheduleScreen({super.key});

  @override
  ConsumerState<MemberScheduleScreen> createState() => _MemberScheduleScreenState();
}

class _MemberScheduleScreenState extends ConsumerState<MemberScheduleScreen> {
  late DateTime _day = VnTime.startOfDay(DateTime.now());

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final value = ref.watch(myAllSessionsProvider);
    final all = value.value ?? const <MySession>[];
    final marked = {for (final s in all) VnTime.date(s.session.startTime)};
    return AppScaffold(
      title: 'Lịch tập',
      actions: [
        AppIconButton(icon: AppIcons.scan, tooltip: 'Quét QR điểm danh', onPressed: () => context.push(AppRoutes.scan)),
        const HeaderActions(showChat: false),
      ],
      body: Column(
        children: [
          WeekStrip(
            selectedDay: _day,
            now: now,
            markedDays: marked,
            onSelect: (d) => setState(() => _day = VnTime.startOfDay(d)),
          ),
          const Divider(),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(myAllSessionsProvider),
              data: (sessions) {
                final today = sessions.where((s) => VnTime.sameDay(s.session.startTime, _day)).toList();
                if (today.isEmpty) {
                  final next = sessions
                      .where((s) => s.session.startTime.isAfter(_day) && s.session.status == ScheduleStatus.scheduled)
                      .firstOrNull;
                  return RefreshableScroll(
                    onRefresh: () => ref.refresh(myAllSessionsProvider.future),
                    children: [
                      EmptyState(
                        icon: AppIcons.calendar,
                        title: 'Không có buổi tập ${VnTime.friendlyDay(_day, now).toLowerCase()}',
                        message: next == null
                            ? 'Mua khóa học để có lịch tập.'
                            : 'Buổi gần nhất: ${VnTime.sessionLabel(next.session.startTime, next.session.endTime)}',
                        actionLabel: next == null ? 'Khám phá khóa học' : 'Đến ngày đó',
                        onAction: next == null
                            ? () => context.go(AppRoutes.memberClasses)
                            : () => setState(() => _day = VnTime.startOfDay(next.session.startTime)),
                      ),
                    ],
                  );
                }
                return RefreshableList(
                  onRefresh: () => ref.refresh(myAllSessionsProvider.future),
                  header: Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: Text('${VnTime.friendlyDay(_day, now)} · ${today.length} buổi', style: context.text.label),
                  ),
                  itemCount: today.length,
                  itemBuilder: (context, i) => SessionTile(
                    session: today[i].session,
                    trailingTag:
                        today[i].attendance?.status ??
                        (today[i].session.hasEnded(now) && today[i].session.status != ScheduleStatus.cancelled
                            ? notCheckedIn
                            : null),
                    onTap: () => context.push(AppRoutes.mySession(today[i].session.id)),
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
