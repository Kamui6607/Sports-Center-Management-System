import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../catalog/domain/entities/catalog.dart';

/// Chọn MỘT bộ môn cho khóa học (L3): từ danh mục (`GET /classes/fitness`) hoặc nhập bộ môn mới.
class SportPickerField extends StatelessWidget {
  const SportPickerField({
    super.key,
    required this.sports,
    required this.value,
    required this.onChanged,
    this.errorText,
  });

  final List<Sport> sports;

  /// Id bộ môn đang chọn (với API: chính là tên bộ môn).
  final String? value;
  final ValueChanged<String> onChanged;
  final String? errorText;

  Future<void> _enterNew(BuildContext context) async {
    final name = await showAppBottomSheet<String>(
      context: context,
      title: 'Bộ môn mới',
      builder: (_) => const _NewSportForm(),
    );
    if (name != null && name.trim().isNotEmpty) onChanged(name.trim());
  }

  @override
  Widget build(BuildContext context) {
    final current = value;
    final known = current == null || sports.any((s) => s.id == current);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SelectField<String>(
          label: 'Bộ môn',
          requiredField: true,
          options: [
            for (final s in sports) SelectOption(s.id, s.name),
            if (!known) SelectOption(current, current, subtitle: 'Bộ môn mới'),
          ],
          values: [?current],
          onChanged: (v) {
            if (v.isNotEmpty) onChanged(v.first);
          },
          errorText: errorText,
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => _enterNew(context),
            icon: const Icon(AppIcons.add, size: AppSizes.iconSm),
            label: const Text('Không có trong danh sách? Nhập bộ môn mới'),
          ),
        ),
      ],
    );
  }
}

class _NewSportForm extends StatefulWidget {
  const _NewSportForm();

  @override
  State<_NewSportForm> createState() => _NewSportFormState();
}

class _NewSportFormState extends State<_NewSportForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    if (_form.currentState!.validate()) Navigator.of(context).pop(_name.text.trim());
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          label: 'Tên bộ môn',
          controller: _name,
          hint: 'VD: Pilates, Muay Thai',
          autofocus: true,
          // BE: `fitness` dài 2–60 ký tự.
          validator: (v) {
            final t = (v ?? '').trim();
            if (t.length < 2) return 'Tối thiểu 2 ký tự';
            if (t.length > 60) return 'Tối đa 60 ký tự';
            return null;
          },
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(label: 'Dùng bộ môn này', expand: true, onPressed: _submit),
      ],
    ),
  );
}
