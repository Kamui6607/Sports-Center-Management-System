import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../data/training_repository_provider.dart';
import '../domain/entities/training.dart';

/// Một dòng chỉ số đang nhập: tên, giá trị số, đơn vị, ghi chú chữ (tùy chọn) — L9.
class _MetricRow {
  final name = TextEditingController();
  final value = TextEditingController();
  final unit = TextEditingController();
  final note = TextEditingController();

  void dispose() {
    name.dispose();
    value.dispose();
    unit.dispose();
    note.dispose();
  }

  bool get isBlank => name.text.trim().isEmpty && value.text.trim().isEmpty && note.text.trim().isEmpty;
}

/// HLV ghi kết quả buổi tập: ngày, chỉ số (số + đơn vị + ghi chú), nhận xét.
class ResultForm extends ConsumerStatefulWidget {
  const ResultForm({super.key, required this.plan});

  final TrainingPlan plan;

  @override
  ConsumerState<ResultForm> createState() => _ResultFormState();
}

class _ResultFormState extends ConsumerState<ResultForm> with SubmittingState {
  DateTime _date = DateTime.now();
  final _form = GlobalKey<FormState>();
  final _note = TextEditingController();
  final _metrics = [_MetricRow()];

  @override
  void dispose() {
    _note.dispose();
    for (final m in _metrics) {
      m.dispose();
    }
    super.dispose();
  }

  static double? _number(String raw) => double.tryParse(raw.trim().replaceAll(',', '.'));

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final metrics = [
      for (final m in _metrics)
        if (!m.isBlank)
          TrainingMetric(
            name: m.name.text.trim(),
            value: _number(m.value.text),
            unit: m.unit.text.trim().isEmpty ? null : m.unit.text.trim(),
            note: m.note.text.trim().isEmpty ? null : m.note.text.trim(),
          ),
    ];
    var ok = false;
    await submit(() async {
      await ref
          .read(trainingRepositoryProvider)
          .addResult(widget.plan.id, ResultDraft(date: _date, metrics: metrics, coachNote: _note.text));
      ok = true;
    });
    if (!ok || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    Navigator.of(context).pop();
    AppSnackbar.success(context, 'Đã lưu kết quả.');
  }

  Widget _metricFields(_MetricRow m) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
    child: Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: TextFormField(
                controller: m.name,
                decoration: const InputDecoration(hintText: 'Chỉ số (VD: Squat)'),
                validator: (v) => !m.isBlank && (v ?? '').trim().isEmpty ? 'Nhập tên' : null,
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              flex: 2,
              child: TextFormField(
                controller: m.value,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                decoration: const InputDecoration(hintText: 'Số'),
                // BE chỉ nhận giá trị số (vẽ biểu đồ tiến độ).
                validator: (v) => !m.isBlank && _number(v ?? '') == null ? 'Nhập số' : null,
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              flex: 2,
              child: TextFormField(
                controller: m.unit,
                decoration: const InputDecoration(hintText: 'Đơn vị'),
              ),
            ),
          ],
        ),
        TextFormField(
          controller: m.note,
          maxLength: 200,
          decoration: const InputDecoration(hintText: 'Ghi chú (tùy chọn)', counterText: ''),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DateTimeField(
          label: 'Ngày tập',
          value: _date,
          firstDate: VnTime.wall(widget.plan.startDate),
          lastDate: DateTime.now(),
          onChanged: (v) => setState(() => _date = v),
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Chỉ số', style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        for (final m in _metrics) _metricFields(m),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _metrics.add(_MetricRow())),
            icon: const Icon(AppIcons.add, size: AppSizes.iconSm),
            label: const Text('Thêm chỉ số'),
          ),
        ),
        AppTextField(label: 'Nhận xét của HLV', controller: _note, maxLines: 3, maxLength: 500),
        if (formError != null) ...[const SizedBox(height: AppSpacing.xs), AlertBanner.error(message: formError!)],
        const SizedBox(height: AppSpacing.md),
        AppButton(label: 'Lưu kết quả', expand: true, loading: submitting, onPressed: _save),
      ],
    ),
  );
}
