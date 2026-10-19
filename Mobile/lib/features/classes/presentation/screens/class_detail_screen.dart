import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/auth_labels.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../catalog/presentation/location_card.dart';
import '../../../feedbacks/presentation/feedback_widgets.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';
import '../widgets/class_card.dart';
import '../widgets/class_purchase_bar.dart';
import '../widgets/coach_profile_sheet.dart';

/// M03 — Chi tiết khóa học + lộ trình buổi; CTA theo tình trạng mua.
class ClassDetailScreen extends ConsumerWidget {
  const ClassDetailScreen({super.key, required this.classId});

  final String classId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(courseDetailProvider(classId));
    final user = ref.watch(currentUserProvider);
    return AppScaffold(
      title: 'Chi tiết khóa học',
      bottomBar: value.value == null ? null : ClassPurchaseBar(detail: value.value!, user: user),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(courseDetailProvider(classId)),
        data: (d) => RefreshableScroll(
          onRefresh: () => ref.refresh(courseDetailProvider(classId).future),
          padding: EdgeInsets.zero,
          children: [_Body(detail: d, user: user)],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.detail, required this.user});

  final CourseDetail detail;
  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    final course = detail.course;
    final c = context.colors;
    final purchase = detail.purchase;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: AppSpacing.xxl * 4,
          child: AppNetworkImage(
            url: null,
            seed: course.id,
            placeholderIcon: sportIcon(course.sports),
            borderRadius: BorderRadius.zero,
            iconSize: AppSpacing.xxl,
          ),
        ),
        Padding(
          padding: EdgeInsets.all(context.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  StatusLabel(course.sportNames, StatusTone.neutral).tag(),
                  course.classType.tag.tag(),
                  if (course.status != ClassStatus.approved) course.status.status.tag(),
                  StatusLabel(course.areaType.label, StatusTone.neutral).tag(),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(course.name, style: context.text.headline),
              const SizedBox(height: AppSpacing.xs),
              MoneyText(course.price, style: context.text.title.copyWith(color: c.primary)),
              Text(
                'Trọn khóa ${course.mainSessionCount} buổi'
                '${course.startDate != null && course.endDate != null ? ' · ${VnTime.date(course.startDate!)} – ${VnTime.date(course.endDate!)}' : ''}',
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: AppSpacing.md),
              _PurchaseNotice(purchase: purchase, isMember: user?.role == UserRole.member),
              if (user?.role == UserRole.member) _GoalMatchBanner(match: detail.goalMatch ?? course.goalMatch),
              KpiGrid(
                children: [
                  KpiTile(icon: AppIcons.calendar, label: 'Số buổi', value: '${course.mainSessionCount}'),
                  KpiTile(icon: AppIcons.users, label: 'Sức chứa / buổi', value: '${course.capacity}'),
                  KpiTile(
                    icon: AppIcons.time,
                    label: 'Khai giảng',
                    value: course.startDate == null ? '—' : VnTime.dateShort(course.startDate!),
                  ),
                  KpiTile(
                    icon: AppIcons.calendar,
                    label: 'Kết thúc',
                    value: course.endDate == null ? '—' : VnTime.dateShort(course.endDate!),
                  ),
                  KpiTile(
                    icon: AppIcons.users,
                    label: 'Chỗ trống ít nhất',
                    value: course.minRemainingSlots == null ? '—' : '${course.minRemainingSlots}',
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Mục tiêu khóa học'),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (course.goalTags.isNotEmpty)
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [
                          for (final g in course.goalTags)
                            StatusLabel(
                              goalLabel(g),
                              (detail.goalMatch ?? course.goalMatch)?.matchedGoals.contains(g) ?? false
                                  ? StatusTone.success
                                  : StatusTone.info,
                            ).tag(),
                        ],
                      ),
                    if (course.goal?.trim().isNotEmpty ?? false) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(course.goal!, style: context.text.body),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    InfoRow(
                      icon: AppIcons.target,
                      text: 'Trình độ phù hợp: ${course.targetLevel?.label ?? 'Mọi trình độ'}',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (course.description != null && course.description != course.goal) ...[
                const SectionHeader(title: 'Giới thiệu'),
                Text(course.description!, style: context.text.body),
                const SizedBox(height: AppSpacing.lg),
              ],
              const SectionHeader(title: 'Huấn luyện viên'),
              CoachMiniCard(
                coach: course.coach,
                onTap: () => showCoachProfileSheet(
                  context,
                  coachProfileId: course.coach.coachProfileId,
                  coachName: course.coach.fullName,
                  currentClassId: course.id,
                ),
                onChat: purchase.status == PurchaseStatus.purchased
                    ? () => context.push(AppRoutes.chatRoom(course.coach.userId))
                    : null,
              ),
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(
                  'Chạm vào HLV để xem hồ sơ, đánh giá và các khóa khác.',
                  style: context.text.caption.copyWith(color: c.textMuted),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (detail.slots.isNotEmpty) ...[
                const SectionHeader(title: 'Lịch học hằng tuần'),
                AppCard(
                  child: Column(
                    children: [
                      for (final s in detail.slots)
                        InfoRow(
                          icon: AppIcons.calendar,
                          text: '${VnTime.weekdayLabel(s.weekday)} · ${s.timeLabel} · ${s.roomName}',
                          trailing: Text(
                            '${s.sessionCount} buổi',
                            style: context.text.caption.copyWith(color: c.textMuted),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
              ],
              _UpcomingSessions(sessions: detail.sessions, pastCount: detail.pastSessionCount, className: course.name),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Địa điểm tập'),
              LocationCard(
                extraRooms: [
                  ...{for (final s in detail.sessions) s.room.id: s.room}.values,
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Chính sách hủy & hoàn tiền'),
              const AlertBanner.info(
                message:
                    '• Hủy khóa trước buổi khai giảng ≥ 3 ngày: hoàn 100%.\n'
                    '• Hủy trong vòng 3 ngày / khi đã khai giảng: không hoàn tiền; có thể gửi yêu cầu hoàn ngoại lệ — '
                    'nếu Quản lý chấp nhận sẽ hoàn phần buổi chưa học sau khi trừ phí chiết khấu.\n'
                    '• Hủy 1 buổi trước giờ học ≥ 24 giờ: hoàn 80% tiền buổi đó.\n'
                    '• Buổi bị HLV hủy: dạy bù hoặc hoàn tiền buổi; buổi bị dời lịch mà bạn không đi được: hủy được hoàn 100%.',
              ),
              const SizedBox(height: AppSpacing.lg),
              CoachFeedbackSection(
                coachProfileId: course.coach.coachProfileId,
                coachName: course.coach.fullName,
                classId: course.id,
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ],
    );
  }
}

/// Lý do không mua được / đã mua (dữ liệu từ BE).
class _PurchaseNotice extends StatelessWidget {
  const _PurchaseNotice({required this.purchase, required this.isMember});

  final PurchaseInfo purchase;
  final bool isMember;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = switch (purchase.status) {
      PurchaseStatus.purchased => AlertBanner.success(
        title: 'Bạn đã sở hữu khóa học này',
        message: purchase.hasPendingRefund
            ? 'Yêu cầu hủy khóa của bạn đang chờ Quản lý duyệt.'
            : 'Bạn đã được ghi danh vào mọi buổi sắp diễn ra. Xem lịch ở tab Lịch tập.',
      ),
      PurchaseStatus.pendingPayment => const AlertBanner.warning(
        title: 'Đang chờ thanh toán',
        message: 'Bạn có một giao dịch chưa hoàn tất cho khóa này. Tiếp tục thanh toán để được ghi danh.',
      ),
      PurchaseStatus.none when isMember && purchase.blockers.isNotEmpty => AlertBanner.warning(
        title: 'Chưa thể mua khóa học',
        message: purchase.blockers.map((b) => '• ${b.message}').join('\n'),
      ),
      _ => null,
    };
    if (banner == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: banner,
    );
  }
}

/// Mức độ phù hợp của khóa với mục tiêu trong hồ sơ học viên.
class _GoalMatchBanner extends StatelessWidget {
  const _GoalMatchBanner({required this.match});

  final GoalMatch? match;

  @override
  Widget build(BuildContext context) {
    final m = match;
    if (m == null) return const SizedBox.shrink();
    final banner = switch (m.level) {
      GoalMatchLevel.high => AlertBanner.success(title: 'Rất phù hợp với bạn (${m.score}%)', message: m.message),
      GoalMatchLevel.medium ||
      GoalMatchLevel.low => AlertBanner.info(title: '${m.level.tag.label} (${m.score}%)', message: m.message),
      GoalMatchLevel.none => AlertBanner.warning(title: 'Chưa khớp mục tiêu của bạn', message: m.message),
      GoalMatchLevel.unknown => AlertBanner.info(
        title: 'Khóa này có hợp với bạn?',
        message: m.message,
        action: TextButton(
          onPressed: () => context.push(AppRoutes.profileEdit),
          child: const Text('Cập nhật mục tiêu'),
        ),
      ),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: banner,
    );
  }
}

class _UpcomingSessions extends StatelessWidget {
  const _UpcomingSessions({required this.sessions, required this.pastCount, required this.className});

  final List<PlanSession> sessions;
  final int pastCount;
  final String className;

  static const _collapsed = 4;

  void _openAll(BuildContext context) => showAppBottomSheet<void>(
    context: context,
    title: 'Các buổi học',
    subtitle: '$className · ${sessions.length} buổi sắp diễn ra${pastCount > 0 ? ' · $pastCount buổi đã diễn ra' : ''}',
    expand: true,
    builder: (_) => _SessionList(sessions: sessions),
  );

  @override
  Widget build(BuildContext context) {
    final list = sessions.take(_collapsed).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: 'Buổi sắp diễn ra (${sessions.length})',
          actionLabel: sessions.isEmpty ? null : 'Xem tất cả',
          onAction: sessions.isEmpty ? null : () => _openAll(context),
        ),
        if (sessions.isEmpty)
          const EmptyState(compact: true, icon: AppIcons.calendar, title: 'Chưa có buổi học sắp tới')
        else
          AppCard(
            onTap: () => _openAll(context),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
            child: Column(
              children: [
                for (var i = 0; i < list.length; i++) ...[if (i > 0) const Divider(), _SessionRow(session: list[i])],
                if (sessions.length > _collapsed)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                    child: Text(
                      'Chạm để xem tất cả ${sessions.length} buổi',
                      style: context.text.caption.copyWith(color: context.colors.primary),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Danh sách đầy đủ các buổi (nhóm theo tháng) trong bottom sheet.
class _SessionList extends StatelessWidget {
  const _SessionList({required this.sessions});

  final List<PlanSession> sessions;

  @override
  Widget build(BuildContext context) {
    final byMonth = <String, List<PlanSession>>{};
    for (final s in sessions) {
      final w = VnTime.wall(s.startTime);
      byMonth.putIfAbsent('Tháng ${w.month}/${w.year}', () => []).add(s);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final entry in byMonth.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: AppSpacing.xs),
            child: Text(entry.key, style: context.text.label),
          ),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
            child: Column(
              children: [
                for (var i = 0; i < entry.value.length; i++) ...[
                  if (i > 0) const Divider(),
                  _SessionRow(session: entry.value[i], showPlace: true),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session, this.showPlace = false});

  final PlanSession session;
  final bool showPlace;

  @override
  Widget build(BuildContext context) {
    final s = session;
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(VnTime.dayLabel(s.startTime), style: context.text.label),
                Text(
                  '${VnTime.timeRange(s.startTime, s.endTime)} · ${s.room.name}',
                  style: context.text.caption.copyWith(color: c.textMuted),
                ),
                if (showPlace && s.room.placeLabel.isNotEmpty)
                  Text(s.room.placeLabel, style: context.text.caption.copyWith(color: c.textMuted)),
                if (s.isRescheduled)
                  Text(
                    'Đã dời từ ${VnTime.dayLabel(s.originalStartTime!)} ${VnTime.time(s.originalStartTime!)}'
                    '${s.rescheduleReason == null ? '' : ' · ${s.rescheduleReason}'}',
                    style: context.text.caption.copyWith(color: context.tones.of(StatusTone.warning).foreground),
                  ),
              ],
            ),
          ),
          _sessionTag(s),
        ],
      ),
    );
  }

  Widget _sessionTag(PlanSession s) {
    if (s.mine) return const StatusLabel('Đã giữ chỗ', StatusTone.success).tag(dense: true);
    if (s.isFull) return const StatusLabel('Hết chỗ', StatusTone.danger).tag(dense: true);
    if (s.conflictWith != null) return const StatusLabel('Trùng giờ', StatusTone.warning).tag(dense: true);
    if (s.isMakeup) return const StatusLabel('Buổi dạy bù', StatusTone.brand).tag(dense: true);
    return StatusLabel('Còn ${s.remainingSlots} chỗ', StatusTone.neutral).tag(dense: true);
  }
}
