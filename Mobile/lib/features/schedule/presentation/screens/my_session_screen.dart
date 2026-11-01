import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../catalog/presentation/location_card.dart';
import '../../data/schedule_repository_provider.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';
import '../session_labels.dart';
import '../widgets/session_change_sheets.dart';
import '../widgets/session_makeup_card.dart';

/// M10 — Chi tiết buổi học của Member (+ M16 hủy buổi, M17 đổi buổi).
class MySessionScreen extends ConsumerWidget {
  const MySessionScreen({super.key, required this.sessionId});

  final String sessionId;

  /// Cho quét QR từ 30 phút trước giờ học tới khi kết thúc.
  static const checkInWindow = Duration(minutes: 30);

  /// Luật hoàn tiền khi hội viên hủy 1 buổi (BE `SESSION_REFUND_*`).
  static const refundMinHours = 24;
  static const refundPercent = 80;

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
        (item.attendance == null || item.hasReportedAbsence) &&
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
                  if (item.isMakeupEnrollment) const StatusLabel('Học bù', StatusTone.brand).tag(),
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
              InfoRow(icon: AppIcons.user, text: 'HLV ${s.coachName}'),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (s.isRescheduled && !cancelled) ...[
          AlertBanner.warning(
            title: 'Buổi học đã được HLV dời lịch',
            message: [
              if (s.originalStartTime != null)
                'Giờ cũ: ${VnTime.friendlyDay(s.originalStartTime!, now)} · ${VnTime.time(s.originalStartTime!)}.',
              'Giờ mới: ${VnTime.friendlyDay(s.startTime, now)} · ${VnTime.timeRange(s.startTime, s.endTime)}.',
              if (s.rescheduleReason != null) 'Lý do: ${s.rescheduleReason}.',
              'Nếu không thể tham gia, bạn có thể hủy buổi này trước giờ học để được hoàn 100% tiền buổi, hoặc đổi sang buổi khác.',
            ].join('\n'),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        const SectionHeader(title: 'Địa điểm tập'),
        LocationCard(room: s.room),
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
        if (item.hasReportedAbsence && !cancelled) ...[
          AlertBanner.info(
            title: 'Bạn đã báo vắng buổi này',
            message: [
              if (item.absenceReason!.isNotEmpty) 'Lý do: ${item.absenceReason}.',
              'Buổi được ghi "Vắng có phép" — không tính vào chuyên cần, không hoàn tiền. '
                  'Nếu vẫn đến được, bạn quét QR điểm danh như bình thường.',
            ].join(' '),
            action: s.hasStarted(now)
                ? null
                : TextButton(onPressed: () => _cancelAbsence(context, ref), child: const Text('Hủy báo vắng')),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (item.hasReportedAbsence && !cancelled && !item.isMakeupEnrollment) ...[
          SessionMakeupCard(item: item),
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
            subtitle: item.canTransfer
                ? 'Sang buổi dạy bù hoặc khóa tương đương cùng HLV · trước giờ học ≥ 24h · tối đa $kMaxTransfersPerCourse lần/khóa.'
                : item.transferBlockReason ?? '',
            // Không có buổi để đổi nhưng buổi còn thay đổi được ⇒ vẫn mở để giải thích + chỉ lối ra.
            enabled: item.canTransfer || item.canCancel,
            onTap: () => item.canTransfer ? _transfer(context, ref) : _explainNoTransfer(context, ref),
          ),
          const SizedBox(height: AppSpacing.xs),
          if (!item.hasReportedAbsence) ...[
            _ActionRow(
              icon: AppIcons.absence,
              title: 'Báo vắng',
              subtitle: _absenceNote(),
              enabled: _canReportAbsence,
              onTap: () => _reportAbsence(context, ref),
            ),
            const SizedBox(height: AppSpacing.xs),
          ],
          _ActionRow(
            icon: AppIcons.ban,
            title: 'Hủy buổi này',
            subtitle: item.cancelBlockReason ?? _refundPolicy(now),
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

  bool get _canReportAbsence => item.canCancel && item.attendance == null && item.absencesLeft > 0;

  String _absenceNote() {
    if (!item.canCancel) return item.cancelBlockReason ?? 'Chỉ báo vắng được trước giờ học.';
    if (item.attendance != null) return 'Buổi này đã được điểm danh.';
    if (item.absencesLeft == 0) return 'Bạn đã dùng hết $kMaxAbsencesPerCourse lần báo vắng của khóa này.';
    return 'Không tính vắng · không hoàn tiền · còn ${item.absencesLeft}/$kMaxAbsencesPerCourse lần cho khóa này.';
  }

  /// Chính sách hoàn tiền nếu hủy buổi NGAY BÂY GIỜ (BE tính chính thức khi hủy).
  String _refundPolicy(DateTime now) {
    final s = item.session;
    if (s.isRescheduled) return 'Buổi đã bị HLV dời lịch — hủy được hoàn 100% tiền buổi.';
    if (s.startTime.difference(now).inMinutes >= MySessionScreen.refundMinHours * 60) {
      return 'Hủy trước giờ học ≥ ${MySessionScreen.refundMinHours}h — hoàn ${MySessionScreen.refundPercent}% tiền buổi.';
    }
    return 'Còn dưới ${MySessionScreen.refundMinHours}h — hủy được nhưng không hoàn tiền.';
  }

  void _refresh(WidgetRef ref) {
    ref.invalidate(mySessionProvider(item.session.id));
    ref.read(dataRevisionProvider.notifier).bump();
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final s = item.session;
    final ok = await showConfirmSheet(
      context: context,
      title: 'Hủy buổi học?',
      message: 'Bạn sẽ hủy chỗ ở buổi ${VnTime.sessionLabel(s.startTime, s.endTime)} của khóa "${s.className}".',
      warning:
          '${_refundPolicy(DateTime.now())} Tiền hoàn (nếu có) được Quản lý chuyển khoản sau khi duyệt. '
          'Buổi đã hủy kèm hoàn tiền không đặt lại được.',
      confirmLabel: 'Hủy buổi',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref.read(scheduleRepositoryProvider).cancelEnrollment(item.enrollmentId).then((_) => true),
      success: 'Đã hủy buổi học. Xem yêu cầu hoàn tiền (nếu có) ở mục Hoàn tiền.',
    );
    if (done == true && context.mounted) {
      ref.read(dataRevisionProvider.notifier).bump();
      context.pop();
    }
  }

  Future<void> _reportAbsence(BuildContext context, WidgetRef ref) async {
    final input = await showAppBottomSheet<AbsenceInput>(
      context: context,
      title: 'Báo vắng buổi học',
      subtitle: VnTime.sessionLabel(item.session.startTime, item.session.endTime),
      builder: (_) => AbsenceForm(absencesLeft: item.absencesLeft),
    );
    if (input == null || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref
          .read(scheduleRepositoryProvider)
          .reportAbsence(item.enrollmentId, input.reason, requestMakeup: input.requestMakeup)
          .then((_) => true),
      success: input.requestMakeup
          ? 'Đã báo vắng và gửi yêu cầu học bù. HLV đã nhận được thông báo.'
          : 'Đã báo vắng. HLV đã nhận được thông báo.',
    );
    if (done == true && context.mounted) _refresh(ref);
  }

  Future<void> _cancelAbsence(BuildContext context, WidgetRef ref) async {
    final done = await runAction(
      context,
      () => ref.read(scheduleRepositoryProvider).cancelAbsence(item.enrollmentId).then((_) => true),
      success: 'Đã hủy báo vắng.',
    );
    if (done == true && context.mounted) _refresh(ref);
  }

  /// Không có buổi để đổi ⇒ giải thích lý do + lối ra: nhắn HLV (tin soạn sẵn), báo vắng, hủy buổi.
  Future<void> _explainNoTransfer(BuildContext context, WidgetRef ref) async {
    final s = item.session;
    final exit = await showAppBottomSheet<NoTransferExit>(
      context: context,
      title: 'Chưa có buổi để đổi',
      builder: (_) => NoTransferSheet(
        message: noTransferMessage(item.transferEmptyReason, item.transferBlockReason),
        canReportAbsence: !item.hasReportedAbsence && _canReportAbsence,
        absenceNote: item.hasReportedAbsence ? 'Bạn đã báo vắng buổi này.' : _absenceNote(),
        cancelNote: _refundPolicy(DateTime.now()),
      ),
    );
    if (exit == null || !context.mounted) return;
    switch (exit) {
      case NoTransferExit.chat:
        await context.push<void>(
          AppRoutes.chatRoom(s.coachUserId),
          extra:
              'Chào HLV, em không tham gia được buổi ${VnTime.sessionLabel(s.startTime, s.endTime)} '
              'của khóa "${s.className}". HLV có buổi nào để em học bù không ạ?',
        );
      case NoTransferExit.absence:
        await _reportAbsence(context, ref);
      case NoTransferExit.cancel:
        await _cancel(context, ref);
    }
  }

  Future<void> _transfer(BuildContext context, WidgetRef ref) async {
    final target = await showAppBottomSheet<TransferOption>(
      context: context,
      title: 'Đổi buổi học',
      subtitle: 'Buổi dạy bù của khóa này hoặc khóa tương đương cùng HLV',
      builder: (_) => TransferPicker(enrollmentId: item.enrollmentId),
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
