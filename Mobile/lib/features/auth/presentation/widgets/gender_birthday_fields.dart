import 'package:flutter/material.dart';

import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/app_user.dart';
import '../auth_labels.dart';

/// Hàng "Giới tính + Ngày sinh" dùng chung cho form Đăng ký và Hồ sơ cá nhân.
class GenderBirthdayFields extends StatelessWidget {
  const GenderBirthdayFields({
    super.key,
    required this.gender,
    required this.dateOfBirth,
    required this.onGenderChanged,
    required this.onDateOfBirthChanged,
  });

  final Gender? gender;
  final DateTime? dateOfBirth;
  final ValueChanged<Gender?> onGenderChanged;
  final ValueChanged<DateTime> onDateOfBirthChanged;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: SelectField<Gender>(
          label: 'Giới tính',
          options: [for (final g in Gender.values) SelectOption(g, g.label)],
          values: [?gender],
          onChanged: (v) => onGenderChanged(v.firstOrNull),
        ),
      ),
      const SizedBox(width: AppSpacing.sm),
      Expanded(
        child: DateTimeField(
          label: 'Ngày sinh',
          value: dateOfBirth,
          lastDate: DateTime.now(),
          onChanged: onDateOfBirthChanged,
        ),
      ),
    ],
  );
}
