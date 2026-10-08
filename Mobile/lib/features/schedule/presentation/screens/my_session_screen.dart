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

/// M10 — Chi tiết buổi học của Member (+ M16 hủy buổi, M17 đổi buổi).
class MySessionScreen extends ConsumerWidget {
  const MySessionScreen({super.key, required this.sessionId});

  final String sessionId;

  /// Cho quét QR từ 30 phút trước giờ học tới khi kết thúc.
  static const checkInWindow = Duration(minutes: 30);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(mySessionProvider(sessionId));
    return AppScaffold(
      title: 'Chi tiết buổi học',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(mySessionProvider(sessionId)),
        data: (m) => RefreshableScroll(
          onRefresh: () => ref.refresh(mySessionProvider(sessionId).future),
          children: [_Content(item: m)],
        ),
      ),
    );
  }
}

class _Content extends ConsumerWidget {
  const _Content({required this.item});

  final MySession item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = item.session;
    final now = DateTime.now();
    final cancelled = s.status == ScheduleStatus.cancelled;
    final canCheckIn =
        !cancelled &&
        item.attendance == null &&
        item.enrollmentStatus != EnrollmentStatus.cancelled &&
        !now.isBefore(s.startTime.subtract(MySessionScreen.checkInWindow)) &&
        now.isBefore(s.endTime);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: AppSpacing.xxs,
                runSpacing: AppSpacing.xxs,
                children: [
                  sessionStatus(s, now).tag(),
                  if (s.isMakeup) const StatusLabel('Buổi dạy bù', StatusTone.brand).tag(),
                  (item.attendance?.status ??
                          (s.hasEnded(now) && !cancelled ? notCheckedIn : item.enrollmentStatus.status))
                      .tag(),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(s.className, style: context.text.title),
              const SizedBox(height: AppSpacing.sm),
              InfoRow(icon: AppIcons.calendar, text: VnTime.friendlyDay(s.startTime, now)),
              InfoRow(icon: AppIcons.time, text: VnTime.timeRange(s.startTime, s.endTime)),
              InfoRow(icon: AppIcons.location, text: [s.room.name, s.room.location].whereType<String>().join(' · ')),
              InfoRow(icon: AppIcons.user, text: 'HLV ${s.coachName}'),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (cancelled) ...[
          AlertBanner.error(
            title: 'Buổi học đã bị hủy',
            message: [
              if (s.cancelReason != null) 'Lý do: ${s.cancelReason}.',
              if (s.cancelResolution == CancelResolutionMode.refund)
                'Bạn sẽ được hoàn tiền buổi học sau khi Quản lý duyệt.',
              if (s.cancelResolution == CancelResolutionMode.makeup) 'Chỗ của bạn đã được chuyển sang buổi dạy bù.',
            ].join(' '),
            action: item.refundId != null
                ? TextButton(onPressed: () => context.push(AppRoutes.refunds), child: const Text('Theo dõi hoàn tiền'))
                : null,
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (canCheckIn) ...[
          AppButton(
            label: 'Quét QR điểm danh',
            icon: AppIcons.scan,
            expand: true,
            onPressed: () => context.push(AppRoutes.scan),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (!cancelled && item.enrollmentStatus == EnrollmentStatus.booked) ...[
          const SectionHeader(title: 'Thay đổi lịch'),
          _ActionRow(
            icon: AppIcons.transfer,
            title: 'Đổi sang buổi khác',
            subtitle: item.transferBlockReason ?? 'Chuyển chỗ sang một buổi khác cùng khóa còn chỗ.',
            enabled: item.canTransfer,
            onTap: () => _transfer(context, ref),
          ),
          const SizedBox(height: AppSpacing.xs),
          _ActionRow(
            icon: AppIcons.ban,
            title: 'Hủy buổi này',
            subtitle: item.cancelBlockReason ?? 'Trả lại chỗ. Hủy một buổi không được hoàn tiền.',
            enabled: item.canCancel,
            danger: true,
            onTap: () => _cancel(context, ref),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        AppButton.outline(
          label: 'Nhắn tin cho HLV',
          icon: AppIcons.chat,
          expand: true,
          onPressed: () => context.push(AppRoutes.chatRoom(s.coachUserId)),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppButton.ghost(
          label: 'Xem khóa học',
          expand: true,
          onPressed: () => context.push(AppRoutes.myCourse(s.classId)),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final s = item.session;
    final ok = await showConfirmSheet(
      context: context,
      title: 'Hủy buổi học?',
      message: 'Bạn sẽ hủy chỗ ở buổi ${VnTime.sessionLabel(s.startTime, s.endTime)} của khóa "${s.className}".',
      warning: 'Hủy một buổi KHÔNG được hoàn tiền. Muốn hoàn tiền, hãy hủy cả khóa trước buổi khai giảng ≥ 24 giờ.',
      confirmLabel: 'Hủy buổi',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref.read(scheduleRepositoryProvider).cancelEnrollment(item.enrollmentId).then((_) => true),
      success: 'Đã hủy buổi học.',
    );
    if (done == true && context.mounted) {
      ref.read(dataRevisionProvider.notifier).bump();
      context.pop();
    }
  }

  Future<void> _transfer(BuildContext context, WidgetRef ref) async {
    final target = await showAppBottomSheet<TransferOption>(
      context: context,
      title: 'Đổi buổi trong cùng khóa',
      subtitle: 'Chọn buổi bạn muốn chuyển sang',
      builder: (_) => _TransferPicker(enrollmentId: item.enrollmentId),
    );
    if (target == null || !context.mounted) return;
    final s = target.session;
    final done = await runAction(
      context,
      () => ref.read(scheduleRepositoryProvider).transferEnrollment(item.enrollmentId, s.id).then((_) => true),
      success: 'Đã đổi sang buổi ${VnTime.sessionLabel(s.startTime, s.endTime)}.',
    );
    if (done == true && context.mounted) {
      ref.read(dataRevisionProvider.notifier).bump();
      context.pushReplacement(AppRoutes.mySession(s.id));
    }
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = !enabled ? c.textMuted : (danger ? context.tones.of(StatusTone.danger).foreground : c.primary);
    return Semantics(
      button: true,
      enabled: enabled,
      child: AppCard(
        onTap: enabled ? onTap : null,
        color: enabled ? null : c.surfaceMuted,
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.bodyStrong.copyWith(color: enabled ? c.text : c.textMuted)),
                  Text(subtitle, style: context.text.caption.copyWith(color: c.textMuted)),
                ],
              ),
            ),
            if (enabled)
              Icon(AppIcons.chevronRight, color: c.textMuted)
            else
              Icon(AppIcons.lock, size: AppSizes.iconSm, color: c.textMuted),
          ],
        ),
      ),
    );
  }
}

class _TransferPicker extends ConsumerStatefulWidget {
  const _TransferPicker({required this.enrollmentId});

  final String enrollmentId;

  @override
  ConsumerState<_TransferPicker> createState() => _TransferPickerState();
}

class _TransferPickerState extends ConsumerState<_TransferPicker> {
  TransferOption? _selected;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(transferOptionsProvider(widget.enrollmentId));
    final c = context.colors;
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator.adaptive()),
      ),
      error: (e, _) => ErrorState(
        error: e,
        compact: true,
        onRetry: () => ref.invalidate(transferOptionsProvider(widget.enrollmentId)),
      ),
      data: (options) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (options.isEmpty) const EmptyState(compact: true, title: 'Khóa không còn buổi nào khác để đổi'),
          RadioGroup<String>(
            groupValue: _selected?.session.id,
            onChanged: (id) => setState(() => _selected = options.firstWhere((o) => o.session.id == id)),
            child: Column(
              children: [
                for (final o in options)
                  RadioListTile<String>(
                    value: o.session.id,
                    enabled: o.blockReason == null,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      VnTime.sessionLabel(o.session.startTime, o.session.endTime),
                      style: context.text.bodyStrong,
                    ),
                    subtitle: Text(
                      o.blockReason ?? '${o.session.room.name} · Còn ${o.remaining} chỗ',
                      style: context.text.caption.copyWith(
                        color: o.blockReason == null ? c.textMuted : context.tones.of(StatusTone.danger).foreground,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Xác nhận đổi buổi',
            expand: true,
            onPressed: _selected == null ? null : () => Navigator.of(context).pop(_selected),
          ),
        ],
      ),
    );
  }
}
