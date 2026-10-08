import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../schedule/presentation/session_labels.dart';
import '../../data/attendance_repository_provider.dart';
import '../../domain/entities/attendance.dart';
import '../providers/attendance_providers.dart';

/// M12 — Chuyên cần: tỷ lệ theo khóa, phạt & khiếu nại, lịch sử điểm danh.
class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(myAttendanceSummaryProvider);
    final penalties = ref.watch(myPenaltiesProvider).value ?? const [];
    final records = ref.watch(myAttendanceRecordsProvider).value ?? const [];
    return AppScaffold(
      title: 'Chuyên cần',
      body: AsyncValueView(
        value: summary,
        onRetry: () => ref.invalidate(myAttendanceSummaryProvider),
        data: (stats) => RefreshableScroll(
          onRefresh: () async {
            ref
              ..invalidate(myPenaltiesProvider)
              ..invalidate(myAttendanceRecordsProvider);
            ref.invalidate(myAttendanceSummaryProvider);
            await ref.read(myAttendanceSummaryProvider.future);
          },
          children: [
            const AlertBanner.info(
              message: 'Có mặt hoặc đi trễ được tính là tham gia. Dưới 80% sẽ bị cảnh báo; tiếp tục vắng có thể bị thu hồi chỗ và chặn đặt lại.',
            ),
            const SizedBox(height: AppSpacing.md),
            for (final p in penalties) ...[_PenaltyCard(penalty: p), const SizedBox(height: AppSpacing.sm)],
            const SectionHeader(title: 'Tỷ lệ chuyên cần theo khóa'),
            if (stats.isEmpty)
              const EmptyState(compact: true, icon: AppIcons.attendance, title: 'Chưa có dữ liệu điểm danh')
            else
              for (final s in stats) ...[_StatCard(stat: s), const SizedBox(height: AppSpacing.sm)],
            const SizedBox(height: AppSpacing.md),
            SectionHeader(title: 'Lịch sử điểm danh (${records.length})'),
            if (records.isNotEmpty)
              AppCard(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
                child: Column(
                  children: [
                    for (var i = 0; i < records.length; i++) ...[
                      if (i > 0) const Divider(),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(records[i].className, style: context.text.label),
                                  Text(
                                    VnTime.sessionLabel(records[i].startTime, records[i].endTime),
                                    style: context.text.caption.copyWith(color: context.colors.textMuted),
                                  ),
                                  if (records[i].note != null)
                                    Text(
                                      records[i].note!,
                                      style: context.text.caption.copyWith(color: context.colors.textMuted),
                                    ),
                                ],
                              ),
                            ),
                            records[i].status.status.tag(dense: true),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.stat});

  final ClassAttendanceStat stat;

  @override
  Widget build(BuildContext context) {
    final tone = stat.isWarning ? StatusTone.danger : StatusTone.success;
    Widget count(String label, int v, StatusTone t) => Expanded(
      child: Column(
        children: [
          Text('$v', style: context.text.titleSmall.copyWith(color: context.tones.of(t).foreground)),
          Text(
            label,
            textAlign: TextAlign.center,
            style: context.text.caption.copyWith(color: context.colors.textMuted),
          ),
        ],
      ),
    );
    return AppCard(
      borderColor: stat.isWarning ? context.tones.of(StatusTone.danger).border : null,
      child: Column(
        children: [
          Row(
            children: [
              ProgressRing(ratio: stat.rate, color: context.tones.of(tone).foreground),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(stat.className, style: context.text.bodyStrong),
                    Text(
                      '${stat.total} buổi đã điểm danh',
                      style: context.text.caption.copyWith(color: context.colors.textMuted),
                    ),
                    if (stat.isWarning) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      const StatusLabel('Dưới 80% — cảnh báo', StatusTone.danger).tag(dense: true),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: AppSpacing.lg),
          Row(
            children: [
              count('Có mặt', stat.present, StatusTone.success),
              count('Đi trễ', stat.late, StatusTone.warning),
              count('Vắng', stat.absent, StatusTone.danger),
              count('Có phép', stat.excused, StatusTone.info),
            ],
          ),
        ],
      ),
    );
  }
}

class _PenaltyCard extends ConsumerWidget {
  const _PenaltyCard({required this.penalty});

  final AttendancePenalty penalty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = penalty;
    final now = DateTime.now();
    final active = p.status == PenaltyStatus.applied && (p.blockedUntil?.isAfter(now) ?? false);
    return AlertBanner(
      tone: active ? StatusTone.danger : StatusTone.neutral,
      icon: AppIcons.ban,
      title: active ? 'Phạt chuyên cần · ${p.className}' : 'Phạt đã hết hiệu lực · ${p.className}',
      message: [
        p.reason,
        'Đã thu hồi ${p.releasedCount} buổi sắp tới.',
        if (p.blockedUntil != null) 'Chặn đặt lại đến ${VnTime.date(p.blockedUntil!)}.',
        if (p.appealedAt != null) 'Đã gửi khiếu nại lúc ${VnTime.dateTime(p.appealedAt!)} — chờ Quản lý xem xét.',
      ].join('\n'),
      action: p.canAppeal(now)
          ? AppButton.outline(
              label: 'Khiếu nại (hạn ${VnTime.dateTime(p.appealDeadline!)})',
              size: AppButtonSize.small,
              onPressed: () => showAppBottomSheet<void>(
                context: context,
                title: 'Khiếu nại quyết định phạt',
                builder: (_) => _AppealForm(penaltyId: p.id),
              ),
            )
          : null,
    );
  }
}

class _AppealForm extends ConsumerStatefulWidget {
  const _AppealForm({required this.penaltyId});

  final String penaltyId;

  @override
  ConsumerState<_AppealForm> createState() => _AppealFormState();
}

class _AppealFormState extends ConsumerState<_AppealForm> with SubmittingState {
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    var ok = false;
    await submit(() async {
      await ref.read(attendanceRepositoryProvider).appeal(widget.penaltyId, _reason.text);
      ok = true;
    });
    if (!ok || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    Navigator.of(context).pop();
    AppSnackbar.success(context, 'Đã gửi khiếu nại tới Quản lý.');
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          label: 'Lý do khiếu nại',
          requiredField: true,
          controller: _reason,
          maxLines: 4,
          maxLength: 1000,
          hint: 'VD: Tôi có giấy khám bệnh cho các buổi vắng…',
          validator: Validators.minLength(5, 'Lý do'),
          errorText: fieldErrors['reason'],
        ),
        if (formError != null && fieldErrors.isEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          AlertBanner.error(message: formError!),
        ],
        const SizedBox(height: AppSpacing.md),
        AppButton(label: 'Gửi khiếu nại', expand: true, loading: submitting, onPressed: _submit),
      ],
    ),
  );
}
