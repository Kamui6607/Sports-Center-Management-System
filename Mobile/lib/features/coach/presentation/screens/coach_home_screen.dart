import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../schedule/presentation/widgets/next_session_card.dart';
import '../../../schedule/presentation/widgets/session_tile.dart';
import '../../domain/entities/coach_dashboard.dart';
import '../providers/coach_providers.dart';

/// H01 — Tổng quan HLV: buổi tiếp theo, số liệu, việc cần làm.
class CoachHomeScreen extends ConsumerWidget {
  const CoachHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(coachDashboardProvider);
    final user = ref.watch(currentUserProvider);
    final now = DateTime.now();
    return AppScaffold(
      titleWidget: const BrandLogo(),
      actions: const [HeaderActions()],
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(coachDashboardProvider),
        data: (d) => RefreshableScroll(
          onRefresh: () => ref.refresh(coachDashboardProvider.future),
          children: [
            Text('Chào HLV ${user?.firstName ?? ''}!', style: context.text.headline),
            Text(
              '${VnTime.weekdayOf(now)}, ${VnTime.date(now)}',
              style: context.text.small.copyWith(color: context.colors.textMuted),
            ),
            const SizedBox(height: AppSpacing.md),
            _NextTeaching(dashboard: d),
            const SizedBox(height: AppSpacing.md),
            KpiGrid(
              children: [
                KpiTile(
                  icon: AppIcons.calendar,
                  label: 'Buổi dạy tuần này',
                  value: '${d.weekCompletedCount}/${d.weekSessionCount}',
                  onTap: () => context.go(AppRoutes.coachSchedule),
                ),
                KpiTile(
                  icon: AppIcons.users,
                  label: 'Học viên',
                  value: '${d.studentCount}',
                  onTap: () => context.go(AppRoutes.coachClasses),
                ),
                KpiTile(
                  icon: AppIcons.wallet,
                  label: 'Số dư khả dụng',
                  value: Money.format(d.availableBalance),
                  highlight: true,
                  onTap: () => context.go(AppRoutes.coachWallet),
                ),
                KpiTile(
                  icon: AppIcons.star,
                  label: '${d.ratingCount} đánh giá',
                  value: d.ratingCount == 0 ? '—' : d.ratingAverage.toStringAsFixed(1),
                  onTap: () => context.push(AppRoutes.coachFeedback),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            SectionHeader(title: 'Việc cần làm (${d.todos.length})'),
            if (d.todos.isEmpty)
              const AlertBanner.success(message: 'Bạn đã xử lý hết công việc. Tuyệt vời!')
            else
              for (final t in d.todos)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _TodoCard(todo: t),
                ),
            const SizedBox(height: AppSpacing.md),
            SectionHeader(
              title: 'Lịch dạy hôm nay (${d.todaySessions.length})',
              actionLabel: 'Lịch tuần',
              onAction: () => context.go(AppRoutes.coachSchedule),
            ),
            if (d.todaySessions.isEmpty)
              Text('Hôm nay không có buổi dạy.', style: context.text.small.copyWith(color: context.colors.textMuted))
            else
              for (final s in d.todaySessions)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: SessionTile(
                    session: s,
                    showRoster: true,
                    onTap: () => context.push(AppRoutes.teachingSession(s.id)),
                  ),
                ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _NextTeaching extends StatelessWidget {
  const _NextTeaching({required this.dashboard});

  final CoachDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final s = dashboard.nextSession;
    if (s == null) {
      return NoUpcomingSessionCard(
        message: 'Chưa có buổi dạy sắp tới.',
        actionLabel: 'Tạo khóa',
        onAction: () => context.push(AppRoutes.createClass),
      );
    }
    final now = DateTime.now();
    final canOpenQr = !now.isBefore(s.startTime.subtract(const Duration(minutes: 30))) && now.isBefore(s.endTime);
    return NextSessionCard(
      session: s,
      details: '${VnTime.friendlyDay(s.startTime, now)} · ${VnTime.timeRange(s.startTime, s.endTime)} · ${s.room.name}',
      subtitle: '${s.bookedCount}/${s.capacity} học viên đã giữ chỗ',
      onTap: () => context.push(AppRoutes.teachingSession(s.id)),
      action: canOpenQr
          ? AppButton.secondary(
              label: 'Mở QR điểm danh',
              icon: AppIcons.qr,
              expand: true,
              onPressed: () => context.push(AppRoutes.sessionQr(s.id)),
            )
          : null,
    );
  }
}

class _TodoCard extends StatelessWidget {
  const _TodoCard({required this.todo});

  final CoachTodo todo;

  @override
  Widget build(BuildContext context) {
    final (icon, tone, route) = switch (todo.kind) {
      CoachTodoKind.completeSession => (AppIcons.check, StatusTone.warning, AppRoutes.teachingSession(todo.targetId)),
      CoachTodoKind.classRejected => (AppIcons.error, StatusTone.danger, AppRoutes.coachClass(todo.targetId)),
      CoachTodoKind.classPending => (AppIcons.pending, StatusTone.info, AppRoutes.coachClass(todo.targetId)),
      CoachTodoKind.refundHold => (AppIcons.refund, StatusTone.neutral, AppRoutes.coachWallet),
    };
    return AppCard(
      onTap: () => todo.kind == CoachTodoKind.refundHold ? context.go(route) : context.push(route),
      child: Row(
        children: [
          IconTile(icon, tone: tone),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(todo.title, style: context.text.label),
                Text(todo.subtitle, style: context.text.caption.copyWith(color: context.colors.textMuted)),
              ],
            ),
          ),
          Icon(AppIcons.chevronRight, color: context.colors.textMuted),
        ],
      ),
    );
  }
}
