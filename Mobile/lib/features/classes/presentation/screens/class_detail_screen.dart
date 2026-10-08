import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../feedbacks/presentation/feedback_widgets.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/course_providers.dart';
import '../widgets/class_card.dart';
import '../widgets/class_purchase_bar.dart';

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
                'Trọn khóa ${course.mainSessionCount} buổi',
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: AppSpacing.md),
              _PurchaseNotice(purchase: purchase, isMember: user?.role == UserRole.member),
              KpiGrid(
                children: [
                  KpiTile(icon: AppIcons.calendar, label: 'Số buổi', value: '${course.mainSessionCount}'),
                  KpiTile(icon: AppIcons.users, label: 'Sức chứa / buổi', value: '${course.capacity}'),
                  KpiTile(
                    icon: AppIcons.time,
                    label: 'Khai giảng',
                    value: course.firstSessionStart == null ? '—' : VnTime.dateShort(course.firstSessionStart!),
                  ),
                  KpiTile(
                    icon: AppIcons.users,
                    label: 'Chỗ trống ít nhất',
                    value: course.minRemainingSlots == null ? '—' : '${course.minRemainingSlots}',
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              if (course.description != null) ...[
                const SectionHeader(title: 'Giới thiệu'),
                Text(course.description!, style: context.text.body),
                const SizedBox(height: AppSpacing.lg),
              ],
              const SectionHeader(title: 'Huấn luyện viên'),
              CoachMiniCard(
                coach: course.coach,
                onChat: purchase.status == PurchaseStatus.purchased
                    ? () => context.push(AppRoutes.chatRoom(course.coach.userId))
                    : null,
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
              _UpcomingSessions(sessions: detail.sessions),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Chính sách hủy khóa'),
              const AlertBanner.info(
                message:
                    'Bạn được hủy khóa và hoàn tiền khi còn ít nhất 24 giờ trước buổi khai giảng. Quá thời hạn, hệ thống sẽ từ chối yêu cầu. '
                    'Nếu buổi học bị hủy, HLV sẽ dạy bù hoặc hoàn tiền buổi đó cho bạn.',
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

class _UpcomingSessions extends StatefulWidget {
  const _UpcomingSessions({required this.sessions});

  final List<PlanSession> sessions;

  @override
  State<_UpcomingSessions> createState() => _UpcomingSessionsState();
}

class _UpcomingSessionsState extends State<_UpcomingSessions> {
  static const _collapsed = 4;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final list = _expanded ? widget.sessions : widget.sessions.take(_collapsed).toList();
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: 'Buổi sắp diễn ra (${widget.sessions.length})'),
        if (widget.sessions.isEmpty)
          const EmptyState(compact: true, icon: AppIcons.calendar, title: 'Chưa có buổi học sắp tới')
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
            child: Column(
              children: [
                for (var i = 0; i < list.length; i++) ...[
                  if (i > 0) const Divider(),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(VnTime.dayLabel(list[i].startTime), style: context.text.label),
                              Text(
                                '${VnTime.timeRange(list[i].startTime, list[i].endTime)} · ${list[i].room.name}',
                                style: context.text.caption.copyWith(color: c.textMuted),
                              ),
                            ],
                          ),
                        ),
                        _sessionTag(list[i]),
                      ],
                    ),
                  ),
                ],
                if (widget.sessions.length > _collapsed)
                  TextButton(
                    onPressed: () => setState(() => _expanded = !_expanded),
                    child: Text(_expanded ? 'Thu gọn' : 'Xem tất cả ${widget.sessions.length} buổi'),
                  ),
              ],
            ),
          ),
      ],
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
