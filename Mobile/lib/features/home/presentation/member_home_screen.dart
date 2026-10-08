import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/shell/header_actions.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../../attendance/presentation/providers/attendance_providers.dart';
import '../../auth/presentation/providers/session_provider.dart';
import '../../classes/domain/entities/course.dart';
import '../../classes/presentation/providers/course_providers.dart';
import '../../classes/presentation/screens/my_courses_screen.dart';
import '../../notifications/presentation/notification_tile.dart';
import '../../notifications/presentation/providers/notification_providers.dart';
import '../../schedule/domain/entities/session.dart';
import '../../schedule/presentation/providers/schedule_providers.dart';
import '../../schedule/presentation/widgets/next_session_card.dart';

/// M01 — Trang chủ Member.
class MemberHomeScreen extends ConsumerWidget {
  const MemberHomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref
      ..invalidate(myCoursesProvider)
      ..invalidate(myAttendanceSummaryProvider)
      ..invalidate(myPenaltiesProvider)
      ..invalidate(notificationsProvider);
    ref.invalidate(myAllSessionsProvider);
    await ref.read(myAllSessionsProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final now = DateTime.now();
    return AppScaffold(
      titleWidget: const BrandLogo(),
      actions: const [HeaderActions()],
      body: RefreshableScroll(
        onRefresh: () => _refresh(ref),
        children: [
          Text('Xin chào, ${user?.firstName ?? ''}!', style: context.text.headline),
          Text(
            '${VnTime.weekdayOf(now)}, ${VnTime.date(now)}',
            style: context.text.small.copyWith(color: context.colors.textMuted),
          ),
          const SizedBox(height: AppSpacing.md),
          const _NextSessionCard(),
          const SizedBox(height: AppSpacing.md),
          const _AttendanceAlerts(),
          const _QuickActions(),
          const SizedBox(height: AppSpacing.lg),
          const _OngoingCourses(),
          const SizedBox(height: AppSpacing.lg),
          const _RecentNotifications(),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}

class _NextSessionCard extends ConsumerWidget {
  const _NextSessionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myAllSessionsProvider);
    final now = DateTime.now();
    return value.when(
      skipLoadingOnReload: true,
      loading: () => const Shimmer(
        child: SkeletonBox(height: AppSpacing.xxl * 3, radius: AppRadius.sheet),
      ),
      error: (e, _) => ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(myAllSessionsProvider)),
      data: (sessions) {
        final next = sessions
            .where(
              (s) =>
                  s.session.status == ScheduleStatus.scheduled &&
                  s.enrollmentStatus == EnrollmentStatus.booked &&
                  s.session.endTime.isAfter(now),
            )
            .firstOrNull;
        if (next == null) {
          return NoUpcomingSessionCard(
            message: 'Bạn chưa có buổi tập sắp tới.',
            actionLabel: 'Tìm khóa',
            onAction: () => context.go(AppRoutes.memberClasses),
          );
        }
        final s = next.session;
        final canCheckIn = next.attendance == null && !now.isBefore(s.startTime.subtract(const Duration(minutes: 30)));
        return NextSessionCard(
          session: s,
          details: '${VnTime.friendlyDay(s.startTime, now)} · ${VnTime.timeRange(s.startTime, s.endTime)}',
          subtitle: '${s.room.name} · HLV ${s.coachName}',
          onTap: () => context.push(AppRoutes.mySession(s.id)),
          action: next.attendance != null
              ? NextSessionNote.text(icon: AppIcons.success, text: 'Bạn đã điểm danh buổi này')
              : canCheckIn
              ? AppButton.secondary(
                  label: 'Quét QR điểm danh',
                  icon: AppIcons.scan,
                  expand: true,
                  onPressed: () => context.push(AppRoutes.scan),
                )
              : null,
        );
      },
    );
  }
}

class _AttendanceAlerts extends ConsumerWidget {
  const _AttendanceAlerts();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final penalties = ref.watch(myPenaltiesProvider).value ?? const [];
    final summary = ref.watch(myAttendanceSummaryProvider).value ?? const [];
    final now = DateTime.now();
    final active = penalties.where((p) => p.blockedUntil?.isAfter(now) ?? false).toList();
    final warnings = summary.where((s) => s.isWarning && !active.any((p) => p.classId == s.classId)).toList();
    if (active.isEmpty && warnings.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AlertBanner(
        tone: active.isNotEmpty ? StatusTone.danger : StatusTone.warning,
        title: active.isNotEmpty ? 'Bạn đang bị phạt chuyên cần' : 'Cảnh báo chuyên cần',
        message: active.isNotEmpty
            ? 'Khóa "${active.first.className}" đã thu hồi ${active.first.releasedCount} buổi sắp tới.'
            : 'Tỷ lệ tham gia khóa "${warnings.first.className}" chỉ ${(warnings.first.rate * 100).round()}%, dưới mức 80%.',
        action: TextButton(onPressed: () => context.push(AppRoutes.attendance), child: const Text('Xem chuyên cần')),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    final items = [
      (AppIcons.scan, 'Quét QR', AppRoutes.scan),
      (AppIcons.course, 'Khóa của tôi', AppRoutes.myCourses),
      (AppIcons.training, 'Lộ trình', AppRoutes.training),
      (AppIcons.attendance, 'Chuyên cần', AppRoutes.attendance),
      (AppIcons.order, 'Đơn hàng', AppRoutes.orders),
      (AppIcons.refund, 'Hoàn tiền', AppRoutes.refunds),
    ];
    return ResponsiveGrid(
      columns: context.isWide ? 6 : 3,
      children: [
        for (final (icon, label, route) in items)
          AppCard(
            onTap: () => context.push(route),
            padding: const EdgeInsets.all(AppSpacing.xs),
            semanticLabel: label,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: context.colors.primary),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  style: context.text.caption.copyWith(color: context.colors.text),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _OngoingCourses extends ConsumerWidget {
  const _OngoingCourses();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courses = (ref.watch(myCoursesProvider).value ?? const <MyCourse>[])
        .where((c) => c.phase != MyCoursePhase.ended)
        .toList();
    if (courses.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: 'Khóa học của tôi',
          actionLabel: 'Xem tất cả',
          onAction: () => context.push(AppRoutes.myCourses),
        ),
        for (final c in courses.take(2))
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: MyCourseCard(item: c),
          ),
      ],
    );
  }
}

class _RecentNotifications extends ConsumerWidget {
  const _RecentNotifications();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(notificationsProvider(false)).value ?? const [];
    final user = ref.watch(currentUserProvider);
    if (list.isEmpty || user == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: 'Thông báo mới',
          actionLabel: 'Xem tất cả',
          onAction: () => context.push(AppRoutes.notifications),
        ),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          child: Column(
            children: [
              for (var i = 0; i < list.take(3).length; i++) ...[
                if (i > 0) const Divider(),
                NotificationTile(
                  item: list[i],
                  dense: true,
                  onTap: () {
                    final target = notificationTarget(list[i], user.role);
                    context.push(target ?? AppRoutes.notifications);
                  },
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
