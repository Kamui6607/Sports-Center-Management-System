import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/schedule_repository_provider.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';
import '../session_labels.dart';

/// H03 — Chi tiết buổi dạy: danh sách học viên + điểm danh, mở QR, hoàn tất, hủy.
class TeachingSessionScreen extends ConsumerWidget {
  const TeachingSessionScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(teachingSessionProvider(sessionId));
    return AppScaffold(
      title: 'Buổi dạy',
      bottomBar: value.value == null ? null : _ActionBar(detail: value.value!),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(teachingSessionProvider(sessionId)),
        data: (t) => RefreshableScroll(
          onRefresh: () => ref.refresh(teachingSessionProvider(sessionId).future),
          children: [_Body(detail: t)],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.detail});

  final TeachingSession detail;

  @override
  Widget build(BuildContext context) {
    final s = detail.session;
    final now = DateTime.now();
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: AppSpacing.xxs,
                children: [
                  sessionStatus(s, now).tag(),
                  if (s.isMakeup) const StatusLabel('Buổi dạy bù', StatusTone.brand).tag(),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(s.className, style: context.text.title),
              const SizedBox(height: AppSpacing.xs),
              InfoRow(icon: AppIcons.calendar, text: VnTime.friendlyDay(s.startTime, now)),
              InfoRow(icon: AppIcons.time, text: VnTime.timeRange(s.startTime, s.endTime)),
              InfoRow(icon: AppIcons.location, text: [s.room.name, s.room.location].whereType<String>().join(' · ')),
              InfoRow(icon: AppIcons.users, text: '${s.bookedCount}/${s.capacity} học viên giữ chỗ'),
              if (s.status == ScheduleStatus.cancelled) ...[
                const SizedBox(height: AppSpacing.sm),
                AlertBanner.error(
                  title: 'Buổi đã hủy${s.cancelResolution == null ? '' : ' — ${s.cancelResolution!.label}'}',
                  message: s.cancelReason ?? 'Không có lý do.',
                  action: detail.makeupSession == null
                      ? null
                      : TextButton(
                          onPressed: () => context.push(AppRoutes.teachingSession(detail.makeupSession!.id)),
                          child: Text(
                            'Buổi dạy bù: ${VnTime.sessionLabel(detail.makeupSession!.startTime, detail.makeupSession!.endTime)}',
                          ),
                        ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        SectionHeader(title: 'Học viên (${detail.roster.length}) · Có mặt ${detail.checkedIn}'),
        if (detail.roster.isEmpty)
          const EmptyState(compact: true, icon: AppIcons.users, title: 'Chưa có học viên đặt chỗ buổi này')
        else
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < detail.roster.length; i++) ...[
                  if (i > 0) const Divider(indent: AppSpacing.xxl + AppSpacing.lg),
                  ListTile(
                    leading: AppAvatar(name: detail.roster[i].fullName, imageUrl: detail.roster[i].avatarUrl),
                    title: Text(detail.roster[i].fullName),
                    subtitle: detail.roster[i].note == null ? null : Text(detail.roster[i].note!),
                    trailing:
                        (detail.roster[i].attendance?.status ??
                                (s.hasStarted(now) ? notCheckedIn : detail.roster[i].enrollmentStatus.status))
                            .tag(dense: true),
                    onTap: () => context.push(AppRoutes.student(detail.roster[i].memberProfileId)),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        Text(
          'Mẹo: mở mã QR để học viên tự điểm danh; dùng điểm danh thủ công cho học viên không quét được.',
          style: context.text.caption.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}

class _ActionBar extends ConsumerStatefulWidget {
  const _ActionBar({required this.detail});

  final TeachingSession detail;

  @override
  ConsumerState<_ActionBar> createState() => _ActionBarState();
}

class _ActionBarState extends ConsumerState<_ActionBar> {
  bool _completing = false;

  Future<void> _complete() async {
    final s = widget.detail.session;
    final ok = await showConfirmSheet(
      context: context,
      title: 'Hoàn tất buổi dạy?',
      message:
          'Buổi ${VnTime.sessionLabel(s.startTime, s.endTime)} sẽ chuyển sang "Đã hoàn thành". Hãy chắc chắn đã điểm danh đủ học viên.',
      confirmLabel: 'Hoàn tất',
    );
    if (!ok || !mounted) return;
    setState(() => _completing = true);
    final done = await runAction(
      context,
      () => ref.read(scheduleRepositoryProvider).completeSession(s.id).then((_) => true),
      success: 'Đã hoàn tất buổi dạy.',
    );
    if (!mounted) return;
    setState(() => _completing = false);
    if (done == true) ref.read(dataRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.detail.session;
    final now = DateTime.now();
    if (s.status != ScheduleStatus.scheduled) return const SizedBox.shrink();
    final qrWindow = !now.isBefore(s.startTime.subtract(const Duration(minutes: 30))) && now.isBefore(s.endTime);
    final started = s.hasStarted(now);
    return StickyBottomBar(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (qrWindow) ...[
            AppButton.secondary(
              label: 'Mở QR điểm danh',
              icon: AppIcons.qr,
              expand: true,
              onPressed: () => context.push(AppRoutes.sessionQr(s.id)),
            ),
            const SizedBox(height: AppSpacing.xs),
          ],
          Row(
            children: [
              if (started)
                Expanded(
                  child: AppButton.outline(
                    label: 'Điểm danh',
                    icon: AppIcons.attendance,
                    size: AppButtonSize.small,
                    onPressed: widget.detail.roster.isEmpty
                        ? null
                        : () => context.push(AppRoutes.sessionAttendance(s.id)),
                  ),
                ),
              if (started) const SizedBox(width: AppSpacing.xs),
              if (s.hasEnded(now))
                Expanded(
                  child: AppButton(
                    label: 'Hoàn tất buổi',
                    icon: AppIcons.check,
                    size: AppButtonSize.small,
                    loading: _completing,
                    onPressed: _complete,
                  ),
                )
              else if (!started)
                Expanded(
                  child: AppButton.danger(
                    label: 'Hủy buổi',
                    icon: AppIcons.ban,
                    size: AppButtonSize.small,
                    onPressed: () => context.push(AppRoutes.sessionCancel(s.id)),
                  ),
                ),
            ],
          ),
          if (!s.hasEnded(now) && started)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xxs),
              child: Text(
                'Hoàn tất được sau ${VnTime.time(s.endTime)}.',
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
            ),
        ],
      ),
    );
  }
}
