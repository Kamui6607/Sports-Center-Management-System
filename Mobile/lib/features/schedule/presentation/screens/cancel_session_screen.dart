import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../classes/presentation/providers/course_providers.dart';
import '../../data/schedule_repository_provider.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';
import '../session_labels.dart';

/// H06 — Hủy buổi: chưa ai đặt ⇒ hủy thẳng; đã có học viên ⇒ bắt buộc chọn
/// Dạy bù (giờ/phòng mới) hoặc Hoàn tiền 1 buổi.
class CancelSessionScreen extends ConsumerWidget {
  const CancelSessionScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(teachingSessionProvider(sessionId));
    final preview = ref.watch(cancelPreviewProvider(sessionId));
    return AppScaffold(
      title: 'Hủy buổi học',
      body: AsyncValueView(
        value: preview,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(cancelPreviewProvider(sessionId)),
        data: (p) =>
            detail.value == null ? const SkeletonDetail() : _Wizard(session: detail.value!.session, preview: p),
      ),
    );
  }
}

class _Wizard extends ConsumerStatefulWidget {
  const _Wizard({required this.session, required this.preview});

  final ClassSession session;
  final CancelPreview preview;

  @override
  ConsumerState<_Wizard> createState() => _WizardState();
}

class _WizardState extends ConsumerState<_Wizard> with SubmittingState {
  final _reason = TextEditingController();
  int _step = 0;
  CancelResolutionMode? _mode;
  DateTime? _makeupStart;
  String? _roomId;

  ClassSession get s => widget.session;
  Duration get _duration => s.endTime.difference(s.startTime);
  bool get _needsResolution => widget.preview.requiresResolution;

  List<String> get _steps => _needsResolution ? const ['Lý do', 'Phương án', 'Xác nhận'] : const ['Lý do', 'Xác nhận'];

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _canNext => switch (_steps[_step]) {
    'Phương án' =>
      _mode == CancelResolutionMode.refund || (_mode == CancelResolutionMode.makeup && _makeupStart != null),
    _ => true,
  };

  Future<void> _confirm() async {
    final result = await submit(
      () => ref
          .read(scheduleRepositoryProvider)
          .cancelSession(
            s.id,
            CancelSessionInput(
              reason: _reason.text,
              mode: _needsResolution ? _mode : null,
              makeupStart: _makeupStart,
              makeupEnd: _makeupStart?.add(_duration),
              makeupRoomId: _roomId,
            ),
          ),
    );
    if (result == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(
      context,
      result.makeupSession != null
          ? 'Đã hủy buổi và tạo buổi dạy bù. ${result.affectedMembers} học viên được chuyển và thông báo.'
          : (result.refundCount > 0
                ? 'Đã hủy buổi. Tạo ${result.refundCount} yêu cầu hoàn tiền chờ Quản lý duyệt.'
                : 'Đã hủy buổi học.'),
    );
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final stepName = _steps[_step];
    final last = _step == _steps.length - 1;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.all(context.screenPadding),
            children: [
              StepIndicator(steps: _steps, current: _step),
              const SizedBox(height: AppSpacing.lg),
              AppCard(
                color: context.colors.surfaceMuted,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.className, style: context.text.bodyStrong),
                    Text('${VnTime.sessionLabel(s.startTime, s.endTime)} · ${s.room.name}', style: context.text.small),
                    Text(
                      '${widget.preview.bookedCount} học viên đã giữ chỗ',
                      style: context.text.caption.copyWith(color: context.colors.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              switch (stepName) {
                'Lý do' => _reasonStep(context),
                'Phương án' => _resolutionStep(context),
                _ => _reviewStep(context),
              },
              if (formError != null) ...[const SizedBox(height: AppSpacing.md), AlertBanner.error(message: formError!)],
            ],
          ),
        ),
        WizardNavBar(
          showBack: _step > 0,
          onBack: submitting ? null : () => setState(() => _step--),
          primary: last
              ? AppButton.danger(label: 'Xác nhận hủy buổi', loading: submitting, onPressed: _confirm)
              : AppButton(label: 'Tiếp tục', onPressed: _canNext ? () => setState(() => _step++) : null),
        ),
      ],
    );
  }

  Widget _reasonStep(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AppTextField(
        label: 'Lý do hủy',
        controller: _reason,
        maxLines: 3,
        maxLength: 500,
        hint: 'VD: HLV bị ốm, phòng tập bảo trì…',
      ),
      const SizedBox(height: AppSpacing.sm),
      if (_needsResolution)
        AlertBanner.warning(
          message:
              'Buổi đã có ${widget.preview.bookedCount} học viên đặt chỗ — bạn phải chọn dạy bù hoặc hoàn tiền cho học viên.',
        )
      else
        const AlertBanner.info(message: 'Buổi chưa có học viên đặt chỗ nên sẽ được hủy trực tiếp.'),
    ],
  );

  Widget _resolutionStep(BuildContext context) {
    final rooms = ref.watch(roomsProvider(s.room.areaType)).value ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChoiceCard(
          icon: AppIcons.calendar,
          title: CancelResolutionMode.makeup.label,
          description: 'Tạo buổi bù; toàn bộ học viên được chuyển sang buổi mới và nhận thông báo lịch mới.',
          selected: _mode == CancelResolutionMode.makeup,
          onTap: () => setState(() => _mode = CancelResolutionMode.makeup),
        ),
        if (_mode == CancelResolutionMode.makeup) ...[
          const SizedBox(height: AppSpacing.sm),
          DateTimeField(
            label: 'Thời gian bắt đầu buổi bù',
            mode: DateTimeFieldMode.dateTime,
            requiredField: true,
            value: _makeupStart,
            firstDate: DateTime.now(),
            onChanged: (v) => setState(() => _makeupStart = v),
          ),
          if (_makeupStart != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xxs),
              child: Text(
                'Kết thúc lúc ${VnTime.time(_makeupStart!.add(_duration))} (giữ thời lượng ${_duration.inMinutes} phút)',
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          SelectField<String>(
            label: 'Phòng tập',
            options: [
              for (final r in rooms) SelectOption(r.id, r.name, subtitle: '${r.location ?? ''} · ${r.capacity} chỗ'),
            ],
            values: [_roomId ?? s.room.id],
            onChanged: (v) => setState(() => _roomId = v.firstOrNull),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        ChoiceCard(
          icon: AppIcons.refund,
          title: CancelResolutionMode.refund.label,
          description:
              'Mỗi học viên được hoàn ~${Money.format(widget.preview.perSessionRefund)} (giá khóa ÷ số buổi chính). '
              'Quản lý duyệt chuyển khoản; ví của bạn bị trừ 85% tương ứng.',
          selected: _mode == CancelResolutionMode.refund,
          onTap: () => setState(() => _mode = CancelResolutionMode.refund),
        ),
      ],
    );
  }

  Widget _reviewStep(BuildContext context) => AppCard(
    child: Column(
      children: [
        KeyValueRow(label: 'Lý do', value: _reason.text.trim().isEmpty ? '(không ghi)' : _reason.text.trim()),
        if (_needsResolution) KeyValueRow(label: 'Phương án', value: _mode?.label ?? ''),
        if (_mode == CancelResolutionMode.makeup && _makeupStart != null)
          KeyValueRow(label: 'Buổi dạy bù', value: VnTime.sessionLabel(_makeupStart!, _makeupStart!.add(_duration))),
        if (_mode == CancelResolutionMode.refund)
          KeyValueRow(
            label: 'Tổng hoàn dự kiến',
            value: Money.format(widget.preview.perSessionRefund * widget.preview.bookedCount),
            emphasize: true,
          ),
        const SizedBox(height: AppSpacing.sm),
        const AlertBanner.warning(message: 'Thao tác không thể hoàn tác. Học viên sẽ nhận thông báo ngay.'),
      ],
    ),
  );
}
