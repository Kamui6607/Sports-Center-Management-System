import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';

/// Sheet chọn buổi đích khi đổi buổi (`GET /enrollments/:id/transfer-options`).
class TransferPicker extends ConsumerStatefulWidget {
  const TransferPicker({super.key, required this.enrollmentId});

  final String enrollmentId;

  @override
  ConsumerState<TransferPicker> createState() => _TransferPickerState();
}

class _TransferPickerState extends ConsumerState<TransferPicker> {
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
      data: (t) {
        final options = t.options;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Còn ${t.transfersLeft}/${t.maxTransfers} lần đổi buổi cho khóa này. Đổi buổi không hoàn tiền.',
              style: context.text.small.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (t.blockReason != null) ...[
              AlertBanner.warning(message: t.blockReason!),
              const SizedBox(height: AppSpacing.sm),
            ],
            if (options.isEmpty)
              EmptyState(
                compact: true,
                title: 'Không còn buổi nào phù hợp để đổi',
                message: noTransferMessage(t.emptyReason, null),
              ),
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
                        [
                          if (!o.isSameClass) 'Khóa ${o.session.className}',
                          if (o.session.isMakeup) 'Buổi dạy bù',
                          o.blockReason ?? '${o.session.room.name} · Còn ${o.remaining} chỗ',
                        ].join(' · '),
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
        );
      },
    );
  }
}

/// Vì sao không đổi được buổi — nói bằng lời, kèm nguồn buổi đích để học viên hiểu luật.
String noTransferMessage(TransferEmptyReason? reason, String? fallback) => switch (reason) {
  TransferEmptyReason.noMakeupOrEquivalent =>
    'Chỉ đổi được sang buổi dạy bù của khóa này hoặc buổi của khóa tương đương (cùng HLV, cùng hạng). '
        'Hiện khóa chưa có buổi dạy bù và HLV không có khóa tương đương còn buổi.',
  TransferEmptyReason.allFull => 'Các buổi có thể đổi sang đều đã hết chỗ.',
  TransferEmptyReason.allConflict => 'Các buổi có thể đổi sang đều trùng giờ với lịch khác của bạn.',
  TransferEmptyReason.allUnavailable => 'Các buổi có thể đổi sang đều hết chỗ hoặc trùng giờ với lịch của bạn.',
  TransferEmptyReason.tooLate => 'Chỉ đổi buổi khi buổi học còn ít nhất 24 giờ mới bắt đầu.',
  TransferEmptyReason.limit => 'Bạn đã dùng hết $kMaxTransfersPerCourse lần đổi buổi của khóa này.',
  TransferEmptyReason.notAvailable || null => fallback ?? 'Hiện chưa có buổi nào để đổi.',
};

/// Lối ra khi không đổi được buổi.
enum NoTransferExit { chat, absence, cancel }

/// Giải thích vì sao không đổi được + các lối ra: nhắn HLV, báo vắng, hủy buổi.
class NoTransferSheet extends StatelessWidget {
  const NoTransferSheet({
    super.key,
    required this.message,
    required this.canReportAbsence,
    required this.absenceNote,
    required this.cancelNote,
  });

  final String message;
  final bool canReportAbsence;

  /// Dòng mô tả dưới "Báo vắng" (lượt còn lại / lý do bị khóa).
  final String absenceNote;

  /// Chính sách hoàn tiền nếu hủy ngay.
  final String cancelNote;

  @override
  Widget build(BuildContext context) {
    final muted = context.text.caption.copyWith(color: context.colors.textMuted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AlertBanner.info(message: message),
        const SizedBox(height: AppSpacing.md),
        Text('Bạn có thể', style: context.text.bodyStrong),
        const SizedBox(height: AppSpacing.xs),
        AppButton.secondary(
          label: 'Nhắn HLV xin học bù',
          icon: AppIcons.chat,
          expand: true,
          onPressed: () => Navigator.of(context).pop(NoTransferExit.chat),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppButton.outline(
          label: 'Báo vắng buổi này',
          icon: AppIcons.absence,
          expand: true,
          onPressed: canReportAbsence ? () => Navigator.of(context).pop(NoTransferExit.absence) : null,
        ),
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xxs),
          child: Text(absenceNote, style: muted),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppButton.danger(
          label: 'Hủy buổi',
          expand: true,
          onPressed: () => Navigator.of(context).pop(NoTransferExit.cancel),
        ),
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xxs),
          child: Text(cancelNote, style: muted),
        ),
      ],
    );
  }
}

/// Kết quả form báo vắng.
typedef AbsenceInput = ({String reason, bool requestMakeup});

/// Form báo vắng: lý do (≥ 5 ký tự) + xin buổi học bù ⇒ trả về [AbsenceInput].
class AbsenceForm extends StatefulWidget {
  const AbsenceForm({super.key, required this.absencesLeft});

  final int absencesLeft;

  @override
  State<AbsenceForm> createState() => _AbsenceFormState();
}

class _AbsenceFormState extends State<AbsenceForm> {
  final _reason = TextEditingController();
  String? _error;
  bool _requestMakeup = true;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _reason.text.trim();
    if (text.length < 5) {
      setState(() => _error = 'Nhập lý do (tối thiểu 5 ký tự).');
      return;
    }
    Navigator.of(context).pop<AbsenceInput>((reason: text, requestMakeup: _requestMakeup));
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AppTextField(
        label: 'Lý do',
        hint: 'VD: Bị ốm, có việc gia đình…',
        controller: _reason,
        errorText: _error,
        maxLines: 3,
        maxLength: 300,
      ),
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        value: _requestMakeup,
        onChanged: (v) => setState(() => _requestMakeup = v),
        title: const Text('Xin buổi học bù'),
        subtitle: const Text('HLV xếp buổi khác, hoặc bạn tự chọn buổi bù HLV mở cho khóa.'),
      ),
      const SizedBox(height: AppSpacing.xs),
      Text(
        'Buổi này được ghi "Vắng có phép": không tính vào chuyên cần, không hoàn tiền. '
        'HLV sẽ nhận thông báo. Còn ${widget.absencesLeft}/$kMaxAbsencesPerCourse lần báo vắng cho khóa này.',
        style: context.text.caption.copyWith(color: context.colors.textMuted),
      ),
      const SizedBox(height: AppSpacing.lg),
      AppButton(label: 'Gửi báo vắng', expand: true, onPressed: _submit),
    ],
  );
}
