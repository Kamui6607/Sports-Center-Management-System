import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/data_revision.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';

/// Thanh Duyệt / Từ chối dùng chung cho các màn duyệt của Manager (Q1).
/// Từ chối bắt buộc nhập lý do (R06).
class ReviewActionBar extends StatefulWidget {
  const ReviewActionBar({
    super.key,
    required this.onApprove,
    required this.onReject,
    required this.approveLabel,
    required this.approveMessage,
    this.approveNoteLabel,
  });

  /// Nhận ghi chú duyệt (nếu [approveNoteLabel] != null).
  final Future<bool> Function(String? note) onApprove;
  final Future<bool> Function(String reason) onReject;
  final String approveLabel;
  final String approveMessage;

  /// Có ô ghi chú khi duyệt (VD mã giao dịch chuyển khoản hoàn tiền).
  final String? approveNoteLabel;

  @override
  State<ReviewActionBar> createState() => _ReviewActionBarState();
}

class _ReviewActionBarState extends State<ReviewActionBar> {
  bool _busy = false;

  Future<void> _run(Future<bool> Function() action) async {
    setState(() => _busy = true);
    await action();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _approve() async {
    String? note;
    if (widget.approveNoteLabel != null) {
      final result = await showAppBottomSheet<String>(
        context: context,
        title: widget.approveLabel,
        builder: (_) => _ReasonForm(
          label: widget.approveNoteLabel!,
          message: widget.approveMessage,
          submitLabel: widget.approveLabel,
          required: false,
        ),
      );
      if (result == null) return;
      note = result;
    } else {
      final ok = await showConfirmSheet(
        context: context,
        title: widget.approveLabel,
        message: widget.approveMessage,
        confirmLabel: widget.approveLabel,
      );
      if (!ok) return;
    }
    await _run(() => widget.onApprove(note));
  }

  Future<void> _reject() async {
    final reason = await showAppBottomSheet<String>(
      context: context,
      title: 'Từ chối',
      builder: (_) => const _ReasonForm(
        label: 'Lý do từ chối',
        message: 'Lý do sẽ được gửi tới người yêu cầu.',
        submitLabel: 'Xác nhận từ chối',
        required: true,
      ),
    );
    if (reason == null) return;
    await _run(() => widget.onReject(reason));
  }

  @override
  Widget build(BuildContext context) => StickyBottomBar(
    child: Row(
      children: [
        Expanded(
          child: AppButton.outline(label: 'Từ chối', icon: AppIcons.close, onPressed: _busy ? null : _reject),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: AppButton(label: widget.approveLabel, icon: AppIcons.check, loading: _busy, onPressed: _approve),
        ),
      ],
    ),
  );
}

class _ReasonForm extends StatefulWidget {
  const _ReasonForm({required this.label, required this.message, required this.submitLabel, required this.required});

  final String label;
  final String message;
  final String submitLabel;
  final bool required;

  @override
  State<_ReasonForm> createState() => _ReasonFormState();
}

class _ReasonFormState extends State<_ReasonForm> {
  final _form = GlobalKey<FormState>();
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.message, style: context.text.small),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: widget.label,
          requiredField: widget.required,
          controller: _text,
          maxLines: 3,
          maxLength: 500,
          autofocus: true,
          validator: widget.required
              ? (v) => (v == null || v.trim().length < 3) ? 'Nhập lý do (tối thiểu 3 ký tự)' : null
              : null,
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: widget.submitLabel,
          variant: widget.required ? AppButtonVariant.danger : AppButtonVariant.primary,
          expand: true,
          onPressed: () {
            if (_form.currentState!.validate()) Navigator.of(context).pop(_text.text.trim());
          },
        ),
      ],
    ),
  );
}

/// Chạy thao tác duyệt; thành công ⇒ làm mới dữ liệu và quay lại danh sách.
Future<bool> runReview(BuildContext context, WidgetRef ref, Future<void> Function() action, String success) async {
  final ok = await runAction(context, () => action().then((_) => true), success: success);
  if (ok == true && context.mounted) {
    ref.read(dataRevisionProvider.notifier).bump();
    context.pop();
  }
  return ok ?? false;
}
